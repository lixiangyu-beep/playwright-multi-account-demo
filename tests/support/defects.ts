import type { TestDetails } from '@playwright/test';

/**
 * Known defects that the demo app ships with ON PURPOSE.
 * Tests that expose them are tagged `@bug` and carry a `defect` annotation, so the HTML
 * report groups them and scripts/verify-results.mjs can tell "defect found" apart from
 * "regression".
 */
export const DEFECTS = {
  'BUG-001': { severity: 'High', title: 'IDOR: GET /api/users/:id leaks PII of users in other organisations' },
  'BUG-002': { severity: 'High', title: 'Removed member keeps access to confidential org data via existing session' },
  'BUG-003': { severity: 'Medium', title: 'Viewer can read the admin-only audit log' },
} as const;

export type DefectId = keyof typeof DEFECTS;

/** Test details for a test that is expected to expose a known defect. */
export function knownDefect(id: DefectId): TestDetails {
  const d = DEFECTS[id];
  return {
    tag: ['@bug'],
    annotation: [
      { type: 'defect', description: `${id} [${d.severity}] ${d.title}` },
      { type: 'issue', description: `See README.md#${id.toLowerCase()}` },
    ],
  };
}
