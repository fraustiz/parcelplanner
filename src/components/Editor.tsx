'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { decodePlan, planFromJson } from '@/core/serialize';
import { parseSharedLocation } from '@/core/short-link';
import { t } from '@/i18n';
import { openingLocale, STORAGE_KEY, useEditor } from '@/store/editor';
import GridCanvas from './GridCanvas';
import Inspector from './Inspector';
import MobileEmptyState from './MobileEmptyState';
import MobileNotice from './MobileNotice';
import Palette from './Palette';
import SharedPlanPrompt from './SharedPlanPrompt';
import StatusBar from './StatusBar';
import TopBar from './TopBar';

export default function Editor() {
  const setLocale = useEditor((s) => s.setLocale);
  const setTheme = useEditor((s) => s.setTheme);
  const loadPlan = useEditor((s) => s.loadPlan);
  const loadSharedPlan = useEditor((s) => s.loadSharedPlan);
  // Nothing placed in either warehouse.
  const empty = useEditor((s) => s.plan.placements.length === 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const locale = useEditor((s) => s.locale);
  /** Where following a shared link stands: fetching it, or failed to open. */
  const [link, setLink] = useState<'none' | 'loading' | 'failed'>('none');

  useEffect(() => {
    // A saved choice wins over the browser's languages, so a switch survives reload.
    setLocale(openingLocale(navigator.languages ?? [navigator.language]));
    // ThemeScript already set the theme on <html> before paint; this syncs the store.
    const applied = document.documentElement.dataset.theme;
    if (applied === 'light' || applied === 'dark') setTheme(applied);
  }, [setLocale, setTheme]);

  // A shared link wins over localStorage. Corrupt data is dropped rather than
  // crashing, and a link that fails to open says so. The fragment is cleared
  // once loaded, or every refresh would discard edits made since.
  useEffect(() => {
    let cancelled = false;
    const shared = parseSharedLocation(window.location.pathname, window.location.hash);

    const restoreLocal = () => {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        loadPlan(planFromJson(raw));
      } catch {
        // ignore: keep the default empty plan
      }
    };

    if (shared === null) {
      restoreLocal();
      return;
    }

    if (shared.kind === 'short') setLink('loading');

    // A `#s=` link holds only an id, so the payload is fetched first; a `#p=`
    // link carries it. Either falls back to localStorage on failure.
    const payload = shared.kind === 'short'
      ? fetch(`/api/link/${shared.id}`).then((response) => {
          if (!response.ok) throw new Error('no such link');
          return response.text();
        })
      : Promise.resolve(shared.payload);

    void payload
      .then(decodePlan)
      .then((plan) => {
        if (cancelled) return;
        setLink('none');
        loadSharedPlan(plan);
        // Back to the bare address, so a refresh does not reload the link
        // over later edits.
        window.history.replaceState(null, '', '/');
      })
      .catch(() => {
        if (cancelled) return;
        // Said out loud: a silent fallback reads as the link having loaded.
        setLink('failed');
        restoreLocal();
      });

    return () => { cancelled = true; };
  }, [loadPlan, loadSharedPlan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Lowercased, because Caps Lock sends an uppercase letter without
      // shiftKey. Undo and redo are told apart by the Shift flag, not the case.
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      {!empty && <MobileNotice />}
      <div className="flex min-h-0 flex-1">
        <Palette />
        <main className="relative min-w-0 flex-1">
          <GridCanvas />
          {/* Covers the blank grid on a phone; held back while a shared plan
              is loading. */}
          {empty && link !== 'loading' && <MobileEmptyState />}
          <div role="status" className="pointer-events-none absolute left-1/2 top-14 z-40 -translate-x-1/2">
            {link === 'loading' && (
              <p className="rounded border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-1.5 text-sm shadow-lg">
                {t(locale, 'shared.loading')}
              </p>
            )}
          </div>
          {link === 'failed' && (
            <div
              role="alert"
              className="absolute left-1/2 top-14 z-40 flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 items-start gap-2 rounded border border-[var(--line-strong)] bg-[var(--panel)] py-1.5 pl-3 pr-1.5 text-sm text-[var(--warning)] shadow-lg"
            >
              <p className="flex-1 py-1">{t(locale, 'shared.deadLink')}</p>
              <button
                type="button"
                onClick={() => setLink('none')}
                aria-label={t(locale, 'controls.close')}
                title={t(locale, 'controls.close')}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-[var(--text-faint)] hover:bg-[var(--raised)] hover:text-[var(--text-strong)] active:bg-[var(--raised-hover)] md:min-h-7 md:min-w-7"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          )}
        </main>
        <Inspector />
      </div>
      <StatusBar />
      <SharedPlanPrompt />
    </div>
  );
}
