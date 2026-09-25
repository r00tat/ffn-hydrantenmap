#!/usr/bin/env node
/**
 * Renders every app icon from the logo designs in docs/design/:
 *
 * - logo.jpeg     — coloured artwork on white (web, PWA, login page)
 * - launcher.jpeg — white artwork on a blue tile (Android, header bar)
 *
 * Both are cut out of their background with soft edges ("colour to alpha"),
 * so the icons keep the anti-aliasing of the 2048 px originals instead of a
 * hard threshold. Web/PWA gets white background and coloured artwork, Android
 * blue background and white artwork — so both installs are told apart on one
 * home screen. The dev environment gets its own web set with a "DEV" band
 * (see appIconPath() in src/common/appEnvironment.ts).
 *
 * It also writes docs/design/vorschau-icons.png, a contact sheet of the
 * results for review. The outputs are committed; run this only after changing
 * the logo:
 *
 *   npm run icons
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_DIR = join(ROOT, 'docs/design');
const BRAND_DIR = join(ROOT, 'public/brand');
const ANDROID_RES = join(ROOT, 'capacitor/android/app/src/main/res');

type Rgb = [number, number, number];

const PRIMARY: Rgb = [0x19, 0x76, 0xd2];
const ACCENT: Rgb = [0xd3, 0x2f, 0x2f];
const WHITE: Rgb = [255, 255, 255];
const PRIMARY_HEX = '#1976d2';

/** Below this share of ink a pixel counts as JPEG noise on the background. */
const NOISE = 0.06;
/** From this share on a pixel is fully opaque (JPEG never quite reaches 1). */
const SOLID = 0.9;

/** Android density buckets relative to mdpi. */
const DENSITIES: Record<string, number> = {
  ldpi: 0.75,
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};

/** Splash sizes as shipped by the Capacitor template [width, height]. */
const SPLASHES: Record<string, [number, number]> = {
  drawable: [320, 480],
  'drawable-port-ldpi': [240, 320],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-ldpi': [320, 240],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
};

/** Share of `ink` in `pixel` when mixed over `background` (projection). */
function inkShare(pixel: Rgb, background: Rgb, ink: Rgb): number {
  let dot = 0;
  let norm = 0;
  for (let c = 0; c < 3; c++) {
    const d = ink[c] - background[c];
    dot += (pixel[c] - background[c]) * d;
    norm += d * d;
  }
  const share = dot / norm;
  return Math.min(1, Math.max(0, (share - NOISE) / (SOLID - NOISE)));
}

type Cutout = { data: Buffer; width: number; height: number };

/**
 * Cuts a single-background artwork out into RGBA. `paint` decides per pixel
 * which ink it belongs to and what colour it gets once opaque.
 */
async function cutOut(
  file: string,
  background: Rgb,
  paint: (pixel: Rgb) => { ink: Rgb; colour: (share: number) => Rgb },
  region?: { left: number; top: number; width: number; height: number },
): Promise<Cutout> {
  let image = sharp(file).removeAlpha();
  if (region) image = image.extract(region);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, o = 0; i < data.length; i += 3, o += 4) {
    const pixel: Rgb = [data[i], data[i + 1], data[i + 2]];
    const { ink, colour } = paint(pixel);
    const share = inkShare(pixel, background, ink);
    const [r, g, b] = colour(share);
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = Math.round(share * 255);
  }
  return trim({ data: out, width: info.width, height: info.height });
}

/** Crops to the opaque content and centres it on a transparent square. */
async function trim(cutout: Cutout): Promise<Cutout> {
  const { data, width, height } = cutout;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 64) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const side = Math.round(Math.max(w, h) * 1.02);
  const cropped = await sharp(data, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: w, height: h })
    .png()
    .toBuffer();
  const square = await sharp({
    create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: cropped, gravity: 'center' }])
    .raw()
    .toBuffer();
  return { data: square, width: side, height: side };
}

/** Colour artwork: blue flattened to the brand blue, red keeps its shading. */
function colourArtwork(): Promise<Cutout> {
  return cutOut(join(DESIGN_DIR, 'logo.jpeg'), WHITE, (pixel) => {
    if (pixel[2] >= pixel[0]) return { ink: PRIMARY, colour: () => PRIMARY };
    return {
      ink: ACCENT,
      // Un-mix the white of the anti-aliased edge so the rim is not pink.
      colour: (share) =>
        share >= 1 || share === 0
          ? pixel
          : (pixel.map((v, c) =>
              Math.round(Math.min(255, Math.max(0, WHITE[c] + (v - WHITE[c]) / share))),
            ) as Rgb),
    };
  });
}

