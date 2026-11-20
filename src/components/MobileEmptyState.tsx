'use client';

import { t } from '@/i18n';
import { useEditor } from '@/store/editor';

/**
 * What a phone shows instead of an empty grid, which would read as a failed
 * load since nothing can be placed there. Laid over the canvas rather than
 * replacing it, so GridCanvas is not remounted across the breakpoint.
 */
export default function MobileEmptyState() {
  const locale = useEditor((s) => s.locale);

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-[var(--page)] px-6 py-6 text-center md:hidden">
      {/* Decorative: the heading beside it already carries the name. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 opacity-80" />
      <h2 className="text-base font-medium text-[var(--text-strong)]">{t(locale, 'mobile.emptyTitle')}</h2>

      {/* A small preview (scripts/build-preview.mjs), not the 523 KB social
          card. Sized in the markup so the text below does not jump on load. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/preview.webp"
        alt={t(locale, 'mobile.previewAlt')}
        width={760}
        height={399}
        className="h-auto w-full max-w-sm rounded border border-[var(--line)]"
      />

      <p className="max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
        {t(locale, 'mobile.emptyBody')}
      </p>

      {/* Shared links do work on a phone, which "open it on a computer" alone
          would hide. */}
      <p className="max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">
        {t(locale, 'mobile.emptyShared')}
      </p>
    </div>
  );
}
