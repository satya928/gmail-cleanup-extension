/**
 * Creates gmail-cleanup-v<version>.zip from the dist/ folder.
 * Uses PowerShell Compress-Archive (Windows built-in).
 */
import { execSync }   from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

const pkg     = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;
const zipName = `gmail-cleanup-v${version}.zip`;
const distDir = path.resolve('dist');

console.log(`\nPackaging dist/ → ${zipName} …`);

// Remove existing zip if present
try { execSync(`if (Test-Path "${zipName}") { Remove-Item "${zipName}" }`, { shell: 'powershell.exe', stdio: 'inherit' }); }
catch { /* ignore */ }

execSync(
  `Compress-Archive -Path "${distDir}\\*" -DestinationPath "${zipName}" -CompressionLevel Optimal`,
  { shell: 'powershell.exe', stdio: 'inherit' }
);

const size = (readFileSync(zipName).length / 1024).toFixed(1);
console.log(`✓ ${zipName}  (${size} KB)  — ready to upload to Chrome Web Store\n`);
