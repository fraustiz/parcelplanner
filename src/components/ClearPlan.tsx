'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { t } from '@/i18n';
import { useEditor } from '@/store/editor';
import { Button, Modal } from './ConfirmDialog';

/**
 * Empties the plan after asking, with the way out as the plainer answer.
 * Still an ordinary edit (see `clearPlan`), so Ctrl+Z restores it in one press.
 */
export default function ClearPlan() {
  const plan = useEditor((s) => s.plan);
  const locale = useEditor((s) => s.locale);
  const clearPlan = useEditor((s) => s.clearPlan);
  const [asking, setAsking] = useState(false);

  // Counted across both warehouses, since the button clears both.
  const count = plan.placements.length;

  // Hidden when there is nothing to clear, like the share link.
  if (count === 0) return null;

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        aria-label={t(locale, 'clear.open')}
        title={t(locale, 'clear.open')}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded bg-[var(--panel)] px-2 py-1.5 leading-none text-[var(--text-faint)] md:min-h-0 md:min-w-0 hover:text-[var(--danger)] hover:bg-[var(--raised)] active:translate-y-px active:bg-[var(--raised-hover)]"
      >
        <Trash2 size={16} aria-hidden />
      </button>

      {asking && (
        // Escape only ever backs out; it must never empty a warehouse.
        <Modal title={t(locale, 'clear.title')} body={t(locale, 'clear.body')} onClose={() => setAsking(false)}>
          {/* A count and a noun, not a sentence, which would mis-pluralise in
              French for a plan of one. */}
          <span className="mr-auto self-center font-mono text-sm text-[var(--text-strong)]">
            {t(locale, 'cost.objects')}: {count}
          </span>
          <Button tone="quiet" onClick={() => setAsking(false)} label={t(locale, 'clear.cancel')} />
          <Button
            tone="danger"
            onClick={() => { clearPlan(); setAsking(false); }}
            label={t(locale, 'clear.confirm')}
          />
        </Modal>
      )}
    </>
  );
}
