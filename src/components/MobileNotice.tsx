'use client';

import { t } from '@/i18n';
import { useEditor } from '@/store/editor';

/**
 * Says on a phone that this is a viewer: the palette and inspector are hidden
 * and touch only pans and zooms, so without it the page reads as broken.
 * Shown by width alone (`md:hidden`), not user-agent sniffing, so a small
 * desktop window gets it and a large tablet does not.
 */
export default function MobileNotice() {
  const locale = useEditor((s) => s.locale);

  return (
    <div
      className="flex shrink-0 flex-col gap-0.5 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs md:hidden"
      role="note"
    >
      <span className="font-medium text-[var(--text-strong)]">{t(locale, 'mobile.viewOnly')}</span>
      <span className="text-[var(--text-faint)]">{t(locale, 'mobile.hint')}</span>
    </div>
  );
}
