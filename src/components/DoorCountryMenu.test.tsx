// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import DoorCountryMenu from './DoorCountryMenu';
import { COUNTRY_DOORS } from '@/data/countries';
import { REAL_COUNTRIES_KEY, savedRealCountries, useEditor } from '@/store/editor';

afterEach(cleanup);

const [first, second] = COUNTRY_DOORS;

beforeEach(() => {
  window.localStorage.clear();
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'second', placements: [] },
    locale: 'en', realCountries: false, undoStack: [], redoStack: [],
    sharedOverWork: false, heldEdit: null,
  });
});

const open = (onClose = vi.fn()) => {
  render(<DoorCountryMenu door={first!} at={{ x: 10, y: 10 }} onClose={onClose} />);
  return onClose;
};

describe('the country picker on a door', () => {
  it('names the door and offers "not set" and the twelve countries', () => {
    open();
    expect(screen.getByRole('menu', { name: 'Door 1, col. 8' })).toBeTruthy();
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(13);
    expect(screen.getByRole('menuitemradio', { name: 'Not set' }).getAttribute('aria-checked')).toBe('true');
  });

  it('sets the country picked, then closes', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Molland' }));
    expect(useEditor.getState().plan.doorCountries).toEqual({ [first!.id]: 'Molland' });
    expect(onClose).toHaveBeenCalled();
  });

  it('swaps with the door that had that country, as the panel does', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, doorCountries: { [first!.id]: 'Cristin', [second!.id]: 'Molland' } } }));
    open();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Molland' }));
    expect(useEditor.getState().plan.doorCountries).toEqual({ [first!.id]: 'Molland', [second!.id]: 'Cristin' });
  });

  it('clears the door back to not set', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, doorCountries: { [first!.id]: 'Cristin' } } }));
    open();
    expect(screen.getByRole('menuitemradio', { name: 'Cristin' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Not set' }));
    expect(useEditor.getState().plan.doorCountries?.[first!.id]).toBeUndefined();
  });

  it('shows the mod\'s names with RealCountries on', () => {
    useEditor.setState({ realCountries: true });
    open();
    expect(screen.getByRole('menuitemradio', { name: 'France' })).toBeTruthy();
  });

  it('closes on Escape without changing anything', () => {
    const onClose = open();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(useEditor.getState().plan.doorCountries).toBeUndefined();
  });

  it('switches to the RealCountries names in place, remembered by this browser and not by the plan', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /RealCountries/ }));
    expect(screen.getByRole('menuitemradio', { name: 'France' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(REAL_COUNTRIES_KEY)).toBe('on');
    expect(savedRealCountries()).toBe(true);
    expect('realCountries' in useEditor.getState().plan).toBe(false);
  });
});
