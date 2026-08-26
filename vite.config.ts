import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        launcher: resolve(__dirname, 'index.html'),
        sun: resolve(__dirname, 'sun.html'),
        mirror: resolve(__dirname, 'mirror.html'),
        blackhole: resolve(__dirname, 'blackhole.html'),
        prism: resolve(__dirname, 'prism.html'),
        earth: resolve(__dirname, 'earth.html'),
        mars: resolve(__dirname, 'mars.html')
      }
    }
  },
  test: {
    environment: 'jsdom'
  }
});
