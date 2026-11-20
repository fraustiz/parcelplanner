'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Ban, ChevronRight } from 'lucide-react';
import type { CatalogEntry, Cell, Placement } from '@/core/types';
import { getCatalogue } from '@/data/catalogue';
import { COLOUR_NAMES, OBJECT_COLOURS, repaintableColourOf } from '@/data/colours';
import { ownedGeometry, ownedTiersOf } from '@/data/warehouse-tiers';
import { t } from '@/i18n';
import { useEditor } from '@/store/editor';
import { useDialog } from './use-dialog';

/** Where the menu was opened, in client (viewport) pixels. */
export interface MenuAnchor {
  x: number;
  y: number;
  /** The grid cell it was opened over. A note belongs to a cell, not to the
   * selection, so it can go on empty floor too. */
  cell: Cell;
}

/** Roughly the menu's size, to keep it inside the viewport near an edge. An
 * estimate, since measuring would show it misplaced for one frame. */
const MENU_W = 200;
const MENU_H = 190;

const ROW = 'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left hover:bg-[var(--tint-accent)] focus-visible:bg-[var(--tint-accent)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';

/** The items that belong to `menu` itself, not to a submenu inside it. */
function itemsOf(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return [];
  return [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .filter((item) => item.closest('[role="menu"]') === menu);
}

/** Up, Down, Home and End over a menu's own items, wrapping at the ends.
 * Returns true when the key was one of those. */
function moveFocus(menu: HTMLElement | null, key: string): boolean {
  const items = itemsOf(menu);
  if (items.length === 0) return false;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = key === 'ArrowDown' ? (at + 1) % items.length
    : key === 'ArrowUp' ? (at <= 0 ? items.length - 1 : at - 1)
      : key === 'Home' ? 0
        : key === 'End' ? items.length - 1
          : -1;
  if (next < 0) return false;
  items[next]!.focus();
  return true;
}

/**
 * The editor's right-click menu, replacing the browser's (suppressed in
 * GridCanvas's onContextMenu).
 *
 * Every action applies to the whole selection. Right-clicking an object
 * outside the selection selects it first (see GridCanvas), so the selection
 * is always what the pointer is on.
 */
export default function ContextMenu({
  anchor,
  onClose,
  onNote,
  onReserve,
}: {
  anchor: MenuAnchor;
  onClose: () => void;
  /** Reserves the box the menu was opened inside as a zone; present only
   * when it was opened inside one (see `area` in GridCanvas). */
  onReserve?: () => void;
  /** Opens the note box on `anchor.cell`. The box lives on the canvas, which
   * owns the camera and so knows where that cell is on screen. */
  onNote: (cell: Cell) => void;
}) {
  const locale = useEditor((s) => s.locale);
  const plan = useEditor((s) => s.plan);
  const floor = useEditor((s) => s.floor);
  const noteHere = (plan.notes ?? []).some(
    (n) => n.warehouse === plan.warehouse && n.floor === floor
      && n.cell.x === anchor.cell.x && n.cell.y === anchor.cell.y,
  );
  const selectedIds = useEditor((s) => s.selectedIds);
  const editSelection = useEditor((s) => s.editSelection);
  const rotateSelection = useEditor((s) => s.rotateSelection);
  const mirrorSelection = useEditor((s) => s.mirrorSelection);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const ref = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const subId = useId();
  const [submenu, setSubmenu] = useState(false);
  // Set when the submenu is opened from the keyboard, so its first item takes
  // focus once it has rendered. Opened by hover, focus stays where it was.
  const focusSub = useRef(false);
  useEffect(() => {
    if (!submenu || !focusSub.current) return;
    focusSub.current = false;
    itemsOf(subRef.current)[0]?.focus();
  }, [submenu]);

  // Focus in on open and back out on close. Escape is answered below, because
  // inside the submenu it closes only the submenu.
  useDialog(ref, true, { onClose, escape: false });

  const selected = useMemo(
    () => plan.placements.filter((p) => selectedIds.includes(p.id)),
    [plan.placements, selectedIds],
  );

  // Replacements come from the selection's own category (a conveyor for a
  // conveyor). A mixed selection gets no replace option.
  const catalogue = getCatalogue();
  // Transforms are checked against what the player has actually unlocked, so a
  // turn cannot push a group onto an expansion they have ticked off.
  const unlocked = useMemo(() => ownedGeometry(ownedTiersOf(plan)), [plan]);
  const categories = new Set(selected.map((p) => catalogue.get(p.objectId)?.category));
  const replacements: CatalogEntry[] = useMemo(() => {
    if (categories.size !== 1) return [];
    const [only] = [...categories];
    if (!only) return [];
    const chosen = new Set(selected.map((p) => p.objectId));
    return [...catalogue.values()]
      .filter((e) => e.category === only && !(chosen.size === 1 && chosen.has(e.id)))
      .sort((a, b) => a.displayName[locale].localeCompare(b.displayName[locale]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `categories` is
    // rebuilt every render (derived from `selected`), so depending on it
    // would defeat the memo.
  }, [selected, locale, catalogue]);

  // Close on any click elsewhere and on scroll/resize, since the menu is
  // pinned to viewport pixels. Capture phase, so it runs before the canvas.
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


  const openSubmenu = () => {
    if (submenu) itemsOf(subRef.current)[0]?.focus();
    else { focusSub.current = true; setSubmenu(true); }
  };

  // Every key the menu answers is marked handled, so the canvas underneath
  // does not also act on it (Escape there would drop the selection).
  const onMenuKey = (event: KeyboardEvent) => {
    if (moveFocus(ref.current, event.key)) {
      event.preventDefault();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowRight' && document.activeElement === replaceRef.current) {
      event.preventDefault();
      openSubmenu();
    }
  };

  const onSubmenuKey = (event: KeyboardEvent) => {
    if (event.key === 'Tab') return; // the outer menu closes on it
    event.stopPropagation();
    if (moveFocus(subRef.current, event.key)) {
      event.preventDefault();
    } else if (event.key === 'Escape' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setSubmenu(false);
      replaceRef.current?.focus();
    }
  };

  const act = (edit: (p: Placement) => Placement) => {
    editSelection(edit);
    onClose();
  };

  // Flipped to open leftward/upward when the click was near a viewport edge,
  // so the menu is never half off-screen.
  const left = Math.min(anchor.x, Math.max(0, window.innerWidth - MENU_W));
  const top = Math.min(anchor.y, Math.max(0, window.innerHeight - MENU_H));

  const noteRow = (
    <button
      role="menuitem"
      tabIndex={-1}
      className={ROW}
      onClick={() => { onNote(anchor.cell); onClose(); }}
    >
      {t(locale, noteHere ? 'menu.noteEdit' : 'menu.note')}
    </button>
  );

  const reserveRow = onReserve && (
    <button
      role="menuitem"
      tabIndex={-1}
      className={ROW}
      onClick={() => { onReserve(); onClose(); }}
    >
      {t(locale, 'menu.reserve')}
    </button>
  );

  // Nothing selected (bare floor): the menu offers only the note.
  if (selected.length === 0) {
    return (
      <div
        ref={ref}
        role="menu"
        aria-label={t(locale, 'menu.label')}
        onKeyDown={onMenuKey}
        style={{ left, top }}
        className="fixed z-50 w-50 rounded border border-[var(--line-strong)] bg-[var(--panel)] py-1 text-sm shadow-lg"
      >
        {reserveRow}
        {noteRow}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={selected.length > 1
        ? `${selected.length} ${t(locale, 'inspector.selectedCount')}`
        : t(locale, 'menu.label')}
      onKeyDown={onMenuKey}
      style={{ left, top }}
      className="fixed z-50 w-50 rounded border border-[var(--line-strong)] bg-[var(--panel)] py-1 text-sm shadow-lg"
    >
      {/* Not an item, so hidden here and said by the menu's own name. */}
      {selected.length > 1 && (
        <div aria-hidden="true" className="px-3 pb-1 text-xs text-[var(--text-faint)]">
          {selected.length} {t(locale, 'inspector.selectedCount')}
        </div>
      )}

      <button
        role="menuitem"
        tabIndex={-1}
        className={ROW}
        // The same store action as the R key, so both turn a group the same way.
        onClick={() => { rotateSelection(1, catalogue, unlocked); onClose(); }}
      >
        {t(locale, 'menu.rotate')}<span className="text-[var(--text-faint)]">R</span>
      </button>

      <button
        role="menuitem"
        tabIndex={-1}
        className={ROW}
        onClick={() => { mirrorSelection(catalogue, unlocked); onClose(); }}
      >
        {t(locale, 'menu.mirror')}<span className="text-[var(--text-faint)]">X</span>
      </button>

      {replacements.length > 0 && (
        <div
          className="relative"
          onMouseEnter={() => setSubmenu(true)}
          onMouseLeave={() => setSubmenu(false)}
        >
          <button
            ref={replaceRef}
            role="menuitem"
            tabIndex={-1}
            aria-haspopup="menu"
            aria-expanded={submenu}
            aria-controls={submenu ? subId : undefined}
            className={ROW}
            onClick={(event) => {
              // detail 0 is a click from Enter or Space rather than a pointer.
              if (event.detail === 0) openSubmenu();
              else setSubmenu((v) => !v);
            }}
          >
            {t(locale, 'menu.replace')}
            <ChevronRight size={14} aria-hidden className="text-[var(--text-faint)]" />
          </button>
          {submenu && (
            <div
              ref={subRef}
              id={subId}
              role="menu"
              aria-label={t(locale, 'menu.replace')}
              onKeyDown={onSubmenuKey}
              className="absolute left-full top-0 max-h-64 w-56 overflow-y-auto rounded border border-[var(--line-strong)] bg-[var(--panel)] py-1 shadow-lg"
            >
              {replacements.map((entry) => (
                <button
                  key={entry.id}
                  role="menuitem"
                  tabIndex={-1}
                  className={ROW}
                  onClick={() => act((p) => ({ ...p, objectId: entry.id }))}
                >
                  <span className="truncate">{entry.displayName[locale]}</span>
                  <span className="shrink-0 text-[var(--text-faint)]">
                    {entry.price === null ? '?' : `$${entry.price}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Only when something selected can be painted; a scanner cannot (see
          repaintableColourOf). */}
      {selected.some((p) => repaintableColourOf(catalogue.get(p.objectId)!) !== null) && (
        <div role="group" aria-label={t(locale, 'menu.colour')} className="px-3 py-1.5">
          {/* Full strength, like Rotate and Mirror above it. */}
          <div aria-hidden="true" className="mb-1">{t(locale, 'menu.colour')}</div>
          <div className="flex flex-wrap gap-1">
            {OBJECT_COLOURS.map((colour) => (
              <button
                key={colour}
                role="menuitem"
                tabIndex={-1}
                aria-label={t(locale, COLOUR_NAMES[colour]!)}
                title={t(locale, COLOUR_NAMES[colour]!)}
                onClick={() => act((p) => ({ ...p, colour }))}
                style={{ backgroundColor: colour }}
                className="h-5 w-5 rounded border border-[var(--line-strong)] hover:border-[var(--text-strong)]"
              />
            ))}
            {/* Back to the artwork as drawn, as one more swatch in the row. */}
            <button
              role="menuitem"
              tabIndex={-1}
              aria-label={t(locale, 'menu.colourNone')}
              title={t(locale, 'menu.colourNone')}
              onClick={() => act(({ colour: _drop, ...rest }) => rest)}
              className="flex h-5 w-5 items-center justify-center rounded border border-[var(--line-strong)] text-[var(--text-faint)] hover:border-[var(--text-strong)]"
            >
              {/* A slashed circle means "no colour"; a cross would read as
                  "remove this swatch". */}
              <Ban size={12} aria-hidden />
            </button>
          </div>
        </div>
      )}

      <div role="separator" className="my-1 border-t border-[var(--line-strong)]" />

      {/* A note is about the cell, so it sits apart from the selection actions. */}
      {noteRow}

      <div role="separator" className="my-1 border-t border-[var(--line-strong)]" />

      <button
        role="menuitem"
        tabIndex={-1}
        className={`${ROW} text-[var(--danger)]`}
        onClick={() => { deleteSelection(); onClose(); }}
      >
        {t(locale, 'menu.delete')}<span className="text-[var(--text-faint)]">Del</span>
      </button>
    </div>
  );
}
