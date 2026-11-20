'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Open layers, oldest first. Only the last one answers Escape and Tab, so a
 * question asked over a side panel closes before the panel does. */
const open: symbol[] = [];

function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/**
 * Focus handling shared by every dialog, panel and menu.
 *
 * While `active`: focus moves into `ref` (`data-autofocus`, else the first
 * control, else the container), Escape calls `onClose`, and with `modal` Tab
 * cycles inside. Escape is preventDefault-ed so the canvas keeps its
 * selection. On close, focus returns to where it was, unless it has moved since.
 */
export function useDialog(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  { onClose, modal = false, escape = true }: {
    onClose: () => void;
    modal?: boolean;
    /** False for a layer that answers Escape itself, such as a menu with a submenu. */
    escape?: boolean;
  },
): void {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const me = Symbol('dialog');
    open.push(me);
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const first = node.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(node)[0];
    if (first) first.focus();
    else {
      if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
      node.focus();
    }

    // Capture phase on window, so this runs before the bubbling listeners
    // the canvas and the editor keep for their own shortcuts.
    const onKey = (event: KeyboardEvent) => {
      if (open[open.length - 1] !== me || event.defaultPrevented) return;
      if (event.key === 'Escape' && escape) {
        // A side panel stays open while a field elsewhere takes its own Escape.
        if (!modal && typing(event.target) && !node.contains(event.target as Node)) return;
        event.preventDefault();
        close.current();
        return;
      }
      if (!modal || event.key !== 'Tab') return;
      const list = focusables(node);
      if (list.length === 0) { event.preventDefault(); return; }
      const at = document.activeElement;
      const head = list[0]!;
      const tail = list[list.length - 1]!;
      const outside = !node.contains(at);
      if (event.shiftKey && (at === head || outside)) { event.preventDefault(); tail.focus(); }
      else if (!event.shiftKey && (at === tail || outside)) { event.preventDefault(); head.focus(); }
    };
    window.addEventListener('keydown', onKey, true);

    return () => {
      window.removeEventListener('keydown', onKey, true);
      const index = open.indexOf(me);
      if (index >= 0) open.splice(index, 1);
      const now = document.activeElement;
      const lost = now === null || now === document.body || node.contains(now);
      if (lost && before?.isConnected) before.focus();
    };
  }, [active, modal, escape, ref]);
}