/** White artwork, cut from the blue tile of launcher.jpeg. */
async function whiteArtwork(): Promise<Cutout> {
  const file = join(DESIGN_DIR, 'launcher.jpeg');
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // The tile colour, sampled inside the tile away from the artwork.
  const at = (x: number, y: number) => (y * info.width + x) * 3;
  const tile: Rgb = [data[at(330, 420)], data[at(330, 420) + 1], data[at(330, 420) + 2]];
  // Inside the rounded tile, clear of its white surroundings. The artwork was
  // measured at x 391–1657, y 561–1442 (tile: 256–1790 × 247–1765); the region
  // adds 40 px around it and still stays inside the tile's rounded corners.
  const region = { left: 350, top: 520, width: 1350, height: 965 };
  return cutOut(file, tile, () => ({ ink: WHITE, colour: () => WHITE }), region);
}

function asPng(art: Cutout): sharp.Sharp {
  return sharp(art.data, { raw: { width: art.width, height: art.height, channels: 4 } });
}

type Background = { kind: 'square' | 'rounded' | 'circle' | 'none'; color: string };

/** Artwork of `scale`×(shorter side) centred on a canvas of width×height. */
async function compose(
  art: Cutout,
  width: number,
  height: number,
  scale: number,
  background: Background,
  dev = false,
): Promise<Buffer> {
  const size = Math.round(Math.min(width, height) * scale);
  const shape =
    background.kind === 'rounded'
      ? `<rect width="${width}" height="${height}" rx="${width * 0.18}" fill="${background.color}"/>`
      : background.kind === 'circle'
        ? `<circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" fill="${background.color}"/>`
        : background.kind === 'square'
          ? `<rect width="${width}" height="${height}" fill="${background.color}"/>`
          : '';
  const layers: sharp.OverlayOptions[] = [
    {
      input: await asPng(art).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer(),
      gravity: 'center',
    },
  ];
  if (dev) layers.push({ input: devBand(width, height), top: 0, left: 0 });
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shape}</svg>`),
  )
    .composite(layers)
    .png()
    .toBuffer();
}

/** Yellow/black hazard band with "DEV" across the lower part of the icon. */
function devBand(width: number, height: number): Buffer {
  const bandH = height * 0.3;
  const bandY = height - bandH;
  const stripe = Math.max(2, bandH / 6);
  const edge = bandH * 0.14;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="h" patternUnits="userSpaceOnUse" width="${stripe * 2}" height="${stripe * 2}" patternTransform="rotate(45)">
      <rect width="${stripe}" height="${stripe * 2}" fill="#212121"/>
    </pattern>
  </defs>
  <rect x="0" y="${bandY}" width="${width}" height="${bandH}" fill="#fbc02d"/>
  <rect x="0" y="${bandY}" width="${width}" height="${edge}" fill="url(#h)"/>
  <rect x="0" y="${bandY + bandH - edge}" width="${width}" height="${edge}" fill="url(#h)"/>
  <text x="${width / 2}" y="${bandY + bandH * 0.72}" text-anchor="middle" font-family="Roboto, Arial, Helvetica, sans-serif" font-weight="900" font-size="${bandH * 0.62}" fill="#212121">DEV</text>
</svg>`);
}

/** ICO container with PNG-compressed entries (supported by all current browsers). */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

async function write(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  console.log(`wrote ${path.slice(ROOT.length + 1)}`);
}

const ON_WHITE: Background = { kind: 'square', color: '#ffffff' };
const TRANSPARENT: Background = { kind: 'none', color: '' };
/**
 * Favicons sit on a white tile: the helmet and the gaps of the artwork are
 * white in the design, cut out they would vanish in a dark tab bar.
 */
const FAVICON_TILE: Background = { kind: 'rounded', color: '#ffffff' };

function favicon(art: Cutout, dev = false): Promise<Buffer> {
  return Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      png: await compose(art, size, size, 0.92, FAVICON_TILE, dev),
    })),
  ).then(ico);
}

/** Web/PWA set: white background, coloured artwork. */
async function webSet(art: Cutout, dir: string, dev: boolean): Promise<void> {
  await write(join(dir, 'icon-192.png'), await compose(art, 192, 192, 0.86, ON_WHITE, dev));
  await write(join(dir, 'icon-512.png'), await compose(art, 512, 512, 0.86, ON_WHITE, dev));
  // Maskable: the artwork must stay inside the central circle (r = 40%).
  await write(join(dir, 'icon-maskable-512.png'), await compose(art, 512, 512, 0.66, ON_WHITE, dev));
  await write(join(dir, 'apple-touch-icon.png'), await compose(art, 180, 180, 0.8, ON_WHITE, dev));
  await write(join(dir, 'favicon.ico'), await favicon(art, dev));
}

