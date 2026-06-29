import { useEffect, useState } from "react";
import { Mic, Square } from "lucide-react";
import { emit, listen } from "@tauri-apps/api/event";

export function RecorderOverlay({
  status,
  message,
  onStop,
}: {
  status: string;
  message: string;
  onStop: () => void;
}) {
  return (
    <main className="recorder-overlay">
      <span className={`recorder-state-dot ${status}`} aria-hidden="true" />
      <div>
        <strong>
          <Mic size={16} /> Gospeak
        </strong>
        <p>{message}</p>
      </div>
      {status === "recording" ? (
        <button type="button" onClick={onStop}>
          <Square size={14} /> Stop
        </button>
      ) : null}
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

  async function requestStop() {
    await emit("gospeak://tray-action", "toggle");
  }

  return (
    <RecorderOverlay
      status={state.status}
      message={state.message}
      onStop={() => void requestStop()}
    />
  );
}
