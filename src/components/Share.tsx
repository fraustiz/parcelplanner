'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { checkTemplate, planFromWorkbook } from '@/core/import-plan';
import { encodePlan, planFromJson, planToJson } from '@/core/serialize';
import { shareTarget } from '@/core/short-link';
import { CATALOGUE_GAME_VERSION } from '@/core/version';
import { readWorkbook } from '@/core/xlsx';
import { getCatalogue } from '@/data/catalogue';
import { DOORS } from '@/data/doors';
import {
  DOOR_FILLS, TEMPLATE_CODES, TEMPLATE_LABELS, TEMPLATE_SHEETS, TEMPLATE_SIGNAGE,
  TEMPLATE_VERSION,
} from '@/data/template';
import { WAREHOUSES } from '@/data/warehouses';
import { t, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';
import { exportImage } from './export-image';
import ImportPanel, { type ImportOutcome } from './ImportPanel';
import { useDialog } from './use-dialog';

/** How long the "Link copied" confirmation stays up. */
const CONFIRM_MS = 2000;
/** The largest .xlsx file read at all; the real template is about 60 KB. */
const MAX_TEMPLATE_FILE_BYTES = 20 * 1024 * 1024;
/** A clipboard write that has not settled by then is treated as refused: some
 * browsers leave it pending behind a permission prompt. */
const CLIPBOARD_MS = 3000;

/**
 * Sharing a layout, best link first.
 *
 * 1. `#s=<id>`: the plan is stored on the server. Eleven characters whatever
 *    the size; a link that carries the plan cannot be that short (see
 *    packPlanBinary).
 * 2. `#p=<payload>`: the whole plan in the fragment. Longer but
 *    self-contained, and a fragment never reaches the server or any proxy.
 * 3. A downloaded file, only when the server is unreachable and the layout is
 *    too big for a URL. Import reads it back.
 *
 * A short link is an optimisation, never a dependency: when the store fails,
 * the link gets longer but no work is lost.
 */

/** Asks the server to store `payload`. Null is a normal answer, not an error:
 * the store can be full, or there can be no server at all. */
async function shorten(payload: string): Promise<string | null> {
  const response = await fetch('/api/link', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: payload,
  });
  if (!response.ok) return null;
  const { id } = await response.json() as { id?: unknown };
  return typeof id === 'string' ? id : null;
}
/**
 * Reads the game's spreadsheet. The tables are passed in here because
 * src/core never imports src/data (see `Door` in src/core/types.ts).
 */
async function readTemplate(file: File): Promise<ImportOutcome> {
  // The real template is about 60 KB; anything this large is not one, and
  // reading it whole would only cost memory before the unzipper refuses it.
  if (file.size > MAX_TEMPLATE_FILE_BYTES) return { kind: 'unreadable' };

  let book;
  try {
    book = await readWorkbook(await file.arrayBuffer());
  } catch {
    return { kind: 'unreadable' };
  }

  // Checked before anything is read: the version and doors prove the grid is
  // aligned, or the import would be wrong in every cell.
  const problems = checkTemplate(book, {
    version: TEMPLATE_VERSION,
    sheets: TEMPLATE_SHEETS,
    doors: DOORS,
    fills: DOOR_FILLS,
  });
  if (problems.length > 0) return { kind: 'refused', problems };

  const { plan, report } = planFromWorkbook(book, {
    codes: TEMPLATE_CODES,
    labels: TEMPLATE_LABELS,
    signage: TEMPLATE_SIGNAGE,
    sheets: TEMPLATE_SHEETS,
    catalogue: getCatalogue(),
    geometry: WAREHOUSES,
  }, CATALOGUE_GAME_VERSION);
  return { kind: 'ready', plan, report };
}

