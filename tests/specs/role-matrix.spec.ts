import { test, expect } from '../fixtures';
import { ACME, SEED_ROLES } from '../support/accounts';
import { describeResponse } from '../support/api-client';
import { knownDefect } from '../support/defects';
import { permissionMatrix } from '../data/permission-matrix';
import { ErrorPage } from '../pages/ErrorPage';

/**
 * Data-driven role × action matrix (8 actions × 5 accounts = 40 checks) against the Acme org.
 * `outsider` is the owner of a different org and must be denied everything.
 */
test.describe('Role permission matrix (API)', () => {
  for (const rule of permissionMatrix) {
    test.describe(rule.action, () => {
      for (const role of SEED_ROLES) {
        const allowed = rule.allowed.includes(role);
        const expected = allowed ? (rule.expectedStatus ?? 200) : 403;
        const defect = rule.knownDefects?.[role];
        const title = `${role} ${allowed ? 'CAN' : 'CANNOT'} ${rule.action} → ${expected}`;

        test(title, defect ? knownDefect(defect) : {}, async ({ apiAs, tempMember }) => {
          const api = await apiAs(role);
          const res = await rule.run(api, { targetId: async () => (await tempMember('member')).id });
          const prefix = defect ? `${defect}: ` : '';
          expect(res.status(), `${prefix}${role} → ${rule.action}\n${await describeResponse(res)}`).toBe(expected);
        });
      }
    });
  }
});

test.describe('Role permission matrix (UI)', () => {
  for (const role of ['member', 'viewer'] as const) {
    test(`${role} does not see admin controls`, async ({ as }) => {
      const { page, dashboard } = await as(role);
      await dashboard.goto();
      await expect(dashboard.inviteSection).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Save role' })).toHaveCount(0);
    });
  }

  test('member opening the audit log URL directly gets 403', async ({ as }) => {
    const { page } = await as('member');
    await page.goto(`/orgs/${ACME}/audit-log`);
    await new ErrorPage(page).expectAccessDenied();
  });

  test('viewer opening the audit log URL directly gets 403', knownDefect('BUG-003'), async ({ as }) => {
    const { page } = await as('viewer');
    await page.goto(`/orgs/${ACME}/audit-log`);
    await new ErrorPage(page).expectAccessDenied('BUG-003: viewer must not see the admin-only audit log page');
  });
});
