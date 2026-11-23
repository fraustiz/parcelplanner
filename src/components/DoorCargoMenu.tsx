'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { CARGO_TYPES, cargoOf, sameCargo } from '@/core/door-cargo';
import { displayColumn, displayRow, warehouseDimensions } from '@/core/grid';
import type { Door } from '@/core/types';
import { CARGO_TYPE_ICONS } from '@/data/icons';
import { WAREHOUSES } from '@/data/warehouses';
import { t, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';
import { moveFocus } from './ContextMenu';
import { useDialog } from './use-dialog';

const MENU_W = 220;
const MENU_H = 260;

const ROW = 'flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--tint-accent)] focus-visible:bg-[var(--tint-accent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] active:bg-[var(--tint-warm)] aria-disabled:cursor-not-allowed aria-disabled:text-[var(--text-faint)] aria-disabled:hover:bg-transparent';

const CARGO_NAME: Readonly<Record<string, TranslationKey>> = {
  Road: 'export.cargo.Road',
  Rail: 'export.cargo.Rail',
  Air: 'export.cargo.Air',
  Maritime: 'export.cargo.Maritime',
};

/** A cargo glyph, white on transparent, used as a mask so it takes the text colour. */
function Glyph({ path }: { path: string }) {
  const mask = `url(${path}) center / contain no-repeat`;
  return <span aria-hidden className="block h-4 w-4 bg-current" style={{ mask, WebkitMask: mask }} />;
}

/**
 * The cargo types an export door takes, picked on the plan by clicking its bay, or from the
 * right-click menu on the door. The game fixes them, but mods change them, so the player may;
 * the game's set stays one click away. A door always takes at least one type: the last one
 * ticked cannot be unticked, since a door taking none would be a reject bin.
 */
export default function DoorCargoMenu({
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
  const doorCargo = useEditor((s) => s.plan.doorCargo);
  const setDoorCargo = useEditor((s) => s.setDoorCargo);
  const ref = useRef<HTMLDivElement>(null);

  useDialog(ref, true, { onClose, escape: false });

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

  const current = cargoOf(door, { doorCargo });
  const game = door.cargoTypes ?? [];
  const isGame = sameCargo(current, game);
  const names = (types: readonly string[]) => types.map((type) => t(locale, CARGO_NAME[type]!)).join(', ');

  const toggle = (type: string) => {
    const on = current.includes(type);
    if (on && current.length === 1) return;
    setDoorCargo(door.id, on ? current.filter((x) => x !== type) : [...current, type]);
  };

  const dims = warehouseDimensions(door.warehouse, WAREHOUSES);
  const title = `${t(locale, 'cargoDoors.door')}, ${t(locale, 'countryDoors.columnShort')} ${displayColumn(door.cell.x)}`
    + (door.side === 'E' || door.side === 'W' ? `, ${t(locale, 'cargoDoors.rowShort')} ${displayRow(door.cell.y, dims)}` : '');
  const left = Math.max(8, Math.min(at.x, window.innerWidth - MENU_W - 8));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - MENU_H - 8));

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      onKeyDown={onKey}
      className="fixed z-50 w-[220px] rounded border border-[var(--line-strong)] bg-[var(--panel)] py-1 text-sm shadow-lg"
      style={{ left, top }}
    >
      <p className="px-3 pb-1 pt-0.5 text-xs text-[var(--text-faint)]">{title}</p>
      {CARGO_TYPES.map((type, i) => {
        const on = current.includes(type);
        const last = on && current.length === 1;
        return (
          <button
            key={type}
            type="button"
            role="menuitemcheckbox"
            aria-checked={on}
            aria-disabled={last || undefined}
            title={last ? t(locale, 'cargoDoors.lastHint') : undefined}
            data-autofocus={i === 0 ? true : undefined}
            onClick={() => toggle(type)}
            className={ROW}
          >
            <span className="flex w-4 shrink-0 justify-center"><Glyph path={CARGO_TYPE_ICONS[type]} /></span>
            <span className="flex-1">{t(locale, CARGO_NAME[type]!)}</span>
            {on && <Check aria-hidden className="h-3.5 w-3.5 text-[var(--accent)]" />}
          </button>
        );
      })}
      <div role="separator" className="my-1 border-t border-[var(--line)]" />
      <button
        type="button"
        role="menuitem"
        aria-disabled={isGame || undefined}
        onClick={() => { if (!isGame) setDoorCargo(door.id, null); }}
        className={ROW}
      >
        <span className="flex w-4 shrink-0 justify-center"><RotateCcw aria-hidden className="h-3.5 w-3.5" /></span>
        <span className="flex-1 text-xs">{t(locale, 'cargoDoors.gameDefault')} ({names(game)})</span>
      </button>
    </div>
  );
}
