# glyph

Draw your alphabet, get a font you can install. Runs in the browser.

[![CI](https://github.com/fly-die/glyph/actions/workflows/ci.yml/badge.svg)](https://github.com/fly-die/glyph/actions/workflows/ci.yml)

Status: early build. Draw mode works from first stroke to installed font. Paper mode (print a template, write on it, photograph it) comes next.

<!-- TODO: docs/demo.gif, drawing a few letters and typing with the exported font -->
<p align="center"><em>Demo GIF goes here.</em></p>

## What it does

- **Draw** each letter in its own cell, with a mouse, a finger or a pen. Pen pressure sets the stroke width.
- **Test** the font while you draw. The sample text is set in the real font, rebuilt after every stroke.
- **Export** an `.otf` under a family name you choose. Open the file to install it.
- **Stays local.** There is no backend and no upload. Your drawing is kept in this browser only.

## How it works

    strokes -> outlines -> font units -> OpenType -> type tester

- **Strokes:** every cell records pointer events with position and pressure. Undo and clear work per cell.
- **Outlines:** each stroke is expanded to the area the pen covered, simplified with Ramer-Douglas-Peucker and fitted with cubic beziers. Overlaps keep the same winding, so a non-zero fill paints exactly the ink.
- **Font units:** the baseline and x-height guides of the cell set one scale for all glyphs: 1000 units per em, x-height at 500. Glyphs are not stretched to fill the box, so a small letter stays small.
- **OpenType:** [opentype.js](https://github.com/opentypejs/opentype.js) writes the font: `cmap`, `hmtx` with fixed side bearings, a space as wide as the `n`, and a `name` table with your family name.
- **Type tester:** the font is loaded straight from memory through the FontFace API.

## Run locally

```
npm install
npm run dev
```

Open the printed address and draw a few letters. Node 22.12 or newer, see `.nvmrc`.

## Test

```
npm test
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type check and production build |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript only |

## License

MIT, see [LICENSE](LICENSE).
