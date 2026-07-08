import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { listen } from "@tauri-apps/api/event";

const statusMeta: Record<
  string,
  {
    label: string;
    tone: string;
  }
> = {
  idle: { label: "ready", tone: "idle" },
  recording: { label: "\u5f55\u97f3\u4e2d", tone: "recording" },
  transcribing: { label: "\u8f6c\u8bd1\u4e2d", tone: "processing" },
  rewriting: { label: "\u8f6c\u8bd1\u4e2d", tone: "processing" },
  pasting: { label: "\u7c98\u8d34\u4e2d", tone: "pasting" },
  done: { label: "\u5b8c\u6210", tone: "done" },
  error: { label: "\u9519\u8bef", tone: "error" },
};

const waveformBars = [36, 64, 92, 64, 36];

export function RecorderOverlay({ status }: { status: string }) {
  const meta = statusMeta[status] ?? statusMeta.idle;

  return (
    <main
      aria-label="Recorder status"
      className={`recorder-overlay recorder-overlay-${meta.tone}`}
      data-status={status}
      data-tone={meta.tone}
    >
      <div className="recorder-progress" aria-hidden="true" />
      <section aria-label="Audio waveform" className="recorder-wave">
        <div className="audio-wave" aria-hidden="true">
          {waveformBars.map((height, index) => (
            <span
              data-testid="wave-bar"
              key={`${height}-${index}`}
              style={{ "--bar-height": `${height}%` } as CSSProperties}
            />
          ))}
        </div>
      </section>
      <span className="recorder-state-dot" aria-hidden="true" />
      <strong>{meta.label}</strong>
    </main>
  );
}

export function RecorderWindow() {
  const [state, setState] = useState({
    status: "idle",
    message: "Ready for dictation.",
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<typeof state>("gospeak://recorder-state", (event) => {
      setState(event.payload);
    }).then((cleanup) => {
      unlisten = cleanup;
    });
    return () => unlisten?.();
  }, []);

  return <RecorderOverlay status={state.status} />;
}
