#!/usr/bin/env node
/**
 * Reads reports/results.json (Playwright JSON reporter) and checks the suite behaved
 * as designed:
 *   - every test WITHOUT the @bug tag passed           (no regressions)
 *   - every test WITH the @bug tag failed              (planted defect still detected)
 * Prints a defect summary (also to $GITHUB_STEP_SUMMARY in CI) and exits non-zero otherwise.
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
// --expect-fixed: the app ran with FIX_PLANTED_BUGS=1, so every test (incl. @bug) must pass.
const expectFixed = args.includes('--expect-fixed');
const file = args.find((a) => !a.startsWith('--')) ?? 'reports/results.json';
if (!fs.existsSync(file)) {
  console.error(`No results file at ${file}. Did the Playwright run start?`);
  process.exit(2);
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'));

const rows = [];
const walk = (suite, trail = []) => {
  const here = suite.title && !suite.title.endsWith('.ts') ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const last = t.results?.[t.results.length - 1];
      rows.push({
        title: [...here, spec.title].join(' › '),
        file: spec.file,
        project: t.projectName,
        bug: (spec.tags ?? []).some((tag) => tag.replace(/^@/, '') === 'bug'),
        defect: (t.annotations ?? []).find((a) => a.type === 'defect')?.description,
        status: last?.status ?? 'skipped',
      });
    }
  }
  for (const s of suite.suites ?? []) walk(s, here);
};
for (const s of report.suites ?? []) walk(s);

const failedLike = (s) => s === 'failed' || s === 'timedOut';
if (expectFixed) {
  const notPassed = rows.filter((r) => r.status !== 'passed');
  console.log(`Fixed-app run: ${rows.length - notPassed.length}/${rows.length} tests passed.`);
  for (const r of notPassed) console.log(`- NOT PASSED (${r.status}): ${r.title} [${r.file}]`);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Fixed-app run\n\n${rows.length - notPassed.length}/${rows.length} tests passed (all @bug tests go green once the bugs are fixed).\n`
    );
  process.exit(notPassed.length ? 1 : 0);
}

const passedRegular = rows.filter((r) => !r.bug && r.status === 'passed');
const regressions = rows.filter((r) => !r.bug && r.status !== 'passed');
const defectsFound = rows.filter((r) => r.bug && failedLike(r.status));
const defectsMissed = rows.filter((r) => r.bug && !failedLike(r.status));

const lines = [];
lines.push('## Playwright multi-account demo – result check', '');
lines.push(`- ✅ Passing checks: **${passedRegular.length}**`);
lines.push(`- 🐞 Intentional defects detected (failing @bug tests): **${defectsFound.length}**`);
lines.push(`- ❌ Unexpected failures (regressions): **${regressions.length}**`);
lines.push(`- ⚠️ @bug tests that did NOT fail: **${defectsMissed.length}**`, '');
if (defectsFound.length) {
  lines.push('| Defect | Test |', '|---|---|');
  for (const r of defectsFound) lines.push(`| ${r.defect ?? '?'} | ${r.title} |`);
  lines.push('');
}
for (const r of regressions) lines.push(`- REGRESSION (${r.status}): ${r.title} [${r.file}]`);
for (const r of defectsMissed) lines.push(`- DEFECT NOT REPRODUCED (${r.status}): ${r.title} [${r.file}]`);

const out = lines.join('\n');
console.log('\n' + out);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + '\n');

process.exit(regressions.length || defectsMissed.length ? 1 : 0);
