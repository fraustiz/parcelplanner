'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MAX_SUGGESTION_LENGTH } from '@/core/suggestion';
import { Button, Modal } from '@/components/ConfirmDialog';
import { t } from '@/i18n';
import { useEditor } from '@/store/editor';
import { useDialog } from './use-dialog';

/** How long the "thanks" stays up before the box closes itself. */
const THANKS_MS = 1800;

/**
 * The suggestion box, in the app so feedback does not mean leaving the editor.
 * Notes are filed on the server's disk and announced on Discord if a webhook
 * is configured (src/server/suggestion-api.ts). No name or address is asked.
 *
 * So the box does not read as a chatbot, the placeholder names who reads a
 * note, and a notice says "not an AI" before it opens. In that notice Cancel
 * is the coloured button, the reverse of other dialogs, so it is read first.
 */
export default function Suggest() {
  const locale = useEditor((s) => s.locale);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'thanks' | 'failed'>('idle');
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, open, { onClose: () => setOpen(false) });

  useEffect(() => {
    if (state !== 'thanks') return;
    const timer = setTimeout(() => { setOpen(false); setState('idle'); }, THANKS_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const send = async () => {
    if (text.trim().length === 0) return;
    setState('sending');
    try {
      const response = await fetch('/api/suggestion', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: text,
      });
      if (!response.ok) throw new Error(String(response.status));
      setText('');
      setState('thanks');
    } catch {
      // The text is kept, so a failed send loses nothing.
      setState('failed');
    }
  };

  return (
    <>
      <button
        onClick={() => (open ? setOpen(false) : setNotice(true))}
        aria-label={t(locale, 'suggest.open')}
        title={t(locale, 'suggest.open')}
        className="rounded bg-[var(--panel)] px-2 py-1 hover:bg-[var(--raised)] active:translate-y-px active:bg-[var(--raised-hover)]"
      >
        {t(locale, 'suggest.open')}
      </button>

      {notice && (
        <Modal
          title={t(locale, 'suggest.noticeTitle')}
          body={t(locale, 'suggest.noticeBody')}
          onClose={() => setNotice(false)}
        >
          <Button tone="quiet" onClick={() => { setNotice(false); setOpen(true); }} label={t(locale, 'suggest.noticeOk')} />
          <span className="flex-1" />
          <Button tone="accent" autoFocus onClick={() => setNotice(false)} label={t(locale, 'suggest.noticeCancel')} />
        </Modal>
      )}

      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label={t(locale, 'suggest.title')}
          className="fixed right-4 top-14 z-50 w-80 rounded border border-[var(--line-strong)] bg-[var(--panel)] p-3 text-sm shadow-lg"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">{t(locale, 'suggest.title')}</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label={t(locale, 'controls.close')}
              className="rounded px-1.5 text-[var(--text-faint)] hover:bg-[var(--tint-accent)] active:bg-[var(--raised)]"
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          <textarea
            data-autofocus
            value={text}
            maxLength={MAX_SUGGESTION_LENGTH}
            onChange={(e) => { setText(e.target.value); setState('idle'); }}
            aria-label={t(locale, 'suggest.label')}
            placeholder={t(locale, 'suggest.placeholder')}
            rows={4}
            className="w-full resize-none rounded border border-[var(--line-field)] bg-[var(--sunken)] p-2 text-sm outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            <span role="status" className="text-xs text-[var(--text-faint)]">
              {state === 'thanks' && t(locale, 'suggest.thanks')}
              {state === 'failed' && (
                <span className="text-[var(--danger)]">{t(locale, 'suggest.failed')}</span>
              )}
            </span>
            <button
              onClick={() => void send()}
              disabled={state === 'sending' || text.trim().length === 0}
              className="rounded border border-transparent bg-[var(--tint-accent)] px-2 py-1 text-[var(--accent)] enabled:hover:border-[var(--accent)] enabled:active:translate-y-px enabled:active:bg-[var(--tint-warm)] disabled:opacity-40"
            >
              {t(locale, state === 'sending' ? 'suggest.sending' : 'suggest.send')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
