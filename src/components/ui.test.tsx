import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, Card, PageHeader } from "./ui";

describe("shared UI components", () => {
  it("renders a page title, description, and optional action", () => {
    render(
      <PageHeader
        action={<button type="button">Add item</button>}
        description="Manage saved items."
        title="Items"
        titleId="items-title"
      />,
    );

    expect(screen.getByRole("heading", { name: "Items" })).toHaveAttribute("id", "items-title");
    expect(screen.getByText("Manage saved items.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
  });

  it("forwards native section attributes and custom classes", () => {
    render(<Card aria-label="Saved items" className="custom-card">Content</Card>);

    expect(screen.getByRole("region", { name: "Saved items" })).toHaveClass("ui-card", "custom-card");
  });

  it("forwards button behavior, native attributes, variants, and refs", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button className="custom-button" onClick={onClick} ref={ref} type="button" variant="primary">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("ui-button", "ui-button-primary", "custom-button");
    expect(ref.current).toBe(button);
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("preserves native disabled behavior", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Delete</Button>);

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("ui-button-secondary");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
