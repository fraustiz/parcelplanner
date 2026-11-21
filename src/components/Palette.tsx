'use client';

import { useEffect, useMemo, useState } from 'react';
import { getCatalogue } from '@/data/catalogue';
import { OBJECT_ICONS, PALETTE_ICON_OVERRIDES } from '@/data/icons';
import { shapesFor, SHAPE_DIVISOR } from '@/data/shapes';
import type { Category } from '@/core/types';
import { t } from '@/i18n';
import { useEditor } from '@/store/editor';
import CountryDoors from './CountryDoors';
import Expansions from './Expansions';
import ObjectIcon from './ObjectIcon';
import ScrollingLabel from './ScrollingLabel';

/**
 * Category order. Scanners go last: they are placed once, while conveyors,
 * routers and racks are picked over and over.
 *
 * Reserved zones have no section: a zone's size is whatever box the player
 * draws (see src/core/zone.ts).
 */
const ORDER: Exclude<Category, 'zone'>[] = ['conveyor', 'router', 'storage', 'scanner'];

/** Categories the visitor has folded away. */
const FOLDED_KEY = 'parcelplanner.paletteFolded';

/**
 * Which categories to open shut. Anything unreadable counts as nothing folded,
 * so a bad value never hides objects. Wrapped because localStorage throws
 * rather than returning null in some private and embedded browsers.
 */
function foldedCategories(): Set<string> {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(FOLDED_KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((c): c is string => typeof c === 'string') : []);
  } catch {
    return new Set();
  }
}

function rememberFolded(folded: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(FOLDED_KEY, JSON.stringify([...folded]));
  } catch {
    // Storage refused: the fold still applies for this visit.
  }
}

export default function Palette() {
  const locale = useEditor((s) => s.locale);
  const startDrag = useEditor((s) => s.startDrag);
  // The armed object's id, if any. The tool stays armed after a drop, so its
  // palette row is highlighted to show what a click will place.
  const armedObjectId = useEditor((s) => s.drag?.objectId);

  const [query, setQuery] = useState('');
  // Read on mount, not during render: the server has no localStorage, and
  // reading it here would cause a hydration mismatch.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set<string>());
  useEffect(() => setFolded(foldedCategories()), []);

  const grouped = useMemo(() => {
    const entries = [...getCatalogue().values()].filter((e) =>
      e.displayName[locale].toLowerCase().includes(query.toLowerCase()),
    );
    return ORDER.map((category) => ({
      category,
      items: entries.filter((e) => e.category === category),
    })).filter((g) => g.items.length > 0);
  }, [locale, query]);

  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-[var(--line)] p-3 md:block">
      {/* Above the objects, since what you own decides where you may build.
          Collapsed by default: it is set once. */}
      <Expansions />
      {/* Set once per save, like the expansions: the game deals them at random. */}
      <CountryDoors />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t(locale, 'palette.search')}
        placeholder={t(locale, 'palette.search')}
        className="mb-3 w-full rounded border border-[var(--line-field)] bg-[var(--panel)] px-2 py-1 text-sm outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
      {/* Present before there is anything to say, so the message is announced. */}
      <p role="status" className="text-sm text-[var(--text-muted)]">
        {grouped.length === 0 ? t(locale, 'palette.noMatch') : ''}
      </p>
      {grouped.map((group) => (
        // <details>, like Expansions: the browser owns the folding state.
        <details
          key={group.category}
          data-category={group.category}
          className="mb-4"
          open={!folded.has(group.category)}
          onToggle={(event) => {
            const next = new Set(folded);
            if ((event.currentTarget as HTMLDetailsElement).open) next.delete(group.category);
            else next.add(group.category);
            setFolded(next);
            rememberFolded(next);
          }}
        >
          <summary className="mb-1 cursor-pointer text-xs uppercase tracking-wide text-[var(--text-faint)]">
            {t(locale, `palette.category.${group.category}`)}
          </summary>
          <ul>
            {group.items.map((entry) => (
              <li key={entry.id}>
                <button
                  draggable
                  onDragStart={(event) => {
                    // Firefox will not start a drag without data. Unused: the
                    // drop reads the store's `drag` state (set by startDrag).
                    event.dataTransfer.setData('text/plain', entry.id);
                    startDrag(entry.id);
                  }}
                  onClick={() => startDrag(entry.id)}
                  aria-pressed={armedObjectId === entry.id}
                  className={`flex w-full cursor-grab items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-[var(--panel)] ${
                    armedObjectId === entry.id ? 'bg-[var(--tint-accent)] ring-1 ring-inset ring-[var(--accent)]' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {/* A hand-drawn override in public/objects/, else the
                        object's grid artwork (the usual case), else nothing. */}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                      {PALETTE_ICON_OVERRIDES[entry.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={PALETTE_ICON_OVERRIDES[entry.id]}
                          alt=""
                          width={24}
                          height={24}
                          className="h-6 w-6"
                        />
                      ) : shapesFor(entry.id, { locale })?.length ? (
                        <ObjectIcon
                          shapes={shapesFor(entry.id, { locale })!}
                          divisor={SHAPE_DIVISOR}
                          footprint={entry.footprint}
                          iconPath={OBJECT_ICONS[entry.id]}
                          className="h-6 w-6"
                        />
                      ) : null}
                    </span>
                    <ScrollingLabel text={entry.displayName[locale]} />
                  </span>
                  <span className="text-[var(--text-faint)]">
                    {entry.price === null ? '?' : `$${entry.price}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </aside>
  );
}
