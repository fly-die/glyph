import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // The WOFF2 encoder is about 1 MB of inlined WebAssembly. It is its own
    // chunk, loaded only when someone exports a .woff2.
    chunkSizeWarningLimit: 1100,
  },
});
