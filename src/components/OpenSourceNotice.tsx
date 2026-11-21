'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '@/i18n';
import { useEditor } from '@/store/editor';

/** Marks that the notice has been shown once, so it never comes back. */
export const OPEN_SOURCE_SEEN_KEY = 'parcelplanner.openSourceSeen';

/** Where the code lives. */
export const REPOSITORY_URL = 'https://github.com/fraustiz/parcelplanner';

/** How long after the announcement the notice is offered to newcomers. */
export const NOTICE_DAYS = 60;

/**
 * Whether the notice is still offered: from the day the code went public
 * (`NEXT_PUBLIC_OPEN_SOURCE_SINCE`, a YYYY-MM-DD date set at deploy) for
 * NOTICE_DAYS. Without a valid date it is not offered at all, so a deploy made
 * before the code is public announces nothing.
 */
export function noticeWindowOpen(since: string | undefined, now: Date): boolean {
  if (since === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(since)) return false;
  const start = Date.parse(`${since}T00:00:00Z`);
  if (Number.isNaN(start)) return false;
  const elapsed = now.getTime() - start;
  return elapsed >= 0 && elapsed < NOTICE_DAYS * 24 * 60 * 60 * 1000;
}

/** localStorage throws rather than returning null in some private-browsing
 * modes and embedded browsers, so reads and writes are wrapped. */
function seen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_SOURCE_SEEN_KEY) !== null;
  } catch {
    return true; // cannot remember, so do not pester: treat it as already shown
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(OPEN_SOURCE_SEEN_KEY, '1');
  } catch {
    // ignore: the notice simply shows again next visit
  }
}

/**
 * Says, once, that the project is now open source and why, during the weeks
 * after it went public (see noticeWindowOpen). Remembered as seen as soon as
 * it shows, so a visitor who ignores it is not asked again; it stays on
 * screen until closed.
 */
export default function OpenSourceNotice() {
  const locale = useEditor((s) => s.locale);
  // Opens in an effect, not during render: the server has no localStorage,
  // and reading it here would cause a hydration mismatch.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!noticeWindowOpen(process.env.NEXT_PUBLIC_OPEN_SOURCE_SINCE, new Date()) || seen()) return;
    markSeen();
    setOpen(true);
  }, []);

  if (!open) return null;

  return (
    <section
      aria-labelledby="open-source-title"
      className="fixed bottom-10 left-3 z-50 w-[min(24rem,calc(100%-1.5rem))] rounded border border-[var(--line-strong)] bg-[var(--panel)] p-3 text-sm shadow-lg"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h2 id="open-source-title" className="pt-0.5 font-semibold text-[var(--text-strong)]">
          {t(locale, 'openSource.title')}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t(locale, 'controls.close')}
          title={t(locale, 'controls.close')}
          className="-mr-1 -mt-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-[var(--text-faint)] hover:bg-[var(--raised)] hover:text-[var(--text-strong)] active:bg-[var(--raised-hover)] md:min-h-7 md:min-w-7"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="mb-2 leading-relaxed text-[var(--text-dim)]">{t(locale, 'openSource.why')}</p>
      <p className="mb-3 leading-relaxed text-[var(--text-dim)]">{t(locale, 'openSource.promise')}</p>
      <a
        href={REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center rounded bg-[var(--raised)] px-3 font-medium text-[var(--text-strong)] hover:bg-[var(--raised-hover)] md:min-h-8"
      >
        {t(locale, 'openSource.link')}
      </a>
    </section>
  );
}
