// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import Suggest from './Suggest';
import { useEditor } from '@/store/editor';

afterEach(cleanup);
beforeEach(() => useEditor.setState({ locale: 'en' }));

describe('the suggestion box', () => {
  const open = () => {
    fireEvent.click(screen.getByRole('button', { name: /suggest/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Write a suggestion' }));
  };

  it('says it is not an AI before the box opens, with Cancel on the right', () => {
    render(<Suggest />);
    fireEvent.click(screen.getByRole('button', { name: /suggest/i }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('dialog').textContent).toMatch(/not an AI/i);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons.indexOf('Write a suggestion')).toBeLessThan(buttons.indexOf('Cancel'));
  });

  it('Cancel closes the notice without opening the box', () => {
    render(<Suggest />);
    fireEvent.click(screen.getByRole('button', { name: /suggest/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('names the CREATOR as the reader, in the field itself', () => {
    // A lone field that thanks you reads like a chatbot; people write
    // differently when they know a person reads it.
    render(<Suggest />);
    open();
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toMatch(/creator/i);
  });

  it('answers the question rather than denying the machine', () => {
    // The outright "not an AI" lives in the notice before the box. The field
    // itself keeps answering the question by naming who reads it.
    render(<Suggest />);
    open();
    expect(screen.getByRole('textbox').getAttribute('placeholder')).not.toMatch(/AI|chatbot|robot/i);
  });

  it('says the same in French', () => {
    useEditor.setState({ locale: 'fr' });
    render(<Suggest />);
    fireEvent.click(screen.getByRole('button', { name: /suggérer/i }));
    expect(screen.getByRole('dialog').textContent).toMatch(/pas une IA/i);
    fireEvent.click(screen.getByRole('button', { name: 'Écrire une idée' }));
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toMatch(/créateur/i);
  });
});

describe('the suggestion box and the keyboard', () => {
  const trigger = () => screen.getByRole('button', { name: /suggest/i });

  it('puts focus on the way out of the notice, and Escape closes it', () => {
    render(<Suggest />);
    trigger().focus();
    fireEvent.click(trigger());
    expect(document.activeElement?.textContent).toBe('Cancel');

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('focuses the field, and Escape gives focus back to the button', () => {
    render(<Suggest />);
    trigger().focus();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'Write a suggestion' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Your suggestion' }));

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('says it is sending, and announces the outcome', async () => {
    let finish: (response: Response) => void = () => {};
    vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => { finish = resolve; }));
    try {
      render(<Suggest />);
      fireEvent.click(trigger());
      fireEvent.click(screen.getByRole('button', { name: 'Write a suggestion' }));
      const status = screen.getByRole('status');
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'More racks' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      const sending = screen.getByRole('button', { name: 'Sending…' }) as HTMLButtonElement;
      expect(sending.disabled).toBe(true);

      await act(async () => { finish(new Response(null, { status: 500 })); });
      expect(status.textContent).toMatch(/could not send|try again/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
