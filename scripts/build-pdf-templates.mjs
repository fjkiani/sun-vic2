// Transpile packages/templates/pdf/*.jsx → *.js so plain Node can require them
// at Vercel runtime (Vercel Node has no JSX loader).
// Uses esbuild (already a transitive dep) with jsx-automatic runtime.

import { build } from 'esbuild';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '../packages/templates/pdf');

const entries = ['InvoicePDF.jsx', 'ContractPDF.jsx'];

for (const name of entries) {
  const inFile  = path.join(src, name);
  const outFile = path.join(src, name.replace(/\.jsx$/, '.js'));
  await build({
    entryPoints: [inFile],
    outfile: outFile,
    bundle: false,          // keep imports intact
    format: 'esm',
    platform: 'node',
    target: 'node18',
    loader: { '.jsx': 'jsx' },
    jsx: 'automatic',
    jsxImportSource: 'react',
    logLevel: 'info',
    write: true,
    allowOverwrite: true,
  });
  console.log('[pdf-templates] built', name, '→', path.basename(outFile));
}

// Point the barrel at .js
const barrelPath = path.join(src, 'index.js');
let barrel = await fs.readFile(barrelPath, 'utf8');
barrel = barrel
  .replace(/InvoicePDF\.jsx/g,  'InvoicePDF.js')
  .replace(/ContractPDF\.jsx/g, 'ContractPDF.js');
await fs.writeFile(barrelPath, barrel);
console.log('[pdf-templates] barrel updated → InvoicePDF.js / ContractPDF.js');
