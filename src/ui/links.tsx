import { DOC_LABEL, MATERIALS, type SimState } from '../engine';
import { go } from '../app/hooks';
import { cx } from './kit';

/** Clickable document number — opens the document center. */
export function DocLink({ id, s, className, showType }: { id?: string; s?: SimState; className?: string; showType?: boolean }) {
  if (!id) return <span className="text-ink-4">—</span>;
  const d = s?.docs[id];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        go(`#/documents/${encodeURIComponent(id)}`);
      }}
      className={cx('mono cursor-pointer rounded text-[oklch(0.8_0.1_248)] underline-offset-2 hover:underline', className)}
      title={d ? `${DOC_LABEL[d.type]} ${id}` : id}
    >
      {showType && d ? <span className="mr-1 font-sans text-ink-3">{DOC_LABEL[d.type]}</span> : null}
      {id}
    </button>
  );
}

export function MatName({ id, short }: { id: string; short?: boolean }) {
  const m = MATERIALS[id];
  if (!m) return <span>{id}</span>;
  return (
    <span className="min-w-0">
      {!short && <span className="mono mr-1.5 text-ink-3">{m.id}</span>}
      <span className="text-ink">{m.name}</span>
    </span>
  );
}
