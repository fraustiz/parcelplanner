'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import type { Door } from '@/core/types';
import { displayColumn } from '@/core/grid';
import { COUNTRIES, countryDoorNumber, countryFlag, countryName } from '@/data/countries';
import { t } from '@/i18n';
import { useEditor } from '@/store/editor';
import { moveFocus } from './ContextMenu';
import { useDialog } from './use-dialog';

/** Roughly the menu's size, to keep it inside the viewport near an edge. */
const MENU_W = 200;
const MENU_H = 440;

const ROW = 'flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--tint-accent)] focus-visible:bg-[var(--tint-accent)]';

/**
 * The country of one country door, picked on the plan: opened by clicking the door's bay
 * (see `countryDoorAt`), or from the right-click menu on the door, which is the keyboard's way
 * in (Shift+F10 on the door's cell). Picking a country another door has swaps the two.
 * Also holds the RealCountries switch, a display preference that is not part of the plan.
 */
export default function DoorCountryMenu({
  door,
  at,
  onClose,
}: {
  door: Door;
  /** Where the click was, in client (viewport) pixels. */
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const locale = useEditor((s) => s.locale);
  const real = useEditor((s) => s.realCountries);
  const current = useEditor((s) => s.plan.doorCountries?.[door.id]);
  const setDoorCountry = useEditor((s) => s.setDoorCountry);
  const setRealCountries = useEditor((s) => s.setRealCountries);
  const ref = useRef<HTMLDivElement>(null);

  useDialog(ref, true, { onClose, escape: false });

  // Close on any click elsewhere, and on resize, since the menu is pinned to viewport pixels.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const onKey = (event: KeyboardEvent) => {
    if (moveFocus(ref.current, event.key)) event.preventDefault();
    else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose();
    }
  };

  const pick = (country: string | null) => {
    setDoorCountry(door.id, country);
    onClose();
  };

  const title = `${t(locale, 'countryDoors.door')} ${countryDoorNumber(door)}, ${t(locale, 'countryDoors.columnShort')} ${displayColumn(door.cell.x)}`;
  const left = Math.max(8, Math.min(at.x, window.innerWidth - MENU_W - 8));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - MENU_H - 8));

  const option = (country: string | null) => {
    const chosen = (current ?? null) === country;
    const flag = country === null ? undefined : countryFlag(country, real);
    return (
      <button
        key={country ?? ''}
        type="button"
        role="menuitemradio"
        aria-checked={chosen}
        data-autofocus={chosen ? true : undefined}
        onClick={() => pick(country)}
        className={ROW}
      >
        <span className="flex h-[15px] w-[25px] shrink-0 items-center justify-center rounded-sm border border-[var(--line)]">
          {/* Decorative: the name follows. */}
          {flag !== undefined && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flag} alt="" width={25} height={15} className="block h-full w-full" />
          )}
        </span>
        <span className="flex-1">{country === null ? t(locale, 'countryDoors.unassigned') : countryName(country, real)}</span>
        {chosen && <Check aria-hidden className="h-3.5 w-3.5 text-[var(--accent)]" />}
      </button>
    );
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      onKeyDown={onKey}
      className="fixed z-50 max-h-[80vh] w-[200px] overflow-y-auto rounded border border-[var(--line-strong)] bg-[var(--panel)] py-1 text-sm shadow-lg"
      style={{ left, top }}
    >
      <p className="px-3 pb-1 pt-0.5 text-xs text-[var(--text-faint)]">{title}</p>
      {option(null)}
      {COUNTRIES.map((country) => option(country))}
      {/* A display preference of this browser, not part of the plan: it stays open to show the swap. */}
      <div role="separator" className="my-1 border-t border-[var(--line)]" />
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={real}
        onClick={() => setRealCountries(!real)}
        title={t(locale, 'countryDoors.realCountriesHint')}
        className={ROW}
      >
        <span className="flex h-[15px] w-[25px] shrink-0 items-center justify-center">
          <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${real ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--line-strong)]'}`}>
            {real && <Check aria-hidden className="h-3 w-3 text-[var(--panel)]" />}
          </span>
        </span>
        <span className="flex-1 text-xs">{t(locale, 'countryDoors.realCountries')}</span>
      </button>
    </div>
  );
}
