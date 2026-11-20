// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import Palette from './Palette';
import { getShapes } from '@/data/shapes';
import { useEditor } from '@/store/editor';

// The real catalogue has no unpriced object, so one synthetic entry is added
// to exercise the "—" shown for an unknown price. `vi.mock` is hoisted above
// the imports, so it applies before Palette.tsx imports `getCatalogue`.
vi.mock('@/data/catalogue', async () => {
  const real = await vi.importActual<typeof import('@/data/catalogue')>('@/data/catalogue');
  const augmented = new Map(real.getCatalogue());
  const templateEntry = [...augmented.values()][0]!;
  augmented.set('synthetic-unpriced', {
    ...templateEntry,
    id: 'synthetic-unpriced',
    displayName: { en: 'Synthetic Unpriced', fr: 'Synthétique sans prix' },
    price: null,
  });
  return { ...real, getCatalogue: () => augmented };
});

// See TopBar.test.tsx: RTL's auto-cleanup needs a global `afterEach`, which
// this project's vitest config does not provide.
afterEach(cleanup);

beforeEach(() => {
  useEditor.setState({ locale: 'en', drag: null });
});

describe('Palette', () => {
  it('lists the straight conveyor with its price', () => {
    // The real catalogue has more than one object priced at $100 (Straight
    // Conveyor, Corner Conveyor), so the price must be scoped to the
    // straight conveyor's own row rather than queried globally.
    render(<Palette />);
    const row = screen.getByText('Straight Conveyor').closest('li')!;
    expect(within(row).getByText('$100')).toBeTruthy();
  });

  it('shows a question mark for objects with no known price', () => {
    // See the vi.mock at the top of this file: 'Synthetic Unpriced' is
    // injected with price: null specifically to exercise this branch.
    render(<Palette />);
    const row = screen.getByText('Synthetic Unpriced').closest('li')!;
    expect(within(row).getByText('?')).toBeTruthy();
  });

  it('starts a drag when an item is clicked', () => {
    render(<Palette />);
    screen.getByText('Straight Conveyor').click();
    expect(useEditor.getState().drag?.objectId).toBe('BP_ConveyorBelt_Straight_Tier1');
  });

  it('translates its category headings into French', () => {
    useEditor.setState({ locale: 'fr' });
    render(<Palette />);
    expect(screen.getByText('Convoyeurs')).toBeTruthy();
  });

  it('draws an object\'s own grid artwork as its palette icon', () => {
    // A palette row draws from the same shapes.json as the canvas.
    render(<Palette />);
    const row = screen.getByText('Straight Conveyor').closest('li')!;
    const icon = row.querySelector('svg')!;
    expect(icon.tagName.toLowerCase()).toBe('svg');

    const drawn = icon.querySelectorAll('rect, path').length;
    const artwork = getShapes().get('BP_ConveyorBelt_Straight_Tier1') ?? [];
    expect(artwork.length).toBeGreaterThan(0);
    expect(drawn).toBe(artwork.length);
  });

  it('sizes the icon\'s viewBox to the object\'s footprint, so a long object reads as long', () => {
    render(<Palette />);
    const row = screen.getByText('Bridger Conveyor').closest('li')!;
    const icon = row.querySelector('svg')!;
    // The bridger is 1x3 at a divisor of 12.
    expect(icon.getAttribute('viewBox')).toBe('0 0 12 36');
  });

  it('lays the criteria glyph over the artwork, as the canvas does', () => {
    // Without it the six criteria scanners are indistinguishable: their belts
    // are drawn identically and only the logo says which is which.
    render(<Palette />);
    const row = screen.getByText('Scanner Conveyor (Serial Number)').closest('li')!;
    const glyph = row.querySelector('svg')!.querySelector('image');
    expect(glyph?.getAttribute('href')).toBe('/criteria/serial-number-icon.png');
  });

  it('draws the storage racks now that their artwork has arrived', () => {
    // Their drawing is locale-specific (labelled in-world), so the palette
    // resolves it through shapesFor.
    render(<Palette />);
    const row = screen.getByText('Storage Rack (Small)').closest('li')!;
    expect(row.querySelector('svg')!).toBeTruthy();
  });

  it('names objects in the selected locale, not just the interface chrome', () => {
    // The extracted game data only has English names; French ones come from
    // scripts/object-names-fr.mjs.
    useEditor.setState({ locale: 'fr' });
    render(<Palette />);
    expect(screen.getByText('Convoyeur Scanner (Numéro de Série)')).toBeTruthy();
    expect(screen.queryByText('Scanner Conveyor (Serial Number)')).toBeNull();
  });

  it('names each row once: the icon beside the name is hidden from screen readers', () => {
    useEditor.setState({ locale: 'fr' });
    render(<Palette />);
    const row = screen.getByText('Convoyeur Scanner (Numéro de Série)').closest('li')!;
    const icon = row.querySelector('svg')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('aria-label')).toBeNull();
    expect(within(row).queryByRole('img')).toBeNull();
  });

  it('labels the search field, not only with a placeholder', () => {
    render(<Palette />);
    expect(screen.getByRole('textbox', { name: 'Search objects' })).toBeTruthy();
  });

  it('says so when the search finds nothing', () => {
    render(<Palette />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search objects' }), { target: { value: 'zzzz' } });
    expect(status.textContent).toBe('No object matches this search');
  });

  it('marks the armed object\'s row as pressed, so an armed tool is never invisible', () => {
    useEditor.setState({ drag: { objectId: 'BP_ConveyorBelt_Straight_Tier1', rotation: 0, mirrored: false, cell: null } });
    render(<Palette />);
    const armedButton = screen.getByText('Straight Conveyor').closest('button')!;
    expect(armedButton.getAttribute('aria-pressed')).toBe('true');

    const otherButton = screen.getByText('Scanner Conveyor (Serial Number)').closest('button')!;
    expect(otherButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders each object name through the scrolling label', () => {
    // Some French names outgrow the sidebar (the country diverter is 50
    // characters). Scrolling itself is covered in ScrollingLabel.test.tsx.
    render(<Palette />);
    const label = screen.getByText('Straight Conveyor');
    expect(label.style.transform).toBe('translateX(0px)');
  });

  it('marks no row as pressed when no drag is armed', () => {
    render(<Palette />);
    const button = screen.getByText('Straight Conveyor').closest('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('the order and folding of the categories', () => {
  /** The category sections only. Expansions above them is also a <details>
   * with a list, shut by default, so it must be excluded. */
  const categories = () =>
    [...document.querySelectorAll<HTMLDetailsElement>('details[data-category]')];

  it('puts SCANNERS last', () => {
    // Scanners are placed once, so they sit below the categories used constantly.
    render(<Palette />);
    // Only the category sections: Expansions above them is a <details> too.
    const headings = categories().map((d) => d.querySelector('summary')?.textContent ?? '');
    expect(headings[headings.length - 1]).toMatch(/scanner/i);
    expect(headings[0]).toMatch(/conveyor/i);
  });

  it('lets each category fold away', () => {
    render(<Palette />);
    const sections = categories();
    expect(sections.length).toBeGreaterThan(1);
    // Open by default, so a first visit sees the whole palette.
    expect(sections.every((s) => s.open)).toBe(true);
  });

  it('remembers what was folded', () => {
    const { unmount } = render(<Palette />);
    const scanners = categories()
      .find((d) => /scanner/i.test(d.querySelector('summary')?.textContent ?? ''))!;
    scanners.open = false;
    fireEvent(scanners, new Event('toggle'));
    unmount();

    render(<Palette />);
    const again = categories()
      .find((d) => /scanner/i.test(d.querySelector('summary')?.textContent ?? ''))!;
    expect(again.open).toBe(false);
  });

  it('survives a browser that refuses localStorage', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => { throw new Error('denied'); };
    try {
      render(<Palette />);
      const first = categories()[0]!;
      first.open = false;
      expect(() => fireEvent(first, new Event('toggle'))).not.toThrow();
    } finally {
      window.localStorage.setItem = original;
    }
  });
});
