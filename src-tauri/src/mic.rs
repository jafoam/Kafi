use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::ipc::Channel;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicChunk {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
}

pub fn downmix_to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let inv = 1.0 / channels as f32;
    samples
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() * inv)
        .collect()
}

struct MicSession {
    stop: Arc<AtomicBool>,
    handle: JoinHandle<()>,
}

#[derive(Default)]
pub struct MicState {
    session: Mutex<Option<MicSession>>,
}

impl Drop for MicState {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

impl MicState {
    pub fn start(&self, on_chunk: Channel<MicChunk>) -> Result<u32, String> {
        self.stop()?;

        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = Arc::clone(&stop);
        let (init_tx, init_rx) = mpsc::sync_channel::<Result<u32, String>>(1);

        let handle = thread::Builder::new()
            .name("ayat-mic-capture".to_string())
            .spawn(move || {
                run_capture_loop(stop_thread, on_chunk, init_tx);
            })
            .map_err(|e| format!("Failed to spawn mic capture thread: {e}"))?;

        let sample_rate = match init_rx.recv() {
            Ok(Ok(rate)) => rate,
            Ok(Err(err)) => {
                let _ = handle.join();
                return Err(err);
            }
            Err(_) => {
                let _ = handle.join();
                return Err("Mic capture thread exited before initialization".to_string());
            }
        };

        let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(MicSession { stop, handle });
        Ok(sample_rate)
    }

    pub fn stop(&self) -> Result<(), String> {
        let session = {
            let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
            guard.take()
        };
        if let Some(session) = session {
            session.stop.store(true, Ordering::Release);
            session.handle.thread().unpark();
            let _ = session.handle.join();
        }
        Ok(())
    }
}

fn push_mono_and_flush(
    mono: &[f32],
    buffer: &mut Vec<f32>,
    chunk_len: usize,
    sample_rate: u32,
    on_chunk: &Channel<MicChunk>,
    stop: &AtomicBool,
) {
    buffer.extend_from_slice(mono);
    while buffer.len() >= chunk_len {
        let samples: Vec<f32> = buffer.drain(..chunk_len).collect();
        if on_chunk
            .send(MicChunk {
                samples,
                sample_rate,
            })
            .is_err()
        {
            stop.store(true, Ordering::Release);
            break;
        }
    }
}

fn run_capture_loop(
    stop: Arc<AtomicBool>,
    on_chunk: Channel<MicChunk>,
    init_tx: mpsc::SyncSender<Result<u32, String>>,
) {
    let host = cpal::default_host();
    let Some(device) = host.default_input_device() else {
        let _ = init_tx.send(Err("No default audio input device found".to_string()));
        return;
    };

    let config = match device.default_input_config() {
        Ok(cfg) => cfg,
        Err(e) => {
            let _ = init_tx.send(Err(format!("Failed to get default input config: {e}")));
            return;
        }
    };

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;
    let chunk_len = (sample_rate as usize / 10).max(1);
    let sample_format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.into();

    let err_stop = Arc::clone(&stop);
    let err_fn = move |err: cpal::StreamError| {
        eprintln!("cpal input stream error: {err}");
        err_stop.store(true, Ordering::Release);
    };

    let cb_stop = Arc::clone(&stop);
    let mut buffer = Vec::<f32>::with_capacity(chunk_len * 2);

    let stream = match sample_format {
        SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _| {
                if cb_stop.load(Ordering::Relaxed) {
                    return;
                }
                let mono = downmix_to_mono(data, channels);
                push_mono_and_flush(&mono, &mut buffer, chunk_len, sample_rate, &on_chunk, &cb_stop);
            },
            err_fn,
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _| {
                if cb_stop.load(Ordering::Relaxed) {
                    return;
                }
                let f32_samples: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                let mono = downmix_to_mono(&f32_samples, channels);
                push_mono_and_flush(&mono, &mut buffer, chunk_len, sample_rate, &on_chunk, &cb_stop);
            },
            err_fn,
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _| {
                if cb_stop.load(Ordering::Relaxed) {
                    return;
                }
                let f32_samples: Vec<f32> = data
                    .iter()
                    .map(|&s| (s as f32 - 32768.0) / 32768.0)
                    .collect();
                let mono = downmix_to_mono(&f32_samples, channels);
                push_mono_and_flush(&mono, &mut buffer, chunk_len, sample_rate, &on_chunk, &cb_stop);
            },
            err_fn,
            None,
        ),
        other => {
            let _ = init_tx.send(Err(format!("Unsupported audio sample format: {other:?}")));
            return;
        }
    };

    let stream = match stream {
        Ok(s) => s,
        Err(e) => {
            let _ = init_tx.send(Err(format!("Failed to build input stream: {e}")));
            return;
        }
    };

    if let Err(e) = stream.play() {
        let _ = init_tx.send(Err(format!("Failed to start input stream: {e}")));
        return;
    }

    let _ = init_tx.send(Ok(sample_rate));

    while !stop.load(Ordering::Acquire) {
        thread::park_timeout(Duration::from_millis(50));
    }

    drop(stream);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_downmix_stereo_to_mono() {
        assert_eq!(downmix_to_mono(&[0.5, -0.5, 1.0, 0.0], 2), vec![0.0, 0.5]);
        assert_eq!(downmix_to_mono(&[0.25, -0.25], 1), vec![0.25, -0.25]);
    }
}