/** Android launcher, adaptive foreground and splash: blue with white artwork. */
async function androidSet(white: Cutout): Promise<void> {
  for (const [bucket, factor] of Object.entries(DENSITIES)) {
    const dir = join(ANDROID_RES, `mipmap-${bucket}`);
    const legacy = Math.round(48 * factor);
    await write(
      join(dir, 'ic_launcher.png'),
      await compose(white, legacy, legacy, 0.74, { kind: 'rounded', color: PRIMARY_HEX }),
    );
    await write(
      join(dir, 'ic_launcher_round.png'),
      await compose(white, legacy, legacy, 0.66, { kind: 'circle', color: PRIMARY_HEX }),
    );
    // Adaptive icon: 108dp canvas, the launcher mask may cut everything
    // outside the central 66dp circle.
    const adaptive = Math.round(108 * factor);
    await write(
      join(dir, 'ic_launcher_foreground.png'),
      await compose(white, adaptive, adaptive, 0.54, TRANSPARENT),
    );
    // Status bar / notification small icon: 24dp, Android uses only its
    // alpha channel, so it is the white artwork on transparent.
    const status = Math.round(24 * factor);
    await write(
      join(ANDROID_RES, `drawable-${bucket}`, 'ic_stat_einsatzkarte.png'),
      await compose(white, status, status, 0.92, TRANSPARENT),
    );
  }
  for (const [folder, [width, height]] of Object.entries(SPLASHES)) {
    await write(
      join(ANDROID_RES, folder, 'splash.png'),
      await compose(white, width, height, 0.62, { kind: 'square', color: PRIMARY_HEX }),
    );
  }
}

/** Contact sheet of the generated icons, so a review never looks at stale files. */
async function previewSheet(): Promise<void> {
  const tile = 240;
  const gap = 20;
  const res = (path: string) => join(ANDROID_RES, path);
  const fit = (file: string, background?: string) => {
    const image = sharp(file).resize(tile, tile, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
    return (background ? image.flatten({ background }) : image).png().toBuffer();
  };
  // The adaptive foreground as a circular launcher mask would show it.
  const circle = Buffer.from(
    `<svg width="${tile}" height="${tile}"><circle cx="${tile / 2}" cy="${tile / 2}" r="${tile / 2}" fill="${PRIMARY_HEX}"/></svg>`,
  );
  const adaptive = await sharp(circle)
    .composite([
      { input: await fit(res('mipmap-xxxhdpi/ic_launcher_foreground.png')) },
      { input: circle, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
  const rows: Buffer[][] = [
    [
      await fit(join(BRAND_DIR, 'icon-512.png')),
      await fit(join(BRAND_DIR, 'icon-maskable-512.png')),
      await fit(join(BRAND_DIR, 'dev/icon-512.png')),
      await fit(res('mipmap-xxxhdpi/ic_launcher.png')),
      await fit(res('mipmap-xxxhdpi/ic_launcher_round.png')),
      await sharp(res('drawable-port-xxxhdpi/splash.png')).resize({ height: tile }).png().toBuffer(),
    ],
    [
      adaptive,
      await fit(join(BRAND_DIR, 'logo-weiss.png'), PRIMARY_HEX),
      await fit(join(BRAND_DIR, 'logo.png'), '#202124'),
    ],
  ];
  const cells = rows.flatMap((row, y) =>
    row.map((input, x) => ({ input, left: gap + x * (tile + gap), top: gap + y * (tile + gap) })),
  );
  await sharp({
    create: {
      width: 6 * (tile + gap) + gap,
      height: rows.length * (tile + gap) + gap,
      channels: 3,
      background: '#eeeeee',
    },
  })
    .composite(cells)
    .png()
    .toFile(join(DESIGN_DIR, 'vorschau-icons.png'));
}

async function main(): Promise<void> {
  const colour = await colourArtwork();
  const white = await whiteArtwork();

  // Masters for the UI (login page, header bar); next/image scales them.
  await write(join(BRAND_DIR, 'logo.png'), await asPng(colour).resize(1024, 1024).png().toBuffer());
  await write(join(BRAND_DIR, 'logo-weiss.png'), await asPng(white).resize(1024, 1024).png().toBuffer());

  await webSet(colour, BRAND_DIR, false);
  await webSet(colour, join(BRAND_DIR, 'dev'), true);
  // Browsers and crawlers ask for /favicon.ico without reading any <link>.
  await write(join(ROOT, 'public/favicon.ico'), await favicon(colour));
  await androidSet(white);
  await previewSheet();
}

await main();
