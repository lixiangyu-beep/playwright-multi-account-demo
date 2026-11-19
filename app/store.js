'use strict';
const crypto = require('crypto');

/**
 * In-memory data store for the demo app.
 * Everything resets when the server restarts.
 */

const ROLES = ['owner', 'admin', 'member', 'viewer'];
const ROLE_RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };
const DEFAULT_PASSWORD = 'Passw0rd!';

function createStore() {
  const users = new Map(); // id -> user
  const orgs = new Map(); // id -> org
  const memberships = []; // { orgId, userId, role, sponsored, joinedAt }
  const invites = new Map(); // token -> invite
  const sessions = new Map(); // token -> { userId, orgId, createdAt }
  const auditLog = []; // { at, orgId, actorId, action, detail }
  let nextUserId = 3001;

  const addUser = (u) => {
    users.set(u.id, { password: DEFAULT_PASSWORD, ...u });
    return users.get(u.id);
  };
  const addOrg = (o) => {
    orgs.set(o.id, o);
    return o;
  };
  const addMembership = (orgId, userId, role) => {
    const m = { orgId, userId, role, sponsored: false, joinedAt: new Date().toISOString() };
    memberships.push(m);
    return m;
  };

  // ---- seed data -----------------------------------------------------------
  addOrg({
    id: 'org_acme',
    name: 'Acme Corp',
    plan: 'enterprise',
    confidential: {
      annualRevenueUsd: 12_400_000,
      roadmap: ['Project Falcon (Q1)', 'EU data residency (Q2)'],
      apiKeyLast4: '9f3a',
    },
  });
  addOrg({
    id: 'org_globex',
    name: 'Globex Inc',
    plan: 'starter',
    confidential: { annualRevenueUsd: 830_000, roadmap: ['Self-serve billing'], apiKeyLast4: '77c1' },
  });

  const seed = [
    ['usr_1001', 'Olivia Owner', 'owner@acme.test', '+1-415-555-0101', 'org_acme', 'owner'],
    ['usr_1002', 'Adam Admin', 'admin@acme.test', '+1-415-555-0102', 'org_acme', 'admin'],
    ['usr_1003', 'Mia Member', 'member@acme.test', '+1-415-555-0103', 'org_acme', 'member'],
    ['usr_1004', 'Victor Viewer', 'viewer@acme.test', '+1-415-555-0104', 'org_acme', 'viewer'],
    ['usr_2001', 'Oscar Outsider', 'owner@globex.test', '+44-20-5550-2001', 'org_globex', 'owner'],
  ];
  for (const [id, name, email, phone, orgId, role] of seed) {
    addUser({ id, name, email, phone, homeAddress: `${id.slice(-2)} Test Street, Springfield` });
    addMembership(orgId, id, role);
  }

  // ---- helpers ---------------------------------------------------------------
  const api = {
    ROLES,
    ROLE_RANK,
    users,
    orgs,
    invites,
    sessions,

    findUserByEmail: (email) =>
      [...users.values()].find((u) => u.email.toLowerCase() === String(email).toLowerCase()),

    createUser({ name, email, password }) {
      const id = `usr_${nextUserId++}`; // sequential, guessable ids (realistic for IDOR testing)
      return addUser({ id, name, email, password, phone: null, homeAddress: null });
    },

    membershipOf: (userId) => memberships.find((m) => m.userId === userId) || null,
    membership: (orgId, userId) => memberships.find((m) => m.orgId === orgId && m.userId === userId) || null,
    membersOf: (orgId) => memberships.filter((m) => m.orgId === orgId),
    addMembership,
    removeMembership(orgId, userId) {
      const i = memberships.findIndex((m) => m.orgId === orgId && m.userId === userId);
      if (i >= 0) memberships.splice(i, 1);
    },

    createSession(userId) {
      const token = crypto.randomBytes(24).toString('hex');
      const m = api.membershipOf(userId);
      // The org is resolved once and cached on the session (see BUG-002 in README).
      sessions.set(token, { userId, orgId: m ? m.orgId : null, createdAt: Date.now() });
      return token;
    },

    createInvite({ orgId, email, role, invitedBy }) {
      const token = crypto.randomBytes(16).toString('hex');
      const invite = { token, orgId, email, role, invitedBy, status: 'pending', createdAt: new Date().toISOString() };
      invites.set(token, invite);
      return invite;
    },
    invitesOf: (orgId) => [...invites.values()].filter((i) => i.orgId === orgId),

    audit(orgId, actorId, action, detail) {
      auditLog.push({ at: new Date().toISOString(), orgId, actorId, action, detail });
    },
    auditOf: (orgId) => auditLog.filter((e) => e.orgId === orgId),
  };
  return api;
}

module.exports = { createStore, ROLES, ROLE_RANK, DEFAULT_PASSWORD };
