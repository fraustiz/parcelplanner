'use client';

import { useId } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { WarehouseId } from '@/core/types';
import { CATALOGUE_GAME_VERSION } from '@/core/version';
import { t } from '@/i18n';
import { useEditor } from '@/store/editor';
import ClearPlan from './ClearPlan';
import StoragePlanner from './StoragePlanner';
import Controls from './Controls';
import Suggest from './Suggest';
import Share from './Share';

/**
 * Icons are drawn inline rather than set as emoji: an emoji looks different on
 * every platform and cannot take `currentColor`, so it ignores the theme.
 */
/**
 * The two flags, drawn so they look the same everywhere. The hairline border
 * keeps their white from bleeding into the panel in light mode.
 */
function FlagFR() {
  return (
    <svg width="20" height="14" viewBox="0 0 60 40" aria-hidden="true" className="rounded-[2px]">
      <rect width="60" height="40" fill="#fff" />
      <rect width="20" height="40" fill="#0055A4" />
      <rect x="40" width="20" height="40" fill="#EF4135" />
      <rect width="60" height="40" fill="none" stroke="currentColor" strokeOpacity="0.25" />
    </svg>
  );
}

function FlagGB() {
  // The offset diagonals that make a Union Jack need a clip; useId keeps its
  // id unique if this renders twice.
  const clip = useId();
  return (
    <svg width="20" height="14" viewBox="0 0 60 40" aria-hidden="true" className="rounded-[2px]">
      <clipPath id={clip}>
        <path d="M30 20 H60 V40 z V40 H30 z H0 V20 z V0 H30 z" />
      </clipPath>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0 L60 40 M60 0 L0 40" clipPath={`url(#${clip})`} stroke="#C8102E" strokeWidth="5" />
      <path d="M30 0 V40 M0 20 H60" stroke="#fff" strokeWidth="13" />
      <path d="M30 0 V40 M0 20 H60" stroke="#C8102E" strokeWidth="8" />
      <rect width="60" height="40" fill="none" stroke="currentColor" strokeOpacity="0.25" />
    </svg>
  );
}

export default function TopBar() {
  // Narrow selectors: this component must not re-render on every unrelated
  // store change, e.g. a moveDrag dispatched on every pointer move while
  // placing an object.
  const plan = useEditor((s) => s.plan);
  const locale = useEditor((s) => s.locale);
  const floor = useEditor((s) => s.floor);
  // Nothing placed in either warehouse.
  const empty = plan.placements.length === 0;
  const setWarehouse = useEditor((s) => s.setWarehouse);
  const setFloor = useEditor((s) => s.setFloor);
  const setLocale = useEditor((s) => s.setLocale);
  const theme = useEditor((s) => s.theme);
  const setTheme = useEditor((s) => s.setTheme);

  return (
    <header className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)] px-3 py-2 text-sm md:gap-4 md:px-4">
      {/* Decorative logo (empty alt): the name sits beside it. Sized in CSS,
          not by the file's own 54px. */}
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={20} height={20} className="h-5 w-5" />
        {/* The page's one h1, at the bar's own size: preflight leaves it unstyled. */}
        <h1 className="font-bold">{t(locale, 'app.title')}</h1>
      </div>

      {/* Hidden on an empty phone plan, where the empty state covers the canvas.
          translate="no" here and on every <select>: a browser translator
          rewriting <option> text makes React's commit throw on removeChild.
          A mitigation for the likeliest cause, not a proven fix. */}
      <select translate="no"
        aria-label={t(locale, 'warehouse.label')}
        value={plan.warehouse}
        onChange={(e) => setWarehouse(e.target.value as WarehouseId)}
        className={`min-h-11 rounded bg-[var(--panel)] px-2 py-1 md:min-h-0 ${empty ? 'hidden md:inline-block' : ''}`}
      >
        <option value="main">{t(locale, 'warehouse.main')}</option>
        <option value="second">{t(locale, 'warehouse.second')}</option>
        {/* Not a building: an empty bench for laying out a module and copying
            it into one (see `workshop` in src/data/warehouses.ts). */}
        <option value="workshop">{t(locale, 'warehouse.workshop')}</option>
      </select>

      {plan.warehouse === 'second' && (
        <select translate="no"
          aria-label={t(locale, 'warehouse.floor')}
          value={floor}
          onChange={(e) => setFloor(Number(e.target.value))}
          className={`min-h-11 rounded bg-[var(--panel)] px-2 py-1 md:min-h-0 ${empty ? 'hidden md:inline-block' : ''}`}
        >
          <option value={0}>{t(locale, 'warehouse.floor.ground')}</option>
          <option value={1}>{t(locale, 'warehouse.floor.upper')}</option>
        </select>
      )}

      {plan.gameVersion !== CATALOGUE_GAME_VERSION && (
        <span className="text-[var(--warning)]">{t(locale, 'plan.versionMismatch')}</span>
      )}

      {/* Wraps rather than overflowing a phone; see Share for why the three
          text buttons fold into one menu there. */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2 md:gap-3">
        <Share />

        {/* Explains mouse and keyboard shortcuts, so it has nothing to say on
            a touch screen. */}
        <span className="hidden md:contents"><Controls /></span>

        <span className="hidden md:contents"><Suggest /></span>

        {/* Desktop only: a table and a grid of checkboxes do not fit a phone. */}
        {/* Storage is planned against a building's delivery doors, and the
            workshop has none. */}
        {plan.warehouse !== 'workshop' && <span className="hidden md:contents"><StoragePlanner /></span>}

        {/* Last, away from the controls pressed casually. */}
        <ClearPlan />

        {/* Shows the theme you would switch to, unlike the flag beside it,
            so the accessible names spell out the action for both. */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={t(locale, 'theme.switch')}
          title={t(locale, 'theme.switch')}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded bg-[var(--panel)] px-2 py-1.5 leading-none md:min-h-0 md:min-w-0 hover:bg-[var(--raised)] active:translate-y-px active:bg-[var(--raised-hover)]"
        >
          {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
        </button>

        {/* Shows the flag of the language in use, as flags on language
            controls do; the accessible name spells out the action. */}
        <button
          onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
          aria-label={t(locale, 'locale.switch')}
          title={t(locale, 'locale.switch')}
          className="flex min-h-11 min-w-11 items-center justify-center rounded bg-[var(--panel)] px-2 py-1.5 leading-none md:min-h-0 md:min-w-0 hover:bg-[var(--raised)] active:translate-y-px active:bg-[var(--raised-hover)]"
        >
          {locale === 'fr' ? <FlagFR /> : <FlagGB />}
        </button>
      </div>
    </header>
  );
}
