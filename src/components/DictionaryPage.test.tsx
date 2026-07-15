import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DictionaryTerm } from "../domain/config";
import { DictionaryPage } from "./DictionaryPage";

const terms: DictionaryTerm[] = [
  {
    id: "dict_agent_security",
    spoken: "agent security",
    written: "AI Agent Security",
    type: "technical-term",
    aliases: ["agent security project"],
    tags: ["work", "ai", "security"],
    enabled: true,
    updatedAt: "2026-07-10T00:00:00.000Z",
  },
  {
    id: "dict_gospeak",
    spoken: "go speak",
    written: "Gospeak",
    type: "brand-product",
    aliases: [],
    tags: ["product"],
    enabled: false,
    updatedAt: "2026-07-11T00:00:00.000Z",
  },
];

function renderDictionary() {
  const props = {
    terms,
    onSaveTerm: vi.fn(async () => undefined),
    onDeleteTerm: vi.fn(async () => undefined),
    onToggleTerm: vi.fn(async () => undefined),
  };
  render(<DictionaryPage {...props} />);
  return props;
}

describe("DictionaryPage", () => {
  it("searches and filters the global term table", async () => {
    const user = userEvent.setup();
    renderDictionary();

    expect(screen.getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filter by type"), "brand-product");
    expect(screen.getByText("Gospeak")).toBeInTheDocument();
    expect(screen.queryByText("AI Agent Security")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filter by type"), "all");
    await user.type(screen.getByLabelText("Search Dictionary"), "security project");
    expect(screen.getByText("AI Agent Security")).toBeInTheDocument();
    expect(screen.queryByText("Gospeak")).not.toBeInTheDocument();
  });

  it("saves type and deduplicated tags", async () => {
    const user = userEvent.setup();
    const props = renderDictionary();

    await user.click(screen.getByRole("button", { name: "Add term" }));
    await user.type(screen.getByLabelText("Spoken phrase"), "open ai");
    await user.type(screen.getByLabelText("Written phrase"), "OpenAI");
    await user.selectOptions(screen.getByLabelText("Type"), "organization");
    await user.type(screen.getByLabelText("Tags"), "AI, ai, work");
    await user.click(screen.getByRole("button", { name: "Save term" }));

    expect(props.onSaveTerm).toHaveBeenCalledWith(
      expect.objectContaining({
        spoken: "open ai",
        written: "OpenAI",
        type: "organization",
        tags: ["AI", "work"],
      }),
    );
  });

  it("duplicates metadata but requires a new spoken phrase", async () => {
    const user = userEvent.setup();
    renderDictionary();
    const row = screen.getByText("AI Agent Security").closest("tr")!;

    await user.click(within(row).getByRole("button", { name: /More actions/i }));
    await user.click(within(row).getByRole("button", { name: "Duplicate" }));

    expect(screen.getByLabelText("Spoken phrase")).toHaveValue("");
    expect(screen.getByLabelText("Written phrase")).toHaveValue("AI Agent Security");
    expect(screen.getByLabelText("Type")).toHaveValue("technical-term");
  });

  it("toggles and deletes through callbacks", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const props = renderDictionary();
    const row = screen.getByText("AI Agent Security").closest("tr")!;

    await user.click(within(row).getByRole("checkbox", { name: "Enable AI Agent Security" }));
    expect(props.onToggleTerm).toHaveBeenCalledWith(terms[0], false);

    await user.click(within(row).getByRole("button", { name: /More actions/i }));
    await user.click(within(row).getByRole("button", { name: "Delete" }));
    expect(props.onDeleteTerm).toHaveBeenCalledWith(terms[0]);
    confirm.mockRestore();
  });

  it("clears a filtered empty state instead of suggesting a new term", async () => {
    const user = userEvent.setup();
    renderDictionary();

    await user.type(screen.getByLabelText("Search Dictionary"), "no match");
    expect(screen.getByText(/No Dictionary terms match/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByText("AI Agent Security")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("restores the toggle and reports a failed status update", async () => {
    const user = userEvent.setup();
    const props = renderDictionary();
    props.onToggleTerm.mockRejectedValueOnce(new Error("disk full"));
    const row = screen.getByText("AI Agent Security").closest("tr")!;

    await user.click(within(row).getByRole("checkbox", { name: "Enable AI Agent Security" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("previous status was restored");
    expect(within(row).getByRole("checkbox")).toBeChecked();
  });

  it("returns to the last valid page when the final page becomes empty", async () => {
    const user = userEvent.setup();
    const manyTerms = Array.from({ length: 51 }, (_, index): DictionaryTerm => ({
      id: `term_${index}`,
      spoken: `term ${String(index).padStart(2, "0")}`,
      written: `Term ${index}`,
      type: "other",
      aliases: [],
      tags: [],
      enabled: true,
      updatedAt: "2026-07-15T00:00:00.000Z",
    }));
    const callbacks = {
      onSaveTerm: vi.fn(async () => undefined),
      onDeleteTerm: vi.fn(async () => undefined),
      onToggleTerm: vi.fn(async () => undefined),
    };
    const view = render(<DictionaryPage {...callbacks} terms={manyTerms} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Term 50")).toBeInTheDocument();

    view.rerender(<DictionaryPage {...callbacks} terms={manyTerms.slice(0, 50)} />);

    expect(screen.getByText("Term 0")).toBeInTheDocument();
    expect(screen.queryByText(/No Dictionary terms match/)).not.toBeInTheDocument();
  });
});
