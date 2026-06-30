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
  idle: {
    label: "ready",
    tone: "idle",
  },
  recording: {
    label: "speaking",
    tone: "recording",
  },
  transcribing: {
    label: "转译中",
    tone: "processing",
  },
  rewriting: {
    label: "润色中",
    tone: "processing",
  },
  pasting: {
    label: "粘贴中",
    tone: "pasting",
  },
  done: {
    label: "完成",
    tone: "done",
  },
  error: {
    label: "错误",
    tone: "error",
  },
};

const waveformBars = [16, 28, 42, 58, 76, 58, 42, 28, 16];

export function RecorderOverlay({
  status,
}: {
  status: string;
}) {
  const meta = statusMeta[status] ?? statusMeta.idle;
  const isSpeaking = status === "recording";

  return (
    <main
      aria-label="Recorder status"
      className={`recorder-overlay recorder-overlay-${meta.tone}`}
      data-status={status}
      data-tone={meta.tone}
    >
      <section
        aria-label="Audio waveform"
        className="recorder-audio-card"
        data-active={isSpeaking ? "true" : "false"}
      >
        <div className="audio-wave" aria-hidden="true">
          {waveformBars.map((height, index) => (
            <span
              data-testid="wave-bar"
              key={`${height}-${index}`}
              style={{ "--bar-height": `${height}%` } as CSSProperties}
            />
          ))}
        </div>
        <span>Audio</span>
      </section>

      <div className="recorder-status-pill">
        <span className="recorder-state-dot" aria-hidden="true" />
        <strong>{meta.label}</strong>
      </div>
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

  return (
    <RecorderOverlay
      status={state.status}
    />
  );
}
