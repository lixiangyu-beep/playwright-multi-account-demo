import type { APIResponse } from '@playwright/test';
import { ACME, SeedRole, uniqueEmail } from '../support/accounts';
import type { ApiClient } from '../support/api-client';
import type { DefectId } from '../support/defects';

export interface MatrixContext {
  /** Id of a disposable Acme member, created fresh for actions that mutate someone. */
  targetId: () => Promise<string>;
}

export interface PermissionRule {
  action: string;
  /** Seeded roles that SHOULD be allowed. Everyone else must get 403. */
  allowed: SeedRole[];
  expectedStatus?: number;
  run: (api: ApiClient, ctx: MatrixContext) => Promise<APIResponse>;
  /** Cells where the app is known to violate the rule (planted bugs). */
  knownDefects?: Partial<Record<SeedRole, DefectId>>;
}

const ALL_MEMBERS: SeedRole[] = ['owner', 'admin', 'member', 'viewer'];
const MANAGERS: SeedRole[] = ['owner', 'admin'];

/** The single source of truth for "who may do what" – the README table mirrors this. */
export const permissionMatrix: PermissionRule[] = [
  { action: 'read org data', allowed: ALL_MEMBERS, run: (api) => api.orgData(ACME) },
  { action: 'list members', allowed: ALL_MEMBERS, run: (api) => api.members(ACME) },
  {
    action: 'invite a member',
    allowed: MANAGERS,
    expectedStatus: 201,
    run: (api) => api.invite(ACME, uniqueEmail('matrix'), 'viewer'),
  },
  {
    action: 'change a member’s role',
    allowed: MANAGERS,
    run: async (api, ctx) => api.changeRole(ACME, await ctx.targetId(), 'viewer'),
  },
  {
    action: 'sponsor a member',
    allowed: MANAGERS,
    run: async (api, ctx) => api.setSponsorship(ACME, await ctx.targetId(), true),
  },
  {
    action: 'remove a member',
    allowed: MANAGERS,
    run: async (api, ctx) => api.removeMember(ACME, await ctx.targetId()),
  },
  {
    action: 'view the audit log',
    allowed: MANAGERS,
    run: (api) => api.auditLog(ACME),
    knownDefects: { viewer: 'BUG-003' },
  },
  { action: 'rename the organisation', allowed: ['owner'], run: (api) => api.updateOrg(ACME, 'Acme Corp') },
];
