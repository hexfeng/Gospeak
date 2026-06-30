import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RecorderOverlay } from "./RecorderOverlay";

it("shows only the audio waveform card and compact state label", () => {
  render(
    <RecorderOverlay
      status="recording"
    />,
  );

  expect(screen.getByText("Audio")).toBeInTheDocument();
  expect(screen.getByText("speaking")).toBeInTheDocument();
  expect(screen.getByLabelText("Audio waveform")).toHaveAttribute(
    "data-active",
    "true",
  );
  expect(screen.getAllByTestId("wave-bar")).toHaveLength(9);
  expect(screen.queryByText(/temporary WAV/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument();
});

it("labels each recorder state with visible progress copy", () => {
  const states = [
    ["recording", "speaking"],
    ["transcribing", "转译中"],
    ["rewriting", "润色中"],
    ["pasting", "粘贴中"],
    ["error", "错误"],
  ] as const;

  const { rerender } = render(
    <RecorderOverlay
      status={states[0][0]}
    />,
  );

  for (const [status, label] of states) {
    rerender(
      <RecorderOverlay
        status={status}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByLabelText("Recorder status")).toHaveAttribute(
      "data-status",
      status,
    );
  }
});
