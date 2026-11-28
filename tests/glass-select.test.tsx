// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlassSelect } from "../src/components/GlassSelect";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("GlassSelect", () => {
  it("opens a glass listbox, selects an option, and closes on selection or Escape", () => {
    const onChange = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        <GlassSelect
          ariaLabel="Pilih Terjemahan"
          value="id-kemenag"
          options={[
            { value: "id-kemenag", label: "Kemenag RI" },
            { value: "en-sahih", label: "Saheeh International" },
          ]}
          onChange={onChange}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      trigger.click();
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const options = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    expect(options).toHaveLength(2);

    act(() => {
      options[1].click();
    });
    expect(onChange).toHaveBeenCalledWith("en-sahih");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      trigger.click();
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
