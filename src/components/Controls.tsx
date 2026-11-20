'use client';

import { useEffect, useRef, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { t, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';
import { useDialog } from './use-dialog';

/** Marks that the panel has been shown once, so it stops opening by itself. */
export const CONTROLS_SEEN_KEY = 'parcelplanner.controlsSeen';

/**
 * The list of controls, and the panel that shows it. None of the gestures are
 * guessable and a shared link lands straight in the editor, so the panel
 * opens itself once, then only on request.
 */
const MOUSE: readonly { keys: string; label: TranslationKey }[] = [
  { keys: 'controls.mouse.left', label: 'controls.place' },
  { keys: 'controls.mouse.leftHold', label: 'controls.run' },
  { keys: 'controls.mouse.leftEmpty', label: 'controls.box' },
  { keys: 'controls.mouse.modClick', label: 'controls.addToSelection' },
  { keys: 'controls.mouse.leftObject', label: 'controls.moveSelection' },
  // One row for both buttons, since they do the same thing.
  { keys: 'controls.mouse.pan', label: 'controls.pan' },
  { keys: 'controls.mouse.altClick', label: 'controls.underBridge' },
  { keys: 'controls.mouse.middleClick', label: 'controls.pick' },
  { keys: 'controls.mouse.right', label: 'controls.menu' },
  { keys: 'controls.mouse.right', label: 'controls.note' },
  { keys: 'controls.mouse.right', label: 'controls.reserve' },
  { keys: 'controls.mouse.wheel', label: 'controls.zoom' },
];

const KEYS: readonly { keys: string; label: TranslationKey }[] = [
  { keys: 'R', label: 'controls.rotate' },
  { keys: 'Shift+R', label: 'controls.rotateBack' },
  { keys: 'X / H', label: 'controls.mirror' },
  { keys: 'V', label: 'controls.mirrorVertical' },
  { keys: 'Q', label: 'controls.pick' },
  { keys: 'D', label: 'controls.deleteUnderPointer' },
  { keys: 'Delete', label: 'controls.delete' },
  { keys: 'Ctrl+C', label: 'controls.copy' },
  { keys: 'Ctrl+X', label: 'controls.cut' },
  { keys: 'Ctrl+V', label: 'controls.paste' },
  { keys: 'Ctrl+Z / Ctrl+Y', label: 'controls.undo' },
  { keys: 'Escape', label: 'controls.cancel' },
  { keys: 'controls.key.tab', label: 'controls.kbFocus' },
  { keys: 'controls.key.arrows', label: 'controls.kbCursor' },
  { keys: 'controls.key.enter', label: 'controls.kbEnter' },
  { keys: 'controls.key.shiftEnter', label: 'controls.addToSelection' },
  { keys: 'controls.key.altArrows', label: 'controls.kbNudge' },
  { keys: '+ / -', label: 'controls.zoom' },
  { keys: 'Shift+F10', label: 'controls.kbMenu' },
];

/** localStorage throws rather than returning null in some private-browsing
 * modes and embedded browsers, so reads and writes are wrapped. */
function seen(): boolean {
  try {
    return window.localStorage.getItem(CONTROLS_SEEN_KEY) !== null;
  } catch {
    return true; // cannot remember, so do not pester: treat it as already shown
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(CONTROLS_SEEN_KEY, '1');
  } catch {
    // ignore: the panel simply opens again next time
  }
}

export default function Controls() {
  const locale = useEditor((s) => s.locale);
  // Opens in an effect, not during render: the server has no localStorage,
  // and reading it here would cause a hydration mismatch.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!seen()) setOpen(true);
  }, []);

  const close = () => {
    setOpen(false);
    markSeen();
  };

  // Not modal, so Tab may leave it; Escape still closes it.
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, open, { onClose: close });

  const rows = (list: readonly { keys: string; label: TranslationKey }[]) =>
    list.map(({ keys, label }) => (
      <div key={`${keys}-${label}`} className="flex items-baseline justify-between gap-4 py-0.5">
        <span className="text-[var(--text-faint)]">{t(locale, label)}</span>
        <span className="shrink-0 rounded bg-[var(--sunken)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-strong)]">
          {keys.startsWith('controls.') ? t(locale, keys as TranslationKey) : keys}
        </span>
      </div>
    ));

  return (
    <>
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={t(locale, 'controls.open')}
        title={t(locale, 'controls.open')}
        // Matches the theme and language buttons beside it.
        className="rounded bg-[var(--panel)] px-2 py-1.5 leading-none hover:bg-[var(--raised)] active:translate-y-px active:bg-[var(--raised-hover)]"
      >
        {/* A keyboard icon, since the panel lists shortcuts and gestures. */}
        <Keyboard size={16} aria-hidden />
      </button>

      {open && (
        // Not a modal: the editor stays usable, so a shortcut can be tried at once.
        <div
          ref={panel}
          role="dialog"
          aria-label={t(locale, 'controls.title')}
          className="fixed right-4 top-14 z-50 max-h-[80vh] w-80 overflow-y-auto rounded border border-[var(--line-strong)] bg-[var(--panel)] p-3 text-sm shadow-lg"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">{t(locale, 'controls.title')}</h2>
            <button
              onClick={close}
              aria-label={t(locale, 'controls.close')}
              className="rounded px-1.5 text-[var(--text-faint)] hover:bg-[var(--tint-accent)] active:bg-[var(--raised)]"
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          <h3 className="mt-2 text-xs uppercase tracking-wide text-[var(--text-faint)]">
            {t(locale, 'controls.mouseTitle')}
          </h3>
          {rows(MOUSE)}

          <h3 className="mt-3 text-xs uppercase tracking-wide text-[var(--text-faint)]">
            {t(locale, 'controls.keyboardTitle')}
          </h3>
          {rows(KEYS)}
        </div>
      )}
    </>
  );
}
