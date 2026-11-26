/** A single channel image. 0 is black, 1 is white. */
export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

export function createGray(width: number, height: number, fill = 0): GrayImage {
  return { width, height, data: new Float32Array(width * height).fill(fill) };
}

/** Converts RGBA pixels, as a canvas returns them, to luminance. */
export function grayFromRgba(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const image = createGray(width, height);
  for (let index = 0; index < width * height; index++) {
    const r = rgba[index * 4] ?? 0;
    const g = rgba[index * 4 + 1] ?? 0;
    const b = rgba[index * 4 + 2] ?? 0;
    image.data[index] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return image;
}

export function pixel(image: GrayImage, x: number, y: number): number {
  return image.data[y * image.width + x] ?? 1;
}

/** Bilinear sample at a fractional position. Outside the image reads as black, like a table under the sheet. */
export function sample(image: GrayImage, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= image.width - 1 || y0 >= image.height - 1) return 0;
  const fx = x - x0;
  const fy = y - y0;
  const top = pixel(image, x0, y0) * (1 - fx) + pixel(image, x0 + 1, y0) * fx;
  const bottom = pixel(image, x0, y0 + 1) * (1 - fx) + pixel(image, x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Mean over a square window around every pixel, from a summed area table. */
export function boxMean(image: GrayImage, radius: number): GrayImage {
  const { width, height, data } = image;
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[y * width + x] ?? 0;
      sums[(y + 1) * (width + 1) + x + 1] = (sums[y * (width + 1) + x + 1] ?? 0) + row;
    }
  }
  const out = createGray(width, height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const total =
        (sums[y1 * (width + 1) + x1] ?? 0) -
        (sums[y0 * (width + 1) + x1] ?? 0) -
        (sums[y1 * (width + 1) + x0] ?? 0) +
        (sums[y0 * (width + 1) + x0] ?? 0);
      out.data[y * width + x] = total / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/** The value below which `share` of the pixels lie. */
export function percentile(image: GrayImage, share: number): number {
  const sorted = Float32Array.from(image.data).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 1;
}

/** Scales an image down so its longer side is at most `limit`, by averaging blocks. */
export function downscale(image: GrayImage, limit: number): GrayImage {
  const factor = Math.max(image.width, image.height) / limit;
  if (factor <= 1) return image;
  const width = Math.round(image.width / factor);
  const height = Math.round(image.height / factor);
  const out = createGray(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor(x * factor);
      const sy0 = Math.floor(y * factor);
      const sx1 = Math.min(image.width, Math.floor((x + 1) * factor));
      const sy1 = Math.min(image.height, Math.floor((y + 1) * factor));
      let total = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) total += pixel(image, sx, sy);
      out.data[y * width + x] = total / Math.max(1, (sx1 - sx0) * (sy1 - sy0));
    }
  }
  return out;
}
