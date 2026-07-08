import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => {
  const recorder = {
    hide: vi.fn(async () => undefined),
    setPosition: vi.fn(async () => undefined),
    show: vi.fn(async () => undefined),
  };
  const main = {
    setFocus: vi.fn(async () => undefined),
    show: vi.fn(async () => undefined),
  };

  return {
    emit: vi.fn(async () => undefined),
    getByLabel: vi.fn(async (label: string) =>
      label === "recorder" ? recorder : main,
    ),
    recorder,
    main,
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: tauriMocks.emit,
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getByLabel: tauriMocks.getByLabel,
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  PhysicalPosition: class {
    x: number;
    y: number;

    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
  availableMonitors: vi.fn(async () => []),
  cursorPosition: vi.fn(async () => null),
  monitorFromPoint: vi.fn(async () => null),
  primaryMonitor: vi.fn(async () => ({
    scaleFactor: 1,
    workArea: {
      position: { x: 0, y: 0 },
      size: { width: 1000, height: 800 },
    },
  })),
}));

import { publishRecorderState } from "./tauri";

describe("publishRecorderState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ =
      {};
  });

  it("hides an error recorder pill after five seconds and focuses the main window", async () => {
    await publishRecorderState({
      status: "error",
      message: "No input microphone is available",
    });

    expect(tauriMocks.recorder.show).toHaveBeenCalledTimes(1);
    expect(tauriMocks.main.show).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);

    expect(tauriMocks.recorder.hide).toHaveBeenCalledTimes(1);
    expect(tauriMocks.main.show).toHaveBeenCalledTimes(1);
    expect(tauriMocks.main.setFocus).toHaveBeenCalledTimes(1);
  });

  it("cancels the pending error close when recording resumes", async () => {
    await publishRecorderState({
      status: "error",
      message: "No input microphone is available",
    });
    await publishRecorderState({
      status: "recording",
      message: "Recording...",
    });

    await vi.advanceTimersByTimeAsync(5000);

    expect(tauriMocks.recorder.hide).not.toHaveBeenCalled();
    expect(tauriMocks.main.show).not.toHaveBeenCalled();
  });
});
