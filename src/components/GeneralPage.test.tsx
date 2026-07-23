import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_CONFIG, updateSttProvider } from "../domain/config";
import { GeneralPage } from "./GeneralPage";

describe("GeneralPage", () => {
  it("shows all-time usage and routes ready status cards", async () => {
    const user = userEvent.setup();
    const onOpenProfiles = vi.fn();
    const onOpenProviders = vi.fn();
    const { container } = render(
      <GeneralPage
        config={DEFAULT_APP_CONFIG}
        keyPresence={{ groq: true, openai: true }}
        profiles={DEFAULT_APP_CONFIG.promptProfiles}
        usageEvents={[]}
        onOpenProfiles={onOpenProfiles}
        onOpenProviders={onOpenProviders}
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
    expect(container.querySelector(".general-hero > .general-header")).toBeInTheDocument();
    expect(container.querySelector(".general-hero-divider")).toBeInTheDocument();
    expect(container.querySelector(".general-readiness")).toBeInTheDocument();
    expect(container.querySelector(".general-hero-wave")).not.toBeInTheDocument();
    expect(screen.getByText("Dictation activity (7 days)")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Last 7 days of dictation minutes" })).toBeInTheDocument();
    expect(screen.getByText("ASR model")).toBeInTheDocument();
    expect(screen.getByText("Speech recognition provider used before rewrite.")).toBeInTheDocument();
    expect(screen.getByText("Rewrite model")).toBeInTheDocument();
    expect(screen.getByText("Writing model that cleans up the recognized text.")).toBeInTheDocument();
    expect(screen.getByText("Active Profile")).toBeInTheDocument();
    expect(screen.getByText("Current writing behavior used for new dictation.")).toBeInTheDocument();
    expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start Dictation/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ASR model/i }));
    await user.click(screen.getByRole("button", { name: /Rewrite model/i }));
    await user.click(screen.getByRole("button", { name: /Active Profile/i }));

    expect(onOpenProviders).toHaveBeenCalledTimes(2);
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
        onOpenProviders={vi.fn()}
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
    expect(screen.getByRole("heading", { name: "Setup required" })).toBeInTheDocument();
    expect(screen.getByText("ASR and Rewrite missing")).toHaveClass("is-not-ready");
    expect(screen.queryByText("All systems normal")).not.toBeInTheDocument();
  });

  it("shows Local usage mode for ready Qwen Local ASR", () => {
    const localConfig = updateSttProvider(DEFAULT_APP_CONFIG, "qwen-local");
    render(
      <GeneralPage
        config={{
          ...localConfig,
          performance: { ...localConfig.performance, fastMode: true },
        }}
        keyPresence={{ openai: true }}
        profiles={DEFAULT_APP_CONFIG.promptProfiles}
        qwenLocalStatus="ready"
        usageEvents={[]}
        onOpenProfiles={vi.fn()}
        onOpenProviders={vi.fn()}
      />,
    );

    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.queryByText("Cloud")).not.toBeInTheDocument();
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
        onOpenProviders={vi.fn()}
      />,
    );

    expect(screen.getByText("Set a shortcut to start dictating.")).toBeInTheDocument();
  });
});
