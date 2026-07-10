import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import type { DictionaryTerm } from "../domain/config";

type DictionaryPageProps = {
  terms: DictionaryTerm[];
  onSaveTerm: (term: DictionaryTerm) => Promise<void>;
  onDeleteTerm: (term: DictionaryTerm) => void;
  onToggleTerm: (term: DictionaryTerm, enabled: boolean) => void;
};

type DictionaryDialogState =
  | { mode: "new"; seed?: DictionaryTerm; spoken?: string }
  | { mode: "edit"; term: DictionaryTerm }
  | null;

type DictionaryDraft = {
  spoken: string;
  written: string;
  aliases: string;
  tags: string;
};

function normalizeSpoken(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matches(term: DictionaryTerm, query: string): boolean {
  return [term.spoken, term.written, ...term.aliases, ...term.tags]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDraft(term?: DictionaryTerm): DictionaryDraft {
  return {
    spoken: term?.spoken ?? "",
    written: term?.written ?? "",
    aliases: term?.aliases.join(", ") ?? "",
    tags: term?.tags.join(", ") ?? "",
  };
}

export function DictionaryPage(props: DictionaryPageProps) {
  const [query, setQuery] = useState("");
  const [dialogState, setDialogState] = useState<DictionaryDialogState>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const visible = props.terms.filter((term) => matches(term, query));

  useEffect(() => {
    if (!dialogState) openerRef.current?.focus();
  }, [dialogState]);

  function openDialog(state: Exclude<DictionaryDialogState, null>, target: HTMLElement) {
    openerRef.current = target;
    setDialogState(state);
  }

  return (
    <section className="module-panel dictionary-page" aria-labelledby="dictionary-title">
      <header className="page-heading">
        <div>
          <h1 id="dictionary-title">Dictionary</h1>
          <p>{props.terms.length} terms</p>
        </div>
        <button
          aria-label="Add Dictionary term"
          onClick={(event) => openDialog({ mode: "new" }, event.currentTarget)}
          title="Add Dictionary term"
          type="button"
        >
          <Plus size={17} />
        </button>
      </header>
      <input
        aria-label="Search Dictionary"
        onChange={(event) => setQuery(event.target.value)}
        role="searchbox"
        value={query}
      />
      <div className="dictionary-rows">
        {visible.map((term) => (
          <article className="dictionary-row" key={term.id}>
            <button
              aria-label={`Edit ${term.written}`}
              onClick={(event) =>
                openDialog({ mode: "edit", term }, event.currentTarget)
              }
              type="button"
            >
              <span>{term.spoken}</span>
              <strong>{term.written}</strong>
            </button>
            <span>{[...term.aliases, ...term.tags].join(", ")}</span>
            <input
              aria-label={`Enable ${term.written}`}
              checked={term.enabled}
              onChange={(event) => props.onToggleTerm(term, event.target.checked)}
              type="checkbox"
            />
            <details className="row-menu">
              <summary aria-label={`More actions for ${term.written}`} title="More actions">
                <MoreHorizontal size={17} />
              </summary>
              <button
                onClick={(event) =>
                  openDialog({ mode: "new", seed: term }, event.currentTarget)
                }
                type="button"
              >
                Duplicate
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete ${term.written}?`)) props.onDeleteTerm(term);
                }}
                type="button"
              >
                Delete
              </button>
            </details>
          </article>
        ))}
        {visible.length === 0 ? (
          <p className="empty-note">
            {query.trim()
              ? `No Dictionary terms match "${query.trim()}".`
              : "No Dictionary terms yet."}
            <button
              aria-label={
                query.trim()
                  ? `Add "${query.trim()}" to Dictionary`
                  : "Add first Dictionary term"
              }
              onClick={(event) =>
                openDialog(
                  { mode: "new", spoken: query.trim() || undefined },
                  event.currentTarget,
                )
              }
              type="button"
            >
              Add term
            </button>
          </p>
        ) : null}
      </div>
      {dialogState ? (
        <DictionaryDialog
          onClose={() => setDialogState(null)}
          onSave={props.onSaveTerm}
          state={dialogState}
          terms={props.terms}
        />
      ) : null}
    </section>
  );
}

type DictionaryDialogProps = {
  state: Exclude<DictionaryDialogState, null>;
  terms: DictionaryTerm[];
  onClose: () => void;
  onSave: (term: DictionaryTerm) => Promise<void>;
};

function DictionaryDialog(props: DictionaryDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<DictionaryDraft>(() => ({
    ...toDraft(props.state.mode === "edit" ? props.state.term : props.state.seed),
    spoken: props.state.mode === "new" ? props.state.spoken ?? props.state.seed?.spoken ?? "" : props.state.term.spoken,
  }));
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const editingTerm = props.state.mode === "edit" ? props.state.term : undefined;
  const seedTerm = props.state.mode === "new" ? props.state.seed : undefined;

  const title =
    editingTerm
      ? "Edit Dictionary term"
      : seedTerm
        ? "Duplicate Dictionary term"
        : "Add Dictionary term";

  function closeDialog() {
    dialogRef.current?.close();
    props.onClose();
  }

  async function saveTerm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.spoken.trim() || !draft.written.trim()) {
      setError("Spoken and written phrases are required.");
      return;
    }

    const currentId = editingTerm?.id;
    if (
      props.terms.some(
        (term) =>
          term.id !== currentId &&
          normalizeSpoken(term.spoken) === normalizeSpoken(draft.spoken),
      )
    ) {
      setError("A term with this spoken phrase already exists.");
      return;
    }

    try {
      await props.onSave({
        id: currentId ?? `dict_${crypto.randomUUID()}`,
        spoken: draft.spoken.trim(),
        written: draft.written.trim(),
        aliases: splitList(draft.aliases),
        tags: splitList(draft.tags),
        enabled:
          editingTerm?.enabled ?? seedTerm?.enabled ?? true,
        updatedAt: new Date().toISOString(),
      });
      closeDialog();
    } catch {
      setError("Couldn't save this Dictionary term. Try again.");
    }
  }

  return (
    <dialog aria-label={title} onClose={props.onClose} ref={dialogRef}>
      <form onSubmit={saveTerm}>
        <h2>{title}</h2>
        <label>
          Spoken phrase
          <input
            autoFocus
            onChange={(event) => setDraft((current) => ({ ...current, spoken: event.target.value }))}
            value={draft.spoken}
          />
        </label>
        <label>
          Written phrase
          <input
            onChange={(event) => setDraft((current) => ({ ...current, written: event.target.value }))}
            value={draft.written}
          />
        </label>
        <label>
          Aliases
          <input
            onChange={(event) => setDraft((current) => ({ ...current, aliases: event.target.value }))}
            value={draft.aliases}
          />
        </label>
        <label>
          Tags
          <input
            onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
            value={draft.tags}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="button-row">
          <button type="submit">Save term</button>
          <button onClick={closeDialog} type="button">Cancel</button>
        </div>
      </form>
    </dialog>
  );
}
