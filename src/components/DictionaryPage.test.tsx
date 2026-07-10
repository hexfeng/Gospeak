import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DictionaryPage } from "./DictionaryPage";

const terms = [
  {
    id: "dict_agent_security",
    spoken: "agent security",
    written: "AI Agent Security",
    aliases: ["agent security project"],
    tags: ["work", "ai"],
    enabled: true,
    updatedAt: "2026-07-10T00:00:00.000Z",
  },
  {
    id: "dict_runtime_monitoring",
    spoken: "runtime monitoring",
    written: "runtime monitoring",
    aliases: ["monitoring"],
    tags: ["engineering"],
    enabled: true,
    updatedAt: "2026-07-10T00:00:00.000Z",
  },
];

function renderDictionary() {
  const props = {
    terms,
    onSaveTerm: vi.fn(),
    onDeleteTerm: vi.fn(),
    onToggleTerm: vi.fn(),
  };
  render(<DictionaryPage {...props} />);
  return props;
}

describe("DictionaryPage", () => {
  it("filters terms and opens one add dialog", async () => {
    const user = userEvent.setup();
    renderDictionary();

    await user.type(
      screen.getByRole("searchbox", { name: "Search Dictionary" }),
      "agent",
    );

    expect(screen.getByText("AI Agent Security")).toBeInTheDocument();
    expect(screen.queryByText("runtime monitoring")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Add Dictionary term" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Add Dictionary term" }),
    ).toBeInTheDocument();
  });

  it("rejects a duplicate spoken form without closing", async () => {
    const user = userEvent.setup();
    renderDictionary();

    await user.click(
      screen.getByRole("button", { name: "Add Dictionary term" }),
    );
    await user.type(screen.getByLabelText("Spoken phrase"), " Agent Security ");
    await user.type(screen.getByLabelText("Written phrase"), "Agent Security");
    await user.click(screen.getByRole("button", { name: "Save term" }));

    expect(
      screen.getByText("A term with this spoken phrase already exists."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("saves comma-separated values and returns focus to the add action", async () => {
    const user = userEvent.setup();
    const props = renderDictionary();
    const addButton = screen.getByRole("button", { name: "Add Dictionary term" });

    await user.click(addButton);
    await user.type(screen.getByLabelText("Spoken phrase"), "gospeak");
    await user.type(screen.getByLabelText("Written phrase"), "Gospeak");
    await user.type(screen.getByLabelText("Aliases"), "go speak, go-speak");
    await user.type(screen.getByLabelText("Tags"), "product, brand");
    await user.click(screen.getByRole("button", { name: "Save term" }));

    expect(props.onSaveTerm).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^dict_/),
        spoken: "gospeak",
        written: "Gospeak",
        aliases: ["go speak", "go-speak"],
        tags: ["product", "brand"],
        enabled: true,
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(addButton).toHaveFocus();
  });

  it("edits an existing term without changing its id", async () => {
    const user = userEvent.setup();
    const props = renderDictionary();

    await user.click(screen.getByRole("button", { name: "Edit AI Agent Security" }));
    await user.clear(screen.getByLabelText("Written phrase"));
    await user.type(screen.getByLabelText("Written phrase"), "Agent Security");
    await user.click(screen.getByRole("button", { name: "Save term" }));

    expect(props.onSaveTerm).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "dict_agent_security",
        written: "Agent Security",
      }),
    );
  });

  it("duplicates, toggles, and soft-deletes through its callbacks", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const props = renderDictionary();
    const row = screen
      .getByRole("button", { name: "Edit AI Agent Security" })
      .closest("article");

    expect(row).not.toBeNull();

    await user.click(
      screen.getByRole("checkbox", { name: "Enable AI Agent Security" }),
    );
    await user.click(
      screen.getByLabelText("More actions for AI Agent Security"),
    );
    await user.click(within(row!).getByRole("button", { name: "Duplicate" }));

    expect(
      screen.getByRole("dialog", { name: "Duplicate Dictionary term" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(
      screen.getByLabelText("More actions for AI Agent Security"),
    );
    await user.click(within(row!).getByRole("button", { name: "Delete" }));

    expect(props.onToggleTerm).toHaveBeenCalledWith(terms[0], false);
    expect(confirm).toHaveBeenCalledWith("Delete AI Agent Security?");
    expect(props.onDeleteTerm).toHaveBeenCalledWith(terms[0]);
    confirm.mockRestore();
  });
});
