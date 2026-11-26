# glyph

Draw your alphabet, get a font you can install. Runs in the browser.

[![CI](https://github.com/fly-die/glyph/actions/workflows/ci.yml/badge.svg)](https://github.com/fly-die/glyph/actions/workflows/ci.yml)

Status: early build. Draw mode works from first stroke to installed font. Paper mode (print a template, write on it, photograph it) comes next.

<!-- TODO: docs/demo.gif, drawing a few letters and typing with the exported font -->
<p align="center"><em>Demo GIF goes here.</em></p>

## What it does

- **Draw** each letter in its own cell, with a mouse, a finger or a pen. Pen pressure sets the stroke width. 73 cells: uppercase, lowercase, numerals and basic punctuation.
- **Guide letters** in empty cells show where a letter sits and how tall it is. Cells come in two sizes, the large one suits a tablet with a pen.
- **See it as you go.** A strip at the bottom of the window sets a line of text in your font while you draw, and the wordmark at the top turns into your handwriting letter by letter.
- **Test** the font in the type tester. The sample text is set in the real font, rebuilt after every stroke.
- **Export** an `.otf` to install, or a `.woff2` to use on a website, under a family name you choose.
- **Light and dark.** Follows your system, with a switch in the header.
- **Stays local.** There is no backend and no upload. Your drawing is kept in this browser only.

## How it works

    strokes -> outlines -> font units -> OpenType -> type tester

- **Strokes:** every cell records pointer events with position and pressure. Undo and clear work per cell.
- **Outlines:** each stroke is expanded to the area the pen covered, simplified with Ramer-Douglas-Peucker and fitted with cubic beziers. Overlaps keep the same winding, so a non-zero fill paints exactly the ink.
- **Font units:** the baseline and x-height guides of the cell set one scale for all glyphs: 1000 units per em, x-height at 500. Glyphs are not stretched to fill the box, so a small letter stays small.
- **Spacing:** the side bearings follow the stroke weight of the whole font, 0.6 times the median stroke width, so heavy writing gets more room than light writing.
- **OpenType:** [opentype.js](https://github.com/opentypejs/opentype.js) writes the font: `cmap`, `hmtx`, a space a bit over half as wide as the `n`, and a `name` table with your family name. Curly quotes and the Unicode hyphen map to the straight ones you drew, so text typed in apps with smart quotes still shows your glyphs.
- **WOFF2:** [woff2-encoder](https://github.com/itskyedo/woff2-encoder) compresses the font with WebAssembly. It is loaded only when you ask for a `.woff2`.
- **Live font:** the font is loaded straight from memory through the FontFace API and shared by the type tester, the preview strip and the wordmark.

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
