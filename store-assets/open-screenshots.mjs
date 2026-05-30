/**
 * Opens all store screenshot mockups in Chrome at the correct size.
 * Run: node store-assets/open-screenshots.mjs
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

const files = [
  { file: 'screenshot-1-scanning.html', w: 1280, h: 800, label: 'Scanning screen' },
  { file: 'screenshot-2-results.html',  w: 1280, h: 800, label: 'Results dashboard' },
  { file: 'promo-tile.html',            w: 440,  h: 280, label: 'Promo tile' },
];

console.log('\n📸 Opening store assets in Chrome...\n');

for (const { file, w, h, label } of files) {
  const fullPath = path.join(dir, file);
  const url = `file:///${fullPath.replace(/\\/g, '/')}`;
  try {
    execSync(`start chrome --new-window --window-size=${w},${h} "${url}"`, { shell: true });
    console.log(`  ✓ ${label} (${w}×${h}) → ${file}`);
  } catch {
    console.log(`  ⚠ Could not auto-open ${file} — open it manually in Chrome`);
    console.log(`    URL: ${url}`);
  }
}

console.log(`
Next steps for each tab:
  1. Press F12 → Toggle device toolbar → set exact dimensions
  2. Close DevTools
  3. Ctrl+Shift+P → "Capture screenshot" → save to store-assets/
`);
