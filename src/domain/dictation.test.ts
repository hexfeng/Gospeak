import { describe, expect, it } from "vitest";
import {
  DICTATION_INITIAL_STATE,
  dictationReducer,
  type DictationState,
} from "./dictation";

describe("dictation state machine", () => {
  it("moves through recording and processing states", () => {
    let state: DictationState = DICTATION_INITIAL_STATE;
    state = dictationReducer(state, {
      type: "recording-started",
      audioPath: "C:\\Temp\\gospeak.wav",
    });
    expect(state.status).toBe("recording");

    state = dictationReducer(state, { type: "recording-stopped" });
    expect(state.status).toBe("transcribing");

    state = dictationReducer(state, { type: "rewriting" });
    expect(state.status).toBe("rewriting");

    state = dictationReducer(state, { type: "pasting" });
    expect(state.status).toBe("pasting");

    state = dictationReducer(state, {
      type: "completed",
      message: "Pasted.",
      rewriteFallbackUsed: false,
    });
    expect(state.status).toBe("done");
    expect(state.message).toBe("Pasted.");
  });

  it("retains a recoverable error message", () => {
    const state = dictationReducer(DICTATION_INITIAL_STATE, {
      type: "failed",
      message: "Paste failed; text remains on the clipboard.",
    });

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/clipboard/i);
  });
});
