import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG } from "../domain/config";
import { GeneralPage } from "./GeneralPage";

describe("GeneralPage", () => {
  it("shows all-time usage and routes ready status cards", async () => {
    const user = userEvent.setup();
    const onOpenProfiles = vi.fn();
    const onOpenSettings = vi.fn();
    const { container } = render(
      <GeneralPage
        config={DEFAULT_APP_CONFIG}
        keyPresence={{ groq: true, openai: true }}
        profiles={DEFAULT_APP_CONFIG.promptProfiles}
        usageEvents={[]}
        onOpenProfiles={onOpenProfiles}
        onOpenSettings={onOpenSettings}
      />,
    );

    expect(screen.getByRole("heading", { name: "Gospeak" })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.textContent === "Press Alt+Space to start dictating.",
      ),
    ).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll(".hotkey-key")).map((element) => element.textContent),
    ).toEqual(["Alt", "Space"]);
    expect(container.querySelector(".hotkey-separator")?.textContent).toBe("+");
    expect(screen.getByText("Total dictation time")).toBeInTheDocument();
    expect(screen.getByText("Total characters")).toBeInTheDocument();
    expect(screen.getByText("Usage mode")).toBeInTheDocument();
    expect(screen.getByText("Total cost")).toBeInTheDocument();
    expect(screen.getByText("Cloud")).toBeInTheDocument();
    expect(screen.getByText("Ready to dictate")).toBeInTheDocument();
    expect(screen.getByText("Gospeak is ready when you are.")).toBeInTheDocument();
    expect(screen.getByText("Dictation activity (7 days)")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Last 7 days of dictation minutes" })).toBeInTheDocument();
    expect(screen.getByText("Speech-to-text model - ASR")).toBeInTheDocument();
    expect(screen.getByText("Speech recognition provider used before rewrite.")).toBeInTheDocument();
    expect(screen.getByText("Rewrite model")).toBeInTheDocument();
    expect(screen.getByText("Writing model that cleans up the recognized text.")).toBeInTheDocument();
    expect(screen.getByText("Active Profile")).toBeInTheDocument();
    expect(screen.getByText("Current writing behavior used for new dictation.")).toBeInTheDocument();
    expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Dictation/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Speech-to-text model - ASR/i }));
    await user.click(screen.getByRole("button", { name: /Rewrite model/i }));
    await user.click(screen.getByRole("button", { name: /Active Profile/i }));

    expect(onOpenSettings).toHaveBeenNthCalledWith(1, "providers");
    expect(onOpenSettings).toHaveBeenNthCalledWith(2, "providers");
    expect(onOpenProfiles).toHaveBeenCalledOnce();
  });

  it("marks missing provider keys and active Profile as not set", () => {
    const { container } = render(
      <GeneralPage
        config={{ ...DEFAULT_APP_CONFIG, activeProfileId: "missing" }}
        keyPresence={{}}
        profiles={DEFAULT_APP_CONFIG.promptProfiles}
        usageEvents={[]}
        onOpenProfiles={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".general-status-card.is-not-ready")).toHaveLength(3);
    expect(
      Array.from(container.querySelectorAll(".general-status-value")),
    ).toHaveLength(3);
    expect(
      Array.from(container.querySelectorAll(".general-status-value")).map(
        (element) => element.textContent,
      ),
    ).toEqual(["Not Set", "Not Set", "Not Set"]);
  });

  it("prompts for a shortcut when the hotkey is missing", () => {
    render(
      <GeneralPage
        config={{
          ...DEFAULT_APP_CONFIG,
          hotkey: { ...DEFAULT_APP_CONFIG.hotkey, binding: "   " },
        }}
        keyPresence={{ groq: true, openai: true }}
        profiles={DEFAULT_APP_CONFIG.promptProfiles}
        usageEvents={[]}
        onOpenProfiles={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Set a shortcut to start dictating.")).toBeInTheDocument();
  });
});
