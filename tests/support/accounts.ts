import path from 'node:path';

/** Seeded test accounts. All share the same demo password. */
export const PASSWORD = 'Passw0rd!';

export const ACME = 'org_acme';
export const GLOBEX = 'org_globex';

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';
/** `outsider` is the owner of a *different* organisation (Globex). */
export type SeedRole = OrgRole | 'outsider';

export interface Account {
  id: string;
  name: string;
  email: string;
  orgId: string;
}

export const accounts: Record<SeedRole, Account> = {
  owner: { id: 'usr_1001', name: 'Olivia Owner', email: 'owner@acme.test', orgId: ACME },
  admin: { id: 'usr_1002', name: 'Adam Admin', email: 'admin@acme.test', orgId: ACME },
  member: { id: 'usr_1003', name: 'Mia Member', email: 'member@acme.test', orgId: ACME },
  viewer: { id: 'usr_1004', name: 'Victor Viewer', email: 'viewer@acme.test', orgId: ACME },
  outsider: { id: 'usr_2001', name: 'Oscar Outsider', email: 'owner@globex.test', orgId: GLOBEX },
};

export const SEED_ROLES = Object.keys(accounts) as SeedRole[];

export const authFile = (role: SeedRole) => path.join(__dirname, '..', '..', '.auth', `${role}.json`);

export const uniqueEmail = (prefix = 'invitee') =>
  `${prefix}+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}@acme.test`;
