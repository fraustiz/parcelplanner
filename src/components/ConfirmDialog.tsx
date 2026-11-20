'use client';

import { useRef } from 'react';
import { useDialog } from './use-dialog';

/** The shell every confirmation in this app uses, so they all look alike. */
export function Modal(
  { title, body, onClose, children }: {
    title: string;
    body: string;
    /** The way out, for Escape. Never the action that destroys work. */
    onClose: () => void;
    children: React.ReactNode;
  },
) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, true, { onClose, modal: true });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-lg border border-[var(--raised)] bg-[var(--panel)] p-4 shadow-xl"
      >
        <h2 className="mb-2 text-sm font-medium text-[var(--text-strong)]">{title}</h2>
        <p className="mb-4 text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
        <div className="flex flex-wrap justify-end gap-2">{children}</div>
      </div>
    </div>
  );
}

/**
 * `danger` marks the button that destroys work; `quiet` is always the way out
 * and the plainest. `accent` inverts this once: in the suggestion box's
 * "not an AI" notice the coloured button is the way out, so it is read first.
 */
export function Button(
  { onClick, label, tone, autoFocus = false }: {
    onClick: () => void;
    label: string;
    tone: 'primary' | 'quiet' | 'danger' | 'accent';
    /** Takes focus when the dialog opens, in place of its first button. */
    autoFocus?: boolean;
  },
) {
  const style = {
    primary: 'border border-transparent bg-[var(--tint-accent)] text-[var(--accent)] hover:border-[var(--accent)] active:translate-y-px active:bg-[var(--tint-warm)]',
    accent: 'border border-transparent bg-[var(--tint-accent)] text-[var(--accent)] hover:border-[var(--accent)] active:translate-y-px active:bg-[var(--tint-warm)]',
    danger: 'border border-transparent bg-[var(--tint-danger)] text-[var(--danger)] hover:border-[var(--danger)] active:translate-y-px',
    quiet: 'border border-transparent text-[var(--text-muted)] hover:bg-[var(--raised)] hover:text-[var(--text-strong)] active:translate-y-px',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      data-autofocus={autoFocus ? '' : undefined}
      className={`rounded px-3 py-1.5 text-sm ${style}`}
    >
      {label}
    </button>
  );
}
