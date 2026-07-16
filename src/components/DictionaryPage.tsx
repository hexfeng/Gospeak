import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import {
  DICTIONARY_TERM_TYPES,
  type DictionaryTerm,
  type DictionaryTermType,
} from "../domain/config";
import { Button, Card, PageHeader } from "./ui";

type DictionaryPageProps = {
  terms: DictionaryTerm[];
  onSaveTerm: (term: DictionaryTerm) => Promise<void>;
  onDeleteTerm: (term: DictionaryTerm) => Promise<void>;
  onToggleTerm: (term: DictionaryTerm, enabled: boolean) => Promise<void>;
};

type DictionaryDialogState =
  | { mode: "new"; seed?: DictionaryTerm; spoken?: string }
  | { mode: "edit"; term: DictionaryTerm }
  | null;

type DictionaryDraft = {
  spoken: string;
  written: string;
  type: DictionaryTermType;
  aliases: string;
  tags: string;
  enabled: boolean;
};

const PAGE_SIZE = 50;

export function DictionaryPage(props: DictionaryPageProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DictionaryTermType | "all">("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [page, setPage] = useState(1);
  const [dialogState, setDialogState] = useState<DictionaryDialogState>(null);
  const [toggleError, setToggleError] = useState("");
  const [pendingToggleId, setPendingToggleId] = useState<string>();
  const openerRef = useRef<HTMLElement | null>(null);
  const tags = useMemo(
    () => [...new Set(props.terms.flatMap((term) => term.tags))].sort((a, b) => a.localeCompare(b)),
    [props.terms],
  );
  const visible = useMemo(
    () => props.terms
      .filter((term) => matches(term, query))
      .filter((term) => typeFilter === "all" || term.type === typeFilter)
      .filter((term) => tagFilter === "all" || term.tags.includes(tagFilter))
      .filter((term) => statusFilter === "all" || term.enabled === (statusFilter === "enabled"))
      .sort((a, b) => a.spoken.localeCompare(b.spoken)),
    [props.terms, query, statusFilter, tagFilter, typeFilter],
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageTerms = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const filtersActive = Boolean(query.trim()) || typeFilter !== "all" || tagFilter !== "all" || statusFilter !== "all";
  const enabledCount = props.terms.filter((term) => term.enabled).length;

  useEffect(() => {
    if (!dialogState) openerRef.current?.focus();
  }, [dialogState]);

  function openDialog(state: Exclude<DictionaryDialogState, null>, target: HTMLElement) {
    openerRef.current = target;
    setDialogState(state);
  }

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
    setTagFilter("all");
    setStatusFilter("all");
    setPage(1);
  }

  async function toggleTerm(term: DictionaryTerm, enabled: boolean) {
    setToggleError("");
    setPendingToggleId(term.id);
    try {
      await props.onToggleTerm(term, enabled);
    } catch {
      setToggleError(`Could not update ${term.written}. The previous status was restored.`);
    } finally {
      setPendingToggleId(undefined);
    }
  }

  return (
    <section className="module-panel dictionary-page" aria-labelledby="dictionary-title">
      <PageHeader
        action={(
          <Button onClick={(event) => openDialog({ mode: "new" }, event.currentTarget)} type="button" variant="primary">
            <Plus size={16} /> Add term
          </Button>
        )}
        description={`${props.terms.length} global terms · ${enabledCount} enabled · types and tags organize this page only`}
        title="Dictionary"
        titleId="dictionary-title"
      />

      <Card aria-label="Dictionary entries" className="dictionary-card">
        <div className="dictionary-toolbar">
          <label className="dictionary-search">
            <span className="sr-only">Search Dictionary</span>
            <Search aria-hidden="true" size={16} />
            <input
              aria-label="Search Dictionary"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search spoken, written, aliases, or tags"
              type="search"
              value={query}
            />
          </label>
          <select aria-label="Filter by type" onChange={(event) => {
            setTypeFilter(event.target.value as DictionaryTermType | "all");
            setPage(1);
          }} value={typeFilter}>
            <option value="all">All types</option>
            {DICTIONARY_TERM_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
          <select aria-label="Filter by tag" onChange={(event) => {
            setTagFilter(event.target.value);
            setPage(1);
          }} value={tagFilter}>
            <option value="all">All tags</option>
            {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          <select aria-label="Filter by status" onChange={(event) => {
            setStatusFilter(event.target.value as typeof statusFilter);
            setPage(1);
          }} value={statusFilter}>
            <option value="all">All statuses</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
          {filtersActive ? <Button onClick={clearFilters} type="button">Clear filters</Button> : null}
        </div>

        {toggleError ? <p className="app-message" role="alert">{toggleError}</p> : null}

        {pageTerms.length ? (
          <div className="dictionary-table-wrap">
          <table className="dictionary-table">
            <thead>
              <tr>
                <th>Spoken phrase</th>
                <th>Written phrase</th>
                <th>Type</th>
                <th>Tags</th>
                <th>Status</th>
                <th>Updated</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {pageTerms.map((term) => (
                <tr className={term.enabled ? undefined : "is-disabled"} key={term.id}>
                  <td>
                    <button className="dictionary-term-link" onClick={(event) => openDialog({ mode: "edit", term }, event.currentTarget)} type="button">
                      <strong>{term.spoken}</strong>
                      {term.aliases.length ? <small>{term.aliases.join(", ")}</small> : null}
                    </button>
                  </td>
                  <td>{term.written}</td>
                  <td><span className="term-type">{typeLabel(term.type)}</span></td>
                  <td><TagSummary tags={term.tags} /></td>
                  <td>
                    <label className="status-toggle">
                      <span className="sr-only">Enable {term.written}</span>
                      <input checked={term.enabled} disabled={pendingToggleId === term.id} onChange={(event) => void toggleTerm(term, event.target.checked)} type="checkbox" />
                    </label>
                  </td>
                  <td>{formatDate(term.updatedAt)}</td>
                  <td>
                    <details className="row-menu">
                      <summary aria-label={`More actions for ${term.written}`} role="button"><MoreHorizontal size={17} /></summary>
                      <div>
                        <Button onClick={(event) => openDialog({ mode: "edit", term }, event.currentTarget)} type="button">Edit</Button>
                        <Button onClick={(event) => openDialog({ mode: "new", seed: term }, event.currentTarget)} type="button">Duplicate</Button>
                        <Button onClick={() => {
                          if (window.confirm(`Delete ${term.written}?`)) props.onDeleteTerm(term);
                        }} type="button" variant="danger">Delete</Button>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          props.terms.length === 0 ? (
            <p className="empty-note">No Dictionary terms yet. Add the first global term. <Button onClick={(event) => openDialog({ mode: "new" }, event.currentTarget)} type="button">Add first term</Button></p>
        ) : (
          <p className="empty-note">
            {query.trim() ? `No Dictionary terms match "${query.trim()}".` : "No Dictionary terms match these filters."}
          </p>
          )
        )}

        <footer className="dictionary-pagination">
          <span>{visible.length} result{visible.length === 1 ? "" : "s"} · 50 per page</span>
          {pageCount > 1 ? (
            <div>
              <Button disabled={currentPage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">Previous</Button>
              <span>Page {currentPage} of {pageCount}</span>
              <Button disabled={currentPage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} type="button">Next</Button>
            </div>
          ) : null}
        </footer>
      </Card>

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

function DictionaryDialog(props: {
  state: Exclude<DictionaryDialogState, null>;
  terms: DictionaryTerm[];
  onClose: () => void;
  onSave: (term: DictionaryTerm) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editingTerm = props.state.mode === "edit" ? props.state.term : undefined;
  const seedTerm = props.state.mode === "new" ? props.state.seed : undefined;
  const [draft, setDraft] = useState<DictionaryDraft>(() => ({
    spoken:
      editingTerm?.spoken ??
      (props.state.mode === "new" ? props.state.spoken ?? "" : ""),
    written: editingTerm?.written ?? seedTerm?.written ?? "",
    type: editingTerm?.type ?? seedTerm?.type ?? "other",
    aliases: (editingTerm?.aliases ?? seedTerm?.aliases ?? []).join(", "),
    tags: (editingTerm?.tags ?? seedTerm?.tags ?? []).join(", "),
    enabled: editingTerm?.enabled ?? seedTerm?.enabled ?? true,
  }));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const title = editingTerm ? "Edit Dictionary term" : seedTerm ? "Duplicate Dictionary term" : "Add Dictionary term";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.spoken.trim() || !draft.written.trim()) {
      setError("Spoken and written phrases are required.");
      return;
    }
    if (props.terms.some((term) => term.id !== editingTerm?.id && normalize(term.spoken) === normalize(draft.spoken))) {
      setError("A term with this spoken phrase already exists.");
      return;
    }
    setIsSaving(true);
    try {
      await props.onSave({
        id: editingTerm?.id ?? `dict_${crypto.randomUUID()}`,
        spoken: draft.spoken.trim(),
        written: draft.written.trim(),
        type: draft.type,
        aliases: splitList(draft.aliases),
        tags: splitList(draft.tags),
        enabled: draft.enabled,
        updatedAt: new Date().toISOString(),
      });
      dialogRef.current?.close();
      props.onClose();
    } catch {
      setError("Couldn't save this Dictionary term. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <dialog aria-label={title} onClose={props.onClose} ref={dialogRef}>
      <form onSubmit={save}>
        <h2>{title}</h2>
        <label>Spoken phrase<input autoFocus onChange={(event) => setDraft((current) => ({ ...current, spoken: event.target.value }))} value={draft.spoken} /></label>
        <label>Written phrase<input onChange={(event) => setDraft((current) => ({ ...current, written: event.target.value }))} value={draft.written} /></label>
        <label>
          Type
          <select onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as DictionaryTermType }))} value={draft.type}>
            {DICTIONARY_TERM_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
        <label>Aliases<input onChange={(event) => setDraft((current) => ({ ...current, aliases: event.target.value }))} placeholder="Comma-separated" value={draft.aliases} /></label>
        <label>Tags<input list="dictionary-tag-suggestions" onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="Comma-separated" value={draft.tags} /></label>
        <datalist id="dictionary-tag-suggestions">{[...new Set(props.terms.flatMap((term) => term.tags))].map((tag) => <option key={tag} value={tag} />)}</datalist>
        <label className="checkbox-row"><input checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" /> Enabled</label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="button-row">
          <Button disabled={isSaving} type="submit" variant="primary">Save term</Button>
          <Button onClick={props.onClose} type="button">Cancel</Button>
        </div>
      </form>
    </dialog>
  );
}

function matches(term: DictionaryTerm, query: string) {
  return [term.spoken, term.written, ...term.aliases, ...term.tags]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
}

function splitList(value: string) {
  const seen = new Set<string>();
  return value.split(",").map((item) => item.trim()).filter((item) => {
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function typeLabel(type: DictionaryTermType) {
  return DICTIONARY_TERM_TYPES.find((item) => item.id === type)?.label ?? "Other";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString();
}

function TagSummary({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="muted-value">—</span>;
  const visible = tags.slice(0, 2);
  const remaining = tags.length - visible.length;
  return (
    <span className="tag-list" aria-label={tags.join(", ")}>
      {visible.map((tag) => <span key={tag}>{tag}</span>)}
      {remaining ? <button aria-label={`Show all tags: ${tags.join(", ")}`} title={tags.slice(2).join(", ")} type="button">+{remaining}</button> : null}
    </span>
  );
}
