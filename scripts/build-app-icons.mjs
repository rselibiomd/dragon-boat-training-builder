// Preserve the official artwork; only trim its white border, resize and pad it.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const source = await sharp(new URL('../public/kdbc-logo.jpeg', import.meta.url).pathname)
  .trim({ background: '#ffffff', threshold: 20 }).png().toBuffer();
await mkdir(new URL('public/icons/', root), { recursive: true });

for (const [name, size, fraction] of [
  ['apple-touch-icon.png', 180, 0.86],
  ['kdbc-192.png', 192, 0.86],
  ['kdbc-512.png', 512, 0.86],
  // A centered 56% square fits completely inside Android's 80% safe circle.
  ['kdbc-maskable-512.png', 512, 0.56],
  ['favicon-32.png', 32, 0.94],
]) {
  const extent = Math.floor(size * fraction);
  const mark = await sharp(source).resize(extent, extent, { fit: 'inside' }).toBuffer();
  const png = await sharp({ create: { width: size, height: size, channels: 3, background: '#ffffff' } })
    .composite([{ input: mark, gravity: 'centre' }]).png().toBuffer();
  await writeFile(new URL(`public/icons/${name}`, root), png);
}
// Keep old bookmarks using these SVG URLs on the same official identity.
const png = (await readFile(new URL('public/icons/kdbc-512.png', root))).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${png}"/></svg>\n`;
await writeFile(new URL('public/app-icon.svg', root), svg);
await writeFile(new URL('public/favicon.svg', root), svg);
