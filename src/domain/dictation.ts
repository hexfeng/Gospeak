export type DictationStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "rewriting"
  | "pasting"
  | "done"
  | "error";

export type DictationState = {
  status: DictationStatus;
  audioPath: string | null;
  message: string;
  rewriteFallbackUsed: boolean;
};

export type DictationAction =
  | { type: "recording-started"; audioPath: string }
  | { type: "recording-stopped" }
  | { type: "rewriting" }
  | { type: "pasting" }
  | {
      type: "completed";
      message: string;
      rewriteFallbackUsed: boolean;
    }
  | { type: "failed"; message: string }
  | { type: "reset" };

export const DICTATION_INITIAL_STATE: DictationState = {
  status: "idle",
  audioPath: null,
  message: "Ready for dictation.",
  rewriteFallbackUsed: false,
};

export function dictationReducer(
  state: DictationState,
  action: DictationAction,
): DictationState {
  switch (action.type) {
    case "recording-started":
      return {
        status: "recording",
        audioPath: action.audioPath,
        message: "Recording…",
        rewriteFallbackUsed: false,
      };
    case "recording-stopped":
      return {
        ...state,
        status: "transcribing",
        message: "Transcribing with Groq…",
      };
    case "rewriting":
      return {
        ...state,
        status: "rewriting",
        message: "Rewriting with OpenAI…",
      };
    case "pasting":
      return { ...state, status: "pasting", message: "Pasting…" };
    case "completed":
      return {
        status: "done",
        audioPath: null,
        message: action.message,
        rewriteFallbackUsed: action.rewriteFallbackUsed,
      };
    case "failed":
      return {
        status: "error",
        audioPath: null,
        message: action.message,
        rewriteFallbackUsed: false,
      };
    case "reset":
      return DICTATION_INITIAL_STATE;
    default:
      return state;
  }
}
