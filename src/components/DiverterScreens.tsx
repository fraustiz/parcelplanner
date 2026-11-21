'use client';

import { CARGO_CHOICES, CARGO_DIVERTER, COUNTRY_DIVERTER, COUNTRY_DIVERTER_CELLS, isCargoChoice } from '@/core/diverters';
import type { CargoChoice, Placement } from '@/core/types';
import { COUNTRIES, countryName } from '@/data/countries';
import { t, type Locale, type TranslationKey } from '@/i18n';
import { useEditor } from '@/store/editor';

const CARGO_NAME: Readonly<Record<CargoChoice, TranslationKey>> = {
  Road: 'export.cargo.Road',
  Rail: 'export.cargo.Rail',
  Air: 'export.cargo.Air',
  Maritime: 'export.cargo.Maritime',
  Other: 'diverter.cargoOther',
};

const selectClass = 'w-full min-w-0 rounded bg-[var(--raised)] px-1.5 py-0.5';

/**
 * The screens of the selected diverter, set as in the game: which country a
 * country diverter turns off at each of its cells, which cargo type a cargo
 * diverter sends each way. A plan edit, so it can be undone and travels in
 * share links; the parcel preview sorts by it.
 */
export default function DiverterScreens({ placement, locale }: { placement: Placement; locale: Locale }) {
  const editSelection = useEditor((s) => s.editSelection);
  const real = useEditor((s) => s.realCountries);

  if (placement.objectId === COUNTRY_DIVERTER) {
    const screens = placement.diverterCountries ?? [];
    const setCountry = (cell: number, side: 'left' | 'right', country: string) => {
      editSelection((p) => {
        const next = Array.from({ length: COUNTRY_DIVERTER_CELLS }, (_, i) => ({ ...(p.diverterCountries?.[i] ?? {}) }));
        if (country === '') delete next[cell]![side];
        else next[cell]![side] = country;
        const { diverterCountries: _drop, ...rest } = p;
        return next.some((s) => Object.keys(s).length > 0) ? { ...rest, diverterCountries: next } : rest;
      });
    };
    return (
      <fieldset className="mb-3">
        <legend className="mb-1 font-semibold">{t(locale, 'diverter.screens')}</legend>
        <p className="mb-2 text-xs leading-relaxed text-[var(--text-faint)]">{t(locale, 'diverter.countryHint')}</p>
        <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1">
          <span />
          <span className="text-xs text-[var(--text-faint)]">{t(locale, 'diverter.left')}</span>
          <span className="text-xs text-[var(--text-faint)]">{t(locale, 'diverter.right')}</span>
          {Array.from({ length: COUNTRY_DIVERTER_CELLS }, (_, cell) => {
            const cellName = `${t(locale, 'diverter.cell')} ${cell + 1}`;
            return [
              <span key={`label-${cell}`} className="text-[var(--text-faint)]">{cellName}</span>,
              ...(['left', 'right'] as const).map((side) => (
                <select
                  key={`${cell}-${side}`}
                  aria-label={`${cellName}, ${t(locale, side === 'left' ? 'diverter.left' : 'diverter.right')}`}
                  value={screens[cell]?.[side] ?? ''}
                  onChange={(event) => setCountry(cell, side, event.target.value)}
                  className={selectClass}
                >
                  <option value="">{t(locale, 'diverter.none')}</option>
                  {COUNTRIES.map((id) => <option key={id} value={id}>{countryName(id, real)}</option>)}
                </select>
              )),
            ];
          })}
        </div>
      </fieldset>
    );
  }

  if (placement.objectId === CARGO_DIVERTER) {
    const screens = placement.diverterCargo ?? {};
    const setCargo = (way: 'left' | 'forward' | 'right', value: string) => {
      editSelection((p) => {
        const next = { ...(p.diverterCargo ?? {}) };
        if (isCargoChoice(value)) next[way] = value;
        else delete next[way];
        const { diverterCargo: _drop, ...rest } = p;
        return Object.keys(next).length > 0 ? { ...rest, diverterCargo: next } : rest;
      });
    };
    const ways: readonly ['left' | 'forward' | 'right', TranslationKey][] = [
      ['left', 'diverter.left'], ['forward', 'diverter.forward'], ['right', 'diverter.right'],
    ];
    return (
      <fieldset className="mb-3">
        <legend className="mb-1 font-semibold">{t(locale, 'diverter.screens')}</legend>
        <p className="mb-2 text-xs leading-relaxed text-[var(--text-faint)]">{t(locale, 'diverter.cargoHint')}</p>
        <div className="space-y-1">
          {ways.map(([way, name]) => (
            <label key={way} className="flex items-center justify-between gap-2">
              <span className="text-[var(--text-faint)]">{t(locale, name)}</span>
              <select
                value={screens[way] ?? ''}
                onChange={(event) => setCargo(way, event.target.value)}
                className="w-32 rounded bg-[var(--raised)] px-1.5 py-0.5"
              >
                <option value="">{t(locale, 'diverter.cargoAny')}</option>
                {CARGO_CHOICES.map((choice) => <option key={choice} value={choice}>{t(locale, CARGO_NAME[choice])}</option>)}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  return null;
}
