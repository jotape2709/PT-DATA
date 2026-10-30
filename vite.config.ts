/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> dist/ (site estático que lê public/data/*.json)
// `npm run build:single` -> dist-single/index.html (um arquivo, dados e fontes embutidos)
// `--mode artifact`      -> igual ao single, mas troca downloads por "copiar" (páginas em iframe sem download)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' || mode === 'artifact' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : mode === 'artifact' ? 'dist-artifact' : 'dist',
    assetsInlineLimit: mode === 'single' || mode === 'artifact' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 2000,
  },
  test: { include: ['tests/**/*.test.ts'] },
}));
