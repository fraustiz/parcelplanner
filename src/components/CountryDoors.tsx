'use client';

import { useId } from 'react';
import { displayColumn } from '@/core/grid';
import { COUNTRIES, COUNTRY_DOORS, countryFlag, countryName } from '@/data/countries';
import { t, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';

/**
 * Which country each country export door of the second warehouse takes. The game deals them
 * at random, so only the player knows; the canvas then shows each door's flag.
 *
 * Doors are numbered per floor from left to right as drawn, with their column so they can be
 * found against the rulers. A native select per door keeps it usable by keyboard and screen
 * reader; the flag beside it is decorative, the name is in the select.
 *
 * Also holds the RealCountries switch, a display preference that is not part of the plan.
 */
export default function CountryDoors() {
  const warehouse = useEditor((s) => s.plan.warehouse);
  const assigned = useEditor((s) => s.plan.doorCountries);
  const locale = useEditor((s) => s.locale);
  const realCountries = useEditor((s) => s.realCountries);
  const setDoorCountry = useEditor((s) => s.setDoorCountry);
  const setRealCountries = useEditor((s) => s.setRealCountries);
  const baseId = useId();

  // Only the second warehouse has them.
  if (warehouse !== 'second') return null;

  const floors = [...new Set(COUNTRY_DOORS.map((d) => d.floor))];
  const floorName = (floor: number): string =>
    t(locale, (floor === 0 ? 'warehouse.floor.ground' : 'warehouse.floor.upper') as TranslationKey);

  return (
    <details className="mb-4 border-b border-[var(--line)] pb-3">
      <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--text-faint)]">
        {t(locale, 'countryDoors.title')}
      </summary>

      <p className="mt-2 text-xs text-[var(--text-faint)]">{t(locale, 'countryDoors.hint')}</p>

      {floors.map((floor) => (
        <section key={floor} className="mt-2">
          <h3 className="text-xs text-[var(--text-muted)]">{floorName(floor)}</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {COUNTRY_DOORS.filter((d) => d.floor === floor).map((door, i) => {
              const id = `${baseId}-${door.id}`;
              const country = assigned?.[door.id];
              const flag = country === undefined ? undefined : countryFlag(country, realCountries);
              const door1 = `${t(locale, 'countryDoors.door')} ${i + 1}`;
              // The floor is in the heading for sighted readers; said again for a screen
              // reader landing straight on the select, with the column spelt out.
              const spoken = `${floorName(floor)}, ${door1}, ${t(locale, 'countryDoors.column')} ${displayColumn(door.cell.x)}`;
              return (
                <li key={door.id} className="flex items-center gap-2">
                  <label htmlFor={id} className="w-24 shrink-0">
                    {door1}
                    <span className="ml-1 font-mono text-xs text-[var(--text-faint)]">x{displayColumn(door.cell.x)}</span>
                  </label>
                  <span className="flex h-[15px] w-[25px] shrink-0 items-center justify-center rounded-sm border border-[var(--line)]">
                    {/* A 64 px PNG, decorative: the name is in the select. */}
                    {flag !== undefined && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={flag} alt="" width={25} height={15} className="block h-full w-full" />
                    )}
                  </span>
                  <select
                    id={id}
                    aria-label={spoken}
                    value={country ?? ''}
                    onChange={(e) => setDoorCountry(door.id, e.target.value === '' ? null : e.target.value)}
                    className="min-w-0 flex-1 rounded border border-[var(--line-field)] bg-[var(--panel)] px-1 py-0.5 text-sm outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <option value="">{t(locale, 'countryDoors.unassigned')}</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{countryName(c, realCountries)}</option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="mt-2 text-xs text-[var(--text-faint)]">{t(locale, 'countryDoors.swap')}</p>

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={realCountries}
          onChange={(e) => setRealCountries(e.target.checked)}
        />
        <span>
          {t(locale, 'countryDoors.realCountries')}
          <span className="block text-xs text-[var(--text-faint)]">
            {t(locale, 'countryDoors.realCountriesHint')}
          </span>
        </span>
      </label>
    </details>
  );
}
