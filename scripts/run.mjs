#!/usr/bin/env node
/**
 * Cross-platform test runner used by `npm test` and `npm run test:fixed`.
 *
 *   node scripts/run.mjs            -> run against the app WITH the planted bugs;
 *                                      succeeds when all regular tests pass AND every @bug test fails
 *   node scripts/run.mjs --fixed    -> run against the app with FIX_PLANTED_BUGS=1;
 *                                      succeeds only when every test passes
 *
 * Extra args are forwarded to `playwright test` (e.g. `npm test -- --headed`).
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const fixed = args.includes('--fixed');
const forwarded = args.filter((a) => a !== '--fixed');
const env = { ...process.env, ...(fixed ? { FIX_PLANTED_BUGS: '1' } : {}) };

const pw = spawnSync('npx', ['playwright', 'test', ...forwarded], { stdio: 'inherit', env, shell: process.platform === 'win32' });
if (pw.error) {
  console.error(pw.error);
  process.exit(2);
}
const verify = spawnSync(process.execPath, ['scripts/verify-results.mjs', ...(fixed ? ['--expect-fixed'] : [])], {
  stdio: 'inherit',
  env,
});
process.exit(verify.status ?? 1);
