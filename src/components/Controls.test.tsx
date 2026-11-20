// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import Controls, { CONTROLS_SEEN_KEY } from './Controls';
import { useEditor } from '@/store/editor';

// See TopBar.test.tsx: RTL's auto-cleanup needs a global `afterEach`, which
// this project's vitest config does not provide.
afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  useEditor.setState({ locale: 'en' });
});

describe('the controls panel', () => {
  it('opens from its button', () => {
    window.localStorage.setItem(CONTROLS_SEEN_KEY, '1');
    const { container, getByRole } = render(<Controls />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    fireEvent.click(getByRole('button', { name: /controls/i }));

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('lists the gestures a player cannot guess', () => {
    // Panning is on the middle button, which nothing else on the page says.
    window.localStorage.setItem(CONTROLS_SEEN_KEY, '1');
    const { getByRole, getAllByText, getByText } = render(<Controls />);
    fireEvent.click(getByRole('button', { name: /controls/i }));

    // One row for panning, naming both buttons.
    expect(getAllByText(/pan the view/i)).toHaveLength(1);
    expect(getByText(/middle \/ right click drag/i)).toBeTruthy();
    expect(getByText('Shift+R')).toBeTruthy();
    expect(getByText(/move the selection/i)).toBeTruthy();
  });

  it('opens by itself on a first visit', () => {
    // Nothing in localStorage: a first visit, often from a shared link.
    const { container } = render(<Controls />);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('stays shut on every visit after the first', () => {
    const first = render(<Controls />);
    fireEvent.click(first.getByRole('button', { name: /close/i }));
    cleanup();

    const second = render(<Controls />);
    expect(second.container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('remembers it was seen even if dismissed with Escape', () => {
    // Both ways out count as "seen", or Escape would reopen it every visit.
    render(<Controls />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(window.localStorage.getItem(CONTROLS_SEEN_KEY)).not.toBeNull();
  });

  it('survives a browser that refuses localStorage', () => {
    // Private mode and some embedded browsers throw on access rather than
    // returning null; the help panel must not crash the editor.
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => { throw new Error('denied'); };
    try {
      expect(() => render(<Controls />)).not.toThrow();
    } finally {
      window.localStorage.getItem = original;
    }
  });

  it('translates', () => {
    useEditor.setState({ locale: 'fr' });
    window.localStorage.setItem(CONTROLS_SEEN_KEY, '1');
    const { getByRole, getAllByText } = render(<Controls />);
    fireEvent.click(getByRole('button', { name: /commandes/i }));
    expect(getAllByText(/déplacer la vue/i)).toHaveLength(1);
  });
});

describe('the panel\'s close control', () => {
  // Interface icons are drawn SVG, never font glyphs: a glyph varies by
  // platform and cannot take `currentColor`, so it ignores the theme.
  it('is a drawn icon rather than a font glyph', () => {
    window.localStorage.setItem(CONTROLS_SEEN_KEY, '1');
    const { getByRole } = render(<Controls />);
    fireEvent.click(getByRole('button', { name: /controls/i }));

    const close = getByRole('button', { name: /close/i });
    expect(close.querySelector('svg')).not.toBeNull();
    expect(close.textContent).toBe('');
  });

  it('still says what it does, since a drawing does not', () => {
    window.localStorage.setItem(CONTROLS_SEEN_KEY, '1');
    const { getByRole } = render(<Controls />);
    fireEvent.click(getByRole('button', { name: /controls/i }));

    expect(getByRole('button', { name: /close/i })).toBeTruthy();
  });
});

describe('focus in the controls panel', () => {
  it('moves into the panel on open and back to the button on Escape', () => {
    window.localStorage.setItem(CONTROLS_SEEN_KEY, '1');
    const { getByRole } = render(<Controls />);
    const button = getByRole('button', { name: /controls/i });
    button.focus();
    fireEvent.click(button);

    expect(getByRole('dialog').contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(button);
  });
});
