// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import CountryDoors from './CountryDoors';
import { REAL_COUNTRIES_KEY, savedRealCountries, useEditor } from '@/store/editor';

// See TopBar.test.tsx: RTL's auto-cleanup needs a global `afterEach`, which
// this project's vitest config does not provide.
afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'second', placements: [] },
    locale: 'en',
    realCountries: false,
    sharedOverWork: false, heldEdit: null,
  });
});

describe('the country doors panel', () => {
  it('is not shown for the main warehouse, which has no country doors', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, warehouse: 'main' } }));
    const { container } = render(<CountryDoors />);
    expect(container.innerHTML).toBe('');
  });

  it('offers a labelled choice for each of the twelve doors, floor included in the name', () => {
    render(<CountryDoors />);
    expect(screen.getAllByRole('combobox')).toHaveLength(12);
    // Doors are numbered per floor: both floors have a door 1.
    expect(screen.getByRole('combobox', { name: /Ground floor, Door 1\b/ })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Upper floor, Door 6\b/ })).toBeTruthy();
  });

  it('gives each door its column as the rulers number it, from 1', () => {
    // The first ground-floor door stands on x 7, which the ruler calls column 8.
    render(<CountryDoors />);
    expect(screen.getByRole('combobox', { name: /Ground floor, Door 1, column 8$/ })).toBeTruthy();
  });

  it('starts every door unassigned, with no flag', () => {
    const { container } = render(<CountryDoors />);
    for (const select of screen.getAllByRole('combobox')) {
      expect((select as HTMLSelectElement).value).toBe('');
    }
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it("stores the game's country id and shows its flag next to the door", () => {
    const { container } = render(<CountryDoors />);
    const first = screen.getByRole('combobox', { name: /Ground floor, Door 1\b/ });
    fireEvent.change(first, { target: { value: 'Kongradi' } });

    expect(useEditor.getState().plan.doorCountries).toEqual({ 'second-country-0-a': 'Kongradi' });
    expect((first as HTMLSelectElement).value).toBe('Kongradi');
    const flags = [...container.querySelectorAll('img')];
    expect(flags.map((img) => img.getAttribute('src'))).toEqual(['/flags/Kongradi.png']);
    // Decorative: the name is already in the select.
    expect(flags[0]?.getAttribute('alt')).toBe('');
  });

  it('clears a door back to unassigned', () => {
    useEditor.getState().setDoorCountry('second-country-0-a', 'Kongradi');
    render(<CountryDoors />);
    fireEvent.change(screen.getByRole('combobox', { name: /Ground floor, Door 1\b/ }), { target: { value: '' } });
    expect(useEditor.getState().plan.doorCountries).toBeUndefined();
  });

  it('speaks French too', () => {
    useEditor.setState({ locale: 'fr' });
    render(<CountryDoors />);
    expect(screen.getByText('Portes des pays')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Rez-de-chaussée, Porte 1\b/ })).toBeTruthy();
  });
});

describe('the RealCountries switch', () => {
  it("shows the mod's names and flags, while the plan keeps the game's ids", () => {
    useEditor.getState().setDoorCountry('second-country-0-a', 'Cristin');
    const { container } = render(<CountryDoors />);
    fireEvent.click(screen.getByRole('checkbox', { name: /RealCountries/ }));

    expect(useEditor.getState().realCountries).toBe(true);
    const first = screen.getByRole('combobox', { name: /Ground floor, Door 1\b/ }) as HTMLSelectElement;
    expect(first.selectedOptions[0]?.textContent).toBe('France');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/flags/real/Cristin.png');
    expect(useEditor.getState().plan.doorCountries).toEqual({ 'second-country-0-a': 'Cristin' });
  });

  it('is remembered by this browser, like the theme, and not by the plan', () => {
    render(<CountryDoors />);
    fireEvent.click(screen.getByRole('checkbox', { name: /RealCountries/ }));
    expect(window.localStorage.getItem(REAL_COUNTRIES_KEY)).toBe('on');
    expect(savedRealCountries()).toBe(true);
    expect('realCountries' in useEditor.getState().plan).toBe(false);
  });
});
