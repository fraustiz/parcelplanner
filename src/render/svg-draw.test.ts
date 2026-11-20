import { describe, it, expect } from 'vitest';
import { createSvgDraw } from './svg-draw';

describe('the SVG Draw2D', () => {
  it('writes a filled rectangle', () => {
    const ctx = createSvgDraw();
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(1, 2, 3, 4);
    expect(ctx.toSvg(10, 10, '#000')).toContain('<rect x="1" y="2" width="3" height="4" fill="#ff0000"/>');
  });

  it('carries the current transform onto each shape', () => {
    const ctx = createSvgDraw();
    ctx.translate(10, 20);
    ctx.fillRect(0, 0, 1, 1);
    expect(ctx.toSvg(10, 10, '#000')).toContain('matrix(1 0 0 1 10 20)');
  });

  it('composes transforms the way a canvas does', () => {
    // translate then scale: the scale happens in the translated frame, as the renderer relies on.
    const ctx = createSvgDraw();
    ctx.translate(10, 0);
    ctx.scale(2, 2);
    ctx.fillRect(0, 0, 1, 1);
    expect(ctx.toSvg(10, 10, '#000')).toContain('matrix(2 0 0 2 10 0)');
  });

  it('restores the transform that was saved, not the one before it', () => {
    const ctx = createSvgDraw();
    ctx.translate(5, 5);
    ctx.save();
    ctx.translate(100, 100);
    ctx.restore();
    ctx.fillRect(0, 0, 1, 1);
    expect(ctx.toSvg(10, 10, '#000')).toContain('matrix(1 0 0 1 5 5)');
  });

  it('turns a rotation into the same matrix a canvas would', () => {
    const ctx = createSvgDraw();
    ctx.rotate(Math.PI / 2);
    ctx.fillRect(0, 0, 1, 1);
    // cos 90 = 0, sin 90 = 1.
    expect(ctx.toSvg(10, 10, '#000')).toContain('matrix(0 1 -1 0 0 0)');
  });

  it('writes a path built with moveTo and lineTo', () => {
    const ctx = createSvgDraw();
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(5, 5);
    ctx.stroke();
    expect(ctx.toSvg(10, 10, '#000')).toContain('d="M0 0L5 5"');
  });

  it('starts a fresh path on beginPath, rather than appending forever', () => {
    const ctx = createSvgDraw();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(1, 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(9, 9);
    ctx.stroke();
    expect(ctx.toSvg(10, 10, '#000')).not.toContain('M0 0L1 1M9 9');
  });

  it('passes an artwork path through as it was authored', () => {
    const ctx = createSvgDraw();
    ctx.fillStyle = '#044ABE';
    ctx.fillPath('M6 2L6 10');
    expect(ctx.toSvg(10, 10, '#000')).toContain('<path d="M6 2L6 10" fill="#044ABE"/>');
  });

  it('carries opacity, which is how a floor below is faded', () => {
    const ctx = createSvgDraw();
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, 1, 1);
    expect(ctx.toSvg(10, 10, '#000')).toContain('opacity="0.5"');
  });

  it('clips, which is how a lower floor is shown only past the deck', () => {
    const ctx = createSvgDraw();
    ctx.save();
    ctx.clipRect(0, 0, 32, 32);
    ctx.fillRect(0, 0, 100, 100);
    ctx.restore();
    const svg = ctx.toSvg(10, 10, '#000');
    expect(svg).toContain('<clipPath id="c0"');
    expect(svg).toContain('clip-path="url(#c0)"');
  });

  it('stops clipping once the save is restored', () => {
    const ctx = createSvgDraw();
    ctx.save();
    ctx.clipRect(0, 0, 32, 32);
    ctx.restore();
    ctx.fillRect(0, 0, 1, 1);
    expect(ctx.toSvg(10, 10, '#000')).not.toContain('clip-path="url(#c0)"><rect x="0" y="0" width="1"');
  });

  it('escapes text and colours rather than trusting them into markup', () => {
    // Object names reach fillText, and a colour comes from a plan that may
    // have arrived from a stranger's link.
    const ctx = createSvgDraw();
    ctx.fillStyle = '"><script>';
    ctx.fillText('a & b <c>', 0, 0);
    const svg = ctx.toSvg(10, 10, '#000');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('a &amp; b &lt;c&gt;');
  });

  it('paints the background first, so nothing shows through', () => {
    const ctx = createSvgDraw();
    expect(ctx.toSvg(1200, 630, '#0f1115'))
      .toContain('<rect width="1200" height="630" fill="#0f1115"/>');
  });
});
