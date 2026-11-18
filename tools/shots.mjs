// Portfolio screenshots: node tools/shots.mjs [base URL] [character id]
// Run against a local server (npm run build && npx next start -p 3412) after creating a character
// from synthetic photos (E2E_BASE=http://localhost:3412 npx tsx scripts/e2e.mts). No real photos are used.
import fs from 'node:fs';
import path from 'node:path';
import { capture } from './shots-core.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = process.argv[2] || 'http://localhost:3412';
const id = process.argv[3] || JSON.parse(fs.readFileSync(path.join(ROOT, '.data/db.json'), 'utf8')).characters.at(-1).id;
await capture(ROOT, {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  phone: [
    { url: `${BASE}/`, file: 'home', wait: 9000 },
    { url: `${BASE}/create`, file: 'create', wait: 5000 },
    { url: `${BASE}/studio/animate?c=${id}`, file: 'animate', wait: 10000 },
    { url: `${BASE}/studio/customise?c=${id}`, file: 'customise', wait: 10000 },
  ],
  desktop: { url: `${BASE}/studio/animate?c=${id}`, wait: 10000 },
});
