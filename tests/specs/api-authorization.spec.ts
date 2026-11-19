import { test, expect } from '../fixtures';
import { ACME, accounts, GLOBEX, uniqueEmail } from '../support/accounts';
import { ApiClient, describeResponse } from '../support/api-client';
import { knownDefect } from '../support/defects';

/**
 * Privacy / IDOR pass: account A's token (Oscar, owner of Globex) is replayed against
 * account B's identifiers (Acme org + Acme users). Every call must be refused and must not
 * leak data; state must be unchanged afterwards.
 */
test.describe('API authorisation: cross-organisation IDOR checks', () => {
  const victim = accounts.member; // an Acme user

  test('outsider cannot list another org’s members', async ({ apiAs }) => {
    const outsider = await apiAs('outsider');
    const res = await outsider.members(ACME);
    expect(res.status(), await describeResponse(res)).toBe(403);
    expect(await res.text()).not.toContain(victim.email);
  });

  test('outsider cannot read another org’s confidential data', async ({ apiAs }) => {
    const outsider = await apiAs('outsider');
    const res = await outsider.orgData(ACME);
    expect(res.status(), await describeResponse(res)).toBe(403);
    expect(await res.text()).not.toContain('annualRevenueUsd');
  });

  test('outsider cannot change the role of another org’s member', async ({ apiAs, tempMember }) => {
    const target = await tempMember('member');
    const outsider = await apiAs('outsider');
    const res = await outsider.changeRole(ACME, target.id, 'admin');
    expect(res.status(), await describeResponse(res)).toBe(403);
    const me = await (await target.api.me()).json();
    expect(me.membership.role, 'role must be unchanged').toBe('member');
  });

  test('outsider cannot remove another org’s member', async ({ apiAs, tempMember }) => {
    const target = await tempMember('member');
    const outsider = await apiAs('outsider');
    const res = await outsider.removeMember(ACME, target.id);
    expect(res.status(), await describeResponse(res)).toBe(403);
    expect((await target.api.members(ACME)).status(), 'target must still be a member').toBe(200);
  });

  test('outsider cannot invite people into another org', async ({ apiAs }) => {
    const outsider = await apiAs('outsider');
    const res = await outsider.invite(ACME, uniqueEmail('attacker'), 'admin');
    expect(res.status(), await describeResponse(res)).toBe(403);
  });

  test('Acme owner cannot read Globex data either (check runs both ways)', async ({ apiAs }) => {
    const owner = await apiAs('owner');
    expect((await owner.orgData(GLOBEX)).status()).toBe(403);
    expect((await owner.members(GLOBEX)).status()).toBe(403);
  });

  test('a user can read their own profile', async ({ apiAs }) => {
    const member = await apiAs('member');
    const res = await member.getUser(victim.id);
    expect(res.status()).toBe(200);
    expect((await res.json()).email).toBe(victim.email);
  });

  test(
    'outsider cannot read the profile (PII) of another org’s user',
    knownDefect('BUG-001'),
    async ({ apiAs }, testInfo) => {
      const outsider = await apiAs('outsider');
      const res = await outsider.getUser(victim.id);
      const evidence = await describeResponse(res);
      await testInfo.attach('evidence: outsider GET /api/users/' + victim.id, { body: evidence, contentType: 'text/plain' });

      expect
        .soft(res.status(), `BUG-001: Globex owner must get 404 for Acme user ${victim.id}, got:\n${evidence}`)
        .toBe(404);
      expect(await res.text(), 'BUG-001: response must not contain the victim’s phone number').not.toContain(
        '+1-415-555-0103'
      );
    }
  );

  test.describe('unauthenticated requests are rejected', () => {
    const calls: Array<[string, (api: ApiClient) => Promise<import('@playwright/test').APIResponse>]> = [
      ['GET /api/me', (a) => a.me()],
      ['GET /api/users/:id', (a) => a.getUser(victim.id)],
      ['GET /api/orgs/:id/members', (a) => a.members(ACME)],
      ['GET /api/orgs/:id/data', (a) => a.orgData(ACME)],
      ['GET /api/orgs/:id/audit-log', (a) => a.auditLog(ACME)],
      ['POST /api/orgs/:id/invites', (a) => a.invite(ACME, uniqueEmail())],
    ];
    for (const [name, call] of calls) {
      test(`${name} → 401`, async ({ baseURL }) => {
        const anon = await ApiClient.anonymous(baseURL!);
        const res = await call(anon);
        expect(res.status(), await describeResponse(res)).toBe(401);
        await anon.dispose();
      });
    }
  });
});
