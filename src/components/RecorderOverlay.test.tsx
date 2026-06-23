import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RecorderOverlay } from "./RecorderOverlay";

it("shows recorder state and requests stop", async () => {
  const onStop = vi.fn();
  render(
    <RecorderOverlay
      status="recording"
      message="Recording…"
      onStop={onStop}
    />,
  );

  expect(screen.getByText("Recording…")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /stop/i }));
  expect(onStop).toHaveBeenCalledTimes(1);
});
