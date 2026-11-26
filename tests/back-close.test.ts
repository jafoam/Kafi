// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { resetBackCloseForTests, useBackClose } from "../src/state/useBackClose";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tick = () => new Promise((r) => setTimeout(r, 20));

function mount(open: boolean, onClose: () => void) {
  const host = document.createElement("div");
  const root = createRoot(host);
  const Probe = ({ open }: { open: boolean }) => {
    useBackClose(open, onClose);
    return null;
  };
  const render = (o: boolean) => act(async () => root.render(createElement(Probe, { open: o })));
  return { render: (o: boolean) => render(o), unmount: () => act(async () => root.unmount()) };
}

describe("useBackClose", () => {
  afterEach(() => resetBackCloseForTests());

  it("closes the overlay on Back and leaves no extra history entry behind", async () => {
    let closed = 0;
    const m = mount(false, () => closed++);
    const before = window.history.length;
    await m.render(true);
    expect(window.history.length).toBe(before + 1);
    window.history.back();
    await tick();
    expect(closed).toBe(1);
    await m.render(false);
    await tick();
    expect(window.history.length).toBe(before + 1); // the sentinel stays in the list but is behind us
    await m.unmount();
  });

  it("removes its history entry when closed by other means, without calling onClose", async () => {
    let closed = 0;
    const m = mount(false, () => closed++);
    await m.render(true);
    await m.render(false);
    await tick();
    expect(closed).toBe(0);
    await m.unmount();
  });
});
