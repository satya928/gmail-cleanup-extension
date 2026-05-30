if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = ((val: any) => JSON.parse(JSON.stringify(val))) as any;
}

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), crx({ manifest: manifest as any })],
});
