'use client';

import { useRef, useState } from 'react';

/**
 * A one-line label that scrolls its full text past on hover when it is too
 * long to fit, and is a plain ellipsised label when it is not.
 *
 * Translating the ellipsised block would only slide a truncated rendering, so
 * while scrolling the span becomes `inline-block` at its natural width with
 * the ellipsis off. Overflow is measured on hover, not on mount, so it stays
 * right after a language switch. Duration scales with the hidden width.
 */
export default function ScrollingLabel({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const scrolling = overflow > 0;

  return (
    <span
      className="block min-w-0 flex-1 overflow-hidden"
      title={text}
      onMouseEnter={() => {
        const el = ref.current;
        if (!el) return;
        // No scrolling under reduced motion.
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        // Measured while still in the at-rest block layout, where scrollWidth
        // is the full text width and clientWidth is the box.
        setOverflow(Math.max(0, el.scrollWidth - el.clientWidth));
      }}
      onMouseLeave={() => setOverflow(0)}
    >
      <span
        ref={ref}
        className={
          scrolling
            ? 'inline-block w-max whitespace-nowrap'
            : 'block overflow-hidden text-ellipsis whitespace-nowrap'
        }
        style={{
          // Roughly 40px a second, with a floor so a small overflow is a
          // readable crawl rather than a flicker.
          transition: `transform ${scrolling ? Math.max(1, overflow / 40) : 0.2}s linear`,
          transform: `translateX(${scrolling ? -overflow : 0}px)`,
        }}
      >
        {text}
      </span>
    </span>
  );
}
