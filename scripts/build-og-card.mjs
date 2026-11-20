import sharp from 'sharp';

/**
 * Builds the social card and the mobile preview from the contributed screenshot.
 *
 *   assets/social/og-card-source.png  (the clean source, kept untouched)
 *     -> public/og-card.png    1200x630, with the credit written on it
 *     -> public/preview.webp   760px wide, for the mobile empty state
 *
 * Not part of `npm run build`, since the inputs rarely change:
 *   node scripts/build-og-card.mjs
 */

const SOURCE = 'assets/social/og-card-source.png';
const CARD = 'public/og-card.png';
const PREVIEW = 'public/preview.webp';

const CREDIT = 'Thumbnail design by Gremlin Lily';

// Credit in the bottom-left corner, clear of the export door in the screenshot.
const FONT_SIZE = 20;
const COLOUR = '#cfccd0';
const MARGIN = 40;
const BASELINE = 609;

// Sharp at about 340 CSS px on a high-density phone. Images are served
// unoptimized (next.config.ts), so this is the delivered size.
const PREVIEW_WIDTH = 760;

const { width, height } = await sharp(SOURCE).metadata();

const label = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
     <text x="${MARGIN}" y="${BASELINE}" fill="${COLOUR}"
           font-family="Segoe UI, DejaVu Sans, Helvetica, Arial, sans-serif"
           font-size="${FONT_SIZE}">${CREDIT}</text>
   </svg>`,
);

await sharp(SOURCE).composite([{ input: label, top: 0, left: 0 }]).png().toFile(CARD);
await sharp(CARD).resize({ width: PREVIEW_WIDTH }).webp({ quality: 82 }).toFile(PREVIEW);

const card = await sharp(CARD).metadata();
const preview = await sharp(PREVIEW).metadata();
console.log(`${CARD} ${card.width}x${card.height}`);
console.log(`${PREVIEW} ${preview.width}x${preview.height}`);
