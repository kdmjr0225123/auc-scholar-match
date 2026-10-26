// Copies src/lib/matching.ts into every edge function that uses it, so the
// dashboard, the emails and the audit gate all apply the same rules.
// Usage: node scripts/sync-matching.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const TARGETS = ['match-digest', 'scholarship-reminders', 'synthetic-coverage-check', 'scholarship-audit'];
const src = readFileSync('src/lib/matching.ts', 'utf8');
const header = '// GENERATED from src/lib/matching.ts by scripts/sync-matching.mjs. Do not edit here.\n';
const check = process.argv.includes('--check');
let stale = 0;
for (const fn of TARGETS) {
  const path = `supabase/functions/${fn}/matching.ts`;
  const want = header + src;
  const have = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (have === want) continue;
  if (check) { console.error(`stale: ${path}`); stale++; }
  else { writeFileSync(path, want); console.log(`wrote ${path}`); }
}
if (check && stale) process.exit(1);
