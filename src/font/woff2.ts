/**
 * Compresses an OpenType font to WOFF2 for use on websites. The encoder is
 * Google's woff2 compiled to WebAssembly, loaded only when it is first needed
 * so it does not weigh on the first page load.
 */
export async function toWoff2(otf: ArrayBuffer): Promise<ArrayBuffer> {
  const { compress } = await import('woff2-encoder');
  const woff2 = await compress(otf);
  return woff2.slice().buffer;
}
