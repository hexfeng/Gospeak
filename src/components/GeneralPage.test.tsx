import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "../domain/config";
import { GeneralPage } from "./GeneralPage";

describe("GeneralPage", () => {
  it("shows readiness, usage, cost, and profile navigation", async () => {
    const user = userEvent.setup();
    const onOpenProfiles = vi.fn();
    render(
      <GeneralPage
        config={DEFAULT_APP_CONFIG}
        keyPresence={{ groq: true, openai: true }}
        profiles={DEFAULT_APP_CONFIG.promptProfiles}
        usageEvents={[]}
        isDictationBusy={false}
        dictationLabel="Start Dictation"
        diagnostics={null}
        onStartDictation={vi.fn()}
        onOpenProfiles={onOpenProfiles}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Today's usage")).toBeInTheDocument();
    expect(screen.getByText("This month's cost")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Profiles" }));
    expect(onOpenProfiles).toHaveBeenCalledOnce();
  });
});
