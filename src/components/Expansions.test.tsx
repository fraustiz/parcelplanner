// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import Expansions from './Expansions';
import { useEditor } from '@/store/editor';

// See TopBar.test.tsx: RTL's auto-cleanup needs a global `afterEach`, which
// this project's vitest config does not provide.
afterEach(cleanup);

beforeEach(() => {
  useEditor.setState({
    plan: { gameVersion: 'test', warehouse: 'second', placements: [] },
    locale: 'en',
  });
});

describe('the expansions list', () => {
  const labels = (container: HTMLElement) =>
    [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');

  it('does not list the purchase of the building at all', () => {
    // Tier 15 buys the Regional Sorting Centre, a building rather than an
    // expansion, so it gets no row.
    const { container } = render(<Expansions />);
    expect(labels(container).some((text) => /\b15\b/.test(text))).toBe(false);
  });

  it('lists the three expansions that ARE a choice', () => {
    const { container } = render(<Expansions />);
    const text = labels(container).join(' ');
    for (const tier of [16, 17, 18]) {
      expect(new RegExp(`\\b${tier}\\b`).test(text)).toBe(true);
    }
  });

  it('offers every tier of the main warehouse, which has no such purchase', () => {
    useEditor.setState((s) => ({ plan: { ...s.plan, warehouse: 'main' } }));
    const { container } = render(<Expansions />);
    expect(container.querySelectorAll('li')).toHaveLength(14);
  });

  it('leaves each remaining tier tickable', () => {
    const { container } = render(<Expansions />);
    const boxes = [...container.querySelectorAll('input[type="checkbox"]')];
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => !(b as HTMLInputElement).disabled)).toBe(true);
  });
});
