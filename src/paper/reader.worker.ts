import type { Contour, Point } from '../outline';
import { downscale, grayFromRgba } from './image';
import { readSheet, straightenedSheet } from './read';

export interface ReadRequest {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

export type ReadResponse =
  | { ok: false; error: string }
  | {
      ok: true;
      /** The photo as read, after scaling down, with the markers on it. */
      photo: { width: number; height: number; gray: Uint8ClampedArray };
      markers: Point[];
      straightened: { width: number; height: number; gray: Uint8ClampedArray };
      glyphs: [string, Contour[]][];
    };

/** Longest side the photo is read at. Enough for 20 mm cells, fast on a phone. */
const READ_SIZE = 1600;
const STRAIGHT_PX_PER_MM = 2;

const toBytes = (data: Float32Array): Uint8ClampedArray => Uint8ClampedArray.from(data, (value) => value * 255);

// Reading a sheet takes about half a second, so it runs here and the page stays responsive.
self.addEventListener('message', (event: MessageEvent<ReadRequest>) => {
  const { rgba, width, height } = event.data;
  const photo = downscale(grayFromRgba(rgba, width, height), READ_SIZE);
  const reading = readSheet(photo);
  let response: ReadResponse;
  if (typeof reading === 'string') {
    response = { ok: false, error: reading };
  } else {
    const straight = straightenedSheet(photo, reading.toPhoto, STRAIGHT_PX_PER_MM);
    response = {
      ok: true,
      photo: { width: photo.width, height: photo.height, gray: toBytes(photo.data) },
      markers: reading.markers,
      straightened: { width: straight.width, height: straight.height, gray: toBytes(straight.data) },
      glyphs: [...reading.glyphs],
    };
  }
  (self as unknown as { postMessage(message: unknown): void }).postMessage(response);
});
