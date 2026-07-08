import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RecorderOverlay } from "./RecorderOverlay";

it("shows only a compact waveform pill and state label", () => {
  render(<RecorderOverlay status="recording" />);

  expect(screen.getByText("\u5f55\u97f3\u4e2d")).toBeInTheDocument();
  expect(screen.getByLabelText("Audio waveform")).toBeInTheDocument();
  expect(screen.getAllByTestId("wave-bar")).toHaveLength(5);
  expect(screen.queryByText(/temporary WAV/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument();
});

it("labels each recorder state with visible progress copy", () => {
  const states = [
    ["recording", "\u5f55\u97f3\u4e2d"],
    ["transcribing", "\u8f6c\u8bd1\u4e2d"],
    ["rewriting", "\u8f6c\u8bd1\u4e2d"],
    ["pasting", "\u7c98\u8d34\u4e2d"],
    ["error", "\u9519\u8bef"],
  ] as const;

  const { rerender } = render(<RecorderOverlay status={states[0][0]} />);

  for (const [status, label] of states) {
    rerender(<RecorderOverlay status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByLabelText("Recorder status")).toHaveAttribute(
      "data-status",
      status,
    );
  }
});
