'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { CARGO_CHOICES, COUNTRY_DIVERTER, withScreen, type Way } from '@/core/diverters';
import type { Placement } from '@/core/types';
import { COUNTRIES, countryFlag, countryName } from '@/data/countries';
import { CARGO_TYPE_ICONS } from '@/data/icons';
import { t, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';
import { moveFocus } from './ContextMenu';
import { CARGO_NAME } from './DiverterScreens';
import { useDialog } from './use-dialog';

/** Roughly the menu's size, to keep it inside the viewport near an edge. */
const MENU_W = 200;
const MENU_H = 440;

const ROW = 'flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--tint-accent)] focus-visible:bg-[var(--tint-accent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] active:bg-[var(--tint-warm)]';

const WAY_NAME: Readonly<Record<Way, TranslationKey>> = {
  left: 'diverter.left',
  forward: 'diverter.forward',
  right: 'diverter.right',
};

/**
 * What one screen of a diverter shows, picked on the plan by clicking the screen: a country on
 * a country diverter, a cargo type on a cargo diverter. The same edit as the side panel's
 * (`withScreen`), so it is one undo step and travels in share links.
 */
export default function DiverterScreenMenu({
  placementId,
  screen,
  at,
  onClose,
}: {
  placementId: string;
  screen: { cell: number; way: Way };
  /** Where the click was, in client (viewport) pixels. */
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const locale = useEditor((s) => s.locale);
  const real = useEditor((s) => s.realCountries);
  const placement = useEditor((s) => s.plan.placements.find((p) => p.id === placementId));
  const dispatch = useEditor((s) => s.dispatch);
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

  if (!placement) return null;
  const country = placement.objectId === COUNTRY_DIVERTER;
  const current = country
    ? placement.diverterCountries?.[screen.cell]?.[screen.way as 'left' | 'right']
    : placement.diverterCargo?.[screen.way];

  const onKey = (event: KeyboardEvent) => {
    if (moveFocus(ref.current, event.key)) event.preventDefault();
    else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose();
    }
  };

  const pick = (value: string | undefined) => {
    const after: Placement = withScreen(placement, screen, value);
    if (after !== placement) dispatch({ kind: 'move', id: placement.id, before: placement, after });
    onClose();
  };

  const wayName = t(locale, WAY_NAME[screen.way]);
  const title = country
    ? `${t(locale, 'diverter.cell')} ${screen.cell + 1}, ${wayName}`
    : `${t(locale, 'diverter.screens')}, ${wayName}`;
  const left = Math.max(8, Math.min(at.x, window.innerWidth - MENU_W - 8));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - MENU_H - 8));

  const option = (value: string | undefined, label: string, image: string | undefined, wide: boolean) => {
    const chosen = current === value;
    return (
      <button
        key={value ?? ''}
        type="button"
        role="menuitemradio"
        aria-checked={chosen}
        data-autofocus={chosen ? true : undefined}
        onClick={() => pick(value)}
        className={ROW}
      >
        <span className={`flex h-[15px] ${wide ? 'w-[25px]' : 'w-[15px]'} shrink-0 items-center justify-center rounded-sm ${image !== undefined ? 'border border-[var(--line)] bg-white' : ''}`}>
          {/* Decorative: the name follows. */}
          {image !== undefined && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={wide ? 25 : 15} height={15} className="block h-full w-full" />
          )}
        </span>
        <span className="flex-1">{label}</span>
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
      {country
        ? [
          option(undefined, t(locale, 'diverter.none'), undefined, true),
          ...COUNTRIES.map((id) => option(id, countryName(id, real), countryFlag(id, real), true)),
        ]
        : [
          option(undefined, t(locale, 'diverter.cargoAny'), undefined, false),
          ...CARGO_CHOICES.map((choice) => option(
            choice,
            t(locale, CARGO_NAME[choice]),
            choice in CARGO_TYPE_ICONS ? CARGO_TYPE_ICONS[choice as keyof typeof CARGO_TYPE_ICONS] : undefined,
            false,
          )),
        ]}
    </div>
  );
}
