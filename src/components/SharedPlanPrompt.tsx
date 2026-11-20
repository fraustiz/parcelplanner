'use client';

import { useState } from 'react';
import { t, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';
import { Button, Modal } from './ConfirmDialog';

/**
 * The two questions asked when a shared plan would replace saved work. The
 * store writes nothing while a shared plan is viewed (see `sharedOverWork`).
 *
 *   1. On arrival: saved work exists and this is not it. Nothing has happened yet.
 *   2. On the first edit: the edit is held, and applied only on a yes.
 *
 * Asking twice is deliberate: the first is easy to click past unread.
 */

export default function SharedPlanPrompt() {
  const locale = useEditor((s) => s.locale);
  const sharedOverWork = useEditor((s) => s.sharedOverWork);
  const heldEdit = useEditor((s) => s.heldEdit);
  const replaceOwnWork = useEditor((s) => s.replaceOwnWork);
  const dropHeldEdit = useEditor((s) => s.dropHeldEdit);
  const restoreOwnWork = useEditor((s) => s.restoreOwnWork);

  // Local: dismissing the notice leaves the store's `sharedOverWork` on.
  const [warned, setWarned] = useState(false);

  const say = (key: TranslationKey) => t(locale, key);

  // Escape backs out of whichever question is showing; it never confirms.

  // The held edit takes priority, since its answer decides something.
  if (heldEdit) {
    return (
      <Modal title={say('shared.confirmTitle')} body={say('shared.confirmBody')} onClose={dropHeldEdit}>
        <Button tone="quiet" onClick={dropHeldEdit} label={say('shared.confirmCancel')} />
        <Button tone="primary" onClick={replaceOwnWork} label={say('shared.confirmReplace')} />
      </Modal>
    );
  }

  if (!sharedOverWork || warned) return null;

  return (
    <Modal title={say('shared.warnTitle')} body={say('shared.warnBody')} onClose={() => setWarned(true)}>
      <Button tone="quiet" onClick={restoreOwnWork} label={say('shared.warnRestore')} />
      <Button tone="primary" onClick={() => setWarned(true)} label={say('shared.warnView')} />
    </Modal>
  );
}