export default function Share() {
  const plan = useEditor((s) => s.plan);
  const locale = useEditor((s) => s.locale);
  const loadPlan = useEditor((s) => s.loadPlan);
  const floor = useEditor((s) => s.floor);
  const theme = useEditor((s) => s.theme);
  const realCountries = useEditor((s) => s.realCountries);
  const [state, setState] = useState<
    'idle' | 'busy' | 'copied' | 'refused' | 'too-big' | 'bad-file'
  >('idle');
  /** The link the clipboard refused, shown so it can be copied by hand. */
  const [refusedUrl, setRefusedUrl] = useState('');
  // Below md the three text buttons fold into one menu, so the bar fits a phone.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  useDialog(menuRef, menuOpen, { onClose: () => setMenuOpen(false) });
  useEffect(() => {
    if (!menuOpen) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !toggleRef.current?.contains(target)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [menuOpen]);
  /** The parsed workbook, waiting on the caution being read. Only
   * `ImportPanel`'s confirm loads it. */
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Busy ends by itself, and a refused link stays until it is dismissed.
    if (state === 'idle' || state === 'busy' || state === 'refused') return;
    const timer = setTimeout(() => setState('idle'), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([planToJson(plan)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'parcelplanner-plan.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    if (state === 'busy') return;
    setMenuOpen(false);
    setState('busy');
    let target;
    try {
      target = await shareTarget(await encodePlan(plan), shorten);
    } catch {
      setState('idle'); // never left saying it is still working
      return;
    }
    if (target.kind === 'file') {
      setState('too-big');
      download();
      return;
    }

    // A short link gets its own path so the server can describe the plan in
    // the link preview. A `#p=` link carries the whole plan, so it stays a
    // fragment, which never leaves the browser.
    const url = target.kind === 'short'
      ? `${window.location.origin}/s/${target.id}`
      : `${window.location.origin}/#p=${target.payload}`;
    // Also put in the address bar, in case the clipboard write is refused
    // (it needs a secure context, so plain http:// fails).
    window.history.replaceState(null, '', url);
    try {
      await Promise.race([
        navigator.clipboard.writeText(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard timeout')), CLIPBOARD_MS)),
      ]);
      setState('copied');
    } catch {
      setRefusedUrl(url);
      setState('refused');
    }
  };

  /**
   * A `.json` is this app's own download, so it round-trips and loads at once.
   * A `.xlsx` is the community template, never read exactly (see ImportPanel),
   * so it goes through the caution first. The extension decides: a workbook is
   * a ZIP and cannot be told apart without unpacking.
   */
  const importFile = async (file: File) => {
    if (/\.xlsx$/i.test(file.name)) {
      setState('idle');
      setOutcome(await readTemplate(file));
      return;
    }
    try {
      loadPlan(planFromJson(await file.text()));
      setState('idle');
    } catch {
      setState('bad-file');
    }
  };

  const message: TranslationKey | null = {
    idle: null,
    busy: 'share.creating',
    copied: 'share.copied',
    refused: 'share.refused',
    'too-big': 'share.download',
    'bad-file': 'share.badFile',
  }[state] as TranslationKey | null;

  const TEXT_BUTTON = 'min-h-11 rounded bg-[var(--panel)] px-2 py-1 text-left hover:bg-[var(--raised)] active:translate-y-px active:bg-[var(--raised-hover)] md:min-h-0 md:text-center';

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-controls={menuId}
        ref={toggleRef}
        className="min-h-11 rounded bg-[var(--panel)] px-2 py-1 hover:bg-[var(--raised)] active:translate-y-px active:bg-[var(--raised-hover)] md:hidden"
      >
        {t(locale, state === 'busy' ? 'share.creating' : 'share.menu')}
      </button>

      <div
        ref={menuRef}
        id={menuId}
        className={`${menuOpen ? 'absolute right-3 top-full z-50 mt-1 flex flex-col gap-1 rounded border border-[var(--line-strong)] bg-[var(--panel)] p-1 shadow-lg' : 'hidden'} md:contents`}
      >
      {/* Nothing to share on an empty plan; Import stays. */}
      {plan.placements.length > 0 && (
        <button
          onClick={() => void share()}
          disabled={state === 'busy'}
          aria-busy={state === 'busy'}
          className={`${TEXT_BUTTON} disabled:opacity-60`}
        >
          {t(locale, state === 'busy' ? 'share.creating' : 'share.copy')}
        </button>
      )}

      {/* Desktop only: a phone is a viewer, so an import could not be edited. */}
      <button
        onClick={() => fileRef.current?.click()}
        className="hidden rounded bg-[var(--panel)] px-2 py-1 md:inline-block hover:bg-[var(--raised)] active:translate-y-px active:bg-[var(--raised-hover)]"
      >
        {t(locale, 'share.import')}
      </button>

      {/* Export: the same download used when a plan is too big for a link.
          Shown on a phone too, since saving a plan is a read. */}
      <button
        onClick={() => { setMenuOpen(false); download(); }}
        className={TEXT_BUTTON}
      >
        {t(locale, 'share.export')}
      </button>

      {/* The floor being viewed as an image with a legend (see
          src/render/export-image.ts). */}
      {plan.placements.length > 0 && (
        <button
          onClick={() => {
            setMenuOpen(false);
            void exportImage(plan, floor, locale, theme === 'light' ? 'light' : 'dark', realCountries);
          }}
          className={TEXT_BUTTON}
        >
          {t(locale, 'share.image')}
        </button>
      )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file twice still fires a change event.
          event.target.value = '';
          if (file) void importFile(file);
        }}
      />

      {/* The only place an import is loaded, after the caution is shown. */}
      {outcome && (
        <ImportPanel
          outcome={outcome}
          onClose={() => setOutcome(null)}
          onConfirm={(imported) => { loadPlan(imported); setOutcome(null); }}
        />
      )}

      {/* An always-present region, so the message is announced; sr-only adds
          no gap to the bar. */}
      <span role="status" className="sr-only">{message === null ? '' : t(locale, message)}</span>
      {state === 'copied' && <span aria-hidden="true" className="text-[var(--good)]">{t(locale, 'share.copied')}</span>}
      {state === 'too-big' && <span aria-hidden="true" className="text-[var(--warning)]">{t(locale, 'share.download')}</span>}
      {state === 'bad-file' && <span aria-hidden="true" className="text-[var(--danger)]">{t(locale, 'share.badFile')}</span>}
      {state === 'refused' && <span aria-hidden="true" className="text-[var(--warning)]">{t(locale, 'share.refused')}</span>}
      {state === 'refused' && (
        <span className="flex basis-full items-center gap-1 md:basis-auto">
          <input
            readOnly
            value={refusedUrl}
            aria-label={t(locale, 'share.linkLabel')}
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-11 min-w-0 flex-1 rounded border border-[var(--line-field)] bg-[var(--sunken)] px-2 font-mono text-xs md:min-h-0 md:w-64 md:flex-none md:py-1"
          />
          <button
            type="button"
            onClick={() => setState('idle')}
            aria-label={t(locale, 'controls.close')}
            title={t(locale, 'controls.close')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded px-1.5 text-[var(--text-faint)] hover:bg-[var(--raised)] active:bg-[var(--raised-hover)] md:min-h-0 md:min-w-0"
          >
            <X size={16} aria-hidden />
          </button>
        </span>
      )}
    </>
  );
}
