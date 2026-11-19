'use strict';
/**
 * Business rules shared by the JSON API and the HTML pages.
 * Every function returns { status, body } so both layers stay thin.
 *
 * ⚠️ This app contains THREE INTENTIONAL BUGS for test-automation demo purposes.
 *    They are marked with "INTENTIONAL BUG" comments and documented in README.md.
 */
const { ROLE_RANK } = require('./store');

/**
 * Set FIX_PLANTED_BUGS=1 to run the app with the three bugs fixed. Used to prove the
 * @bug tests are correct: they fail against the buggy app and pass against the fixed one.
 */
const FIXED = process.env.FIX_PLANTED_BUGS === '1';

const ok = (body, status = 200) => ({ status, body });
const fail = (status, error) => ({ status, body: { error } });

const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email };
const profileUser = (u) =>
  u && { id: u.id, name: u.name, email: u.email, phone: u.phone, homeAddress: u.homeAddress };

function createServices(store) {
  /** Live membership check: is the actor a member of orgId right now? */
  function memberOrFail(actor, orgId) {
    const m = store.membership(orgId, actor.id);
    return m ? { m } : { err: fail(403, 'You are not a member of this organisation') };
  }
  function atLeast(m, role) {
    return ROLE_RANK[m.role] >= ROLE_RANK[role];
  }
  function memberView(m) {
    const u = store.users.get(m.userId);
    return { ...publicUser(u), role: m.role, sponsored: m.sponsored, joinedAt: m.joinedAt };
  }

  return {
    me(actor) {
      const m = store.membershipOf(actor.id);
      const org = m && store.orgs.get(m.orgId);
      return ok({
        user: publicUser(actor),
        membership: m ? { orgId: m.orgId, orgName: org.name, role: m.role, sponsored: m.sponsored } : null,
      });
    },

    getUserProfile(actor, userId) {
      const target = store.users.get(userId);
      if (!target) return fail(404, 'User not found');
      // INTENTIONAL BUG (BUG-001, IDOR): any authenticated user can read any profile,
      // including phone + home address of users in OTHER organisations.
      // Correct rule: allow self, or users who share an org with the actor; otherwise 404.
      if (FIXED) {
        const mine = store.membershipOf(actor.id);
        const theirs = store.membershipOf(userId);
        const sameOrg = mine && theirs && mine.orgId === theirs.orgId;
        if (actor.id !== userId && !sameOrg) return fail(404, 'User not found');
      }
      return ok(profileUser(target));
    },

    listMembers(actor, orgId) {
      const { m, err } = memberOrFail(actor, orgId);
      if (err) return err;
      void m;
      return ok({ orgId, members: store.membersOf(orgId).map(memberView) });
    },

    getOrgData(actor, session, orgId) {
      const org = store.orgs.get(orgId);
      if (!org) return fail(404, 'Organisation not found');
      // INTENTIONAL BUG (BUG-002, stale authorisation): the org is read from the session,
      // which is cached at login/accept time, instead of checking live membership.
      // A member removed from the org keeps reading confidential data until they log out.
      if (FIXED) {
        const { err } = memberOrFail(actor, orgId);
        if (err) return err;
      } else if (session.orgId !== orgId) {
        return fail(403, 'You are not a member of this organisation');
      }
      return ok({ orgId, name: org.name, plan: org.plan, confidential: org.confidential });
    },

    invite(actor, orgId, { email, role }) {
      const { m, err } = memberOrFail(actor, orgId);
      if (err) return err;
      if (!atLeast(m, 'admin')) return fail(403, 'Only owners and admins can invite members');
      if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return fail(400, 'A valid email is required');
      if (!['admin', 'member', 'viewer'].includes(role)) return fail(400, 'Role must be admin, member or viewer');
      const existing = store.findUserByEmail(email);
      if (existing && store.membership(orgId, existing.id)) return fail(409, 'User is already a member');
      const inv = store.createInvite({ orgId, email, role, invitedBy: actor.id });
      store.audit(orgId, actor.id, 'member.invited', `${email} as ${role}`);
      return ok({ token: inv.token, email, role, status: inv.status, link: `/invite/${inv.token}` }, 201);
    },

    getInvite(token) {
      const inv = store.invites.get(token);
      if (!inv) return fail(404, 'Invite not found');
      return ok({ ...inv, orgName: store.orgs.get(inv.orgId).name });
    },

    acceptInvite(token, actor, { name, password } = {}) {
      const inv = store.invites.get(token);
      if (!inv) return fail(404, 'Invite not found');
      if (inv.status !== 'pending') return fail(410, 'This invite has already been used');
      let user = actor;
      if (user) {
        if (user.email.toLowerCase() !== inv.email.toLowerCase())
          return fail(403, 'This invite was sent to a different email address');
      } else {
        if (store.findUserByEmail(inv.email)) return fail(409, 'An account with this email exists, please log in first');
        if (!name || !password || password.length < 8)
          return fail(400, 'Name and a password of at least 8 characters are required');
        user = store.createUser({ name, email: inv.email, password });
      }
      if (store.membershipOf(user.id)) return fail(409, 'You already belong to an organisation');
      store.addMembership(inv.orgId, user.id, inv.role);
      inv.status = 'accepted';
      inv.acceptedBy = user.id;
      store.audit(inv.orgId, user.id, 'member.joined', `${user.email} as ${inv.role}`);
      const sessionToken = store.createSession(user.id);
      return ok({ token: sessionToken, user: publicUser(user), orgId: inv.orgId, role: inv.role });
    },

    changeRole(actor, orgId, userId, role) {
      const { m, err } = memberOrFail(actor, orgId);
      if (err) return err;
      if (!atLeast(m, 'admin')) return fail(403, 'Only owners and admins can change roles');
      if (!['admin', 'member', 'viewer'].includes(role)) return fail(400, 'Role must be admin, member or viewer');
      const target = store.membership(orgId, userId);
      if (!target) return fail(404, 'Member not found');
      if (target.role === 'owner') return fail(403, "The owner's role cannot be changed");
      const from = target.role;
      target.role = role;
      store.audit(orgId, actor.id, 'member.role_changed', `${userId}: ${from} -> ${role}`);
      return ok(memberView(target));
    },

    removeMember(actor, orgId, userId) {
      const { m, err } = memberOrFail(actor, orgId);
      if (err) return err;
      if (!atLeast(m, 'admin')) return fail(403, 'Only owners and admins can remove members');
      const target = store.membership(orgId, userId);
      if (!target) return fail(404, 'Member not found');
      if (target.role === 'owner') return fail(403, 'The owner cannot be removed');
      if (userId === actor.id) return fail(400, 'You cannot remove yourself');
      store.removeMembership(orgId, userId);
      store.audit(orgId, actor.id, 'member.removed', userId);
      return ok({ removed: userId });
    },

    setSponsorship(actor, orgId, userId, active) {
      const { m, err } = memberOrFail(actor, orgId);
      if (err) return err;
      if (!atLeast(m, 'admin')) return fail(403, 'Only owners and admins can sponsor members');
      const target = store.membership(orgId, userId);
      if (!target) return fail(404, 'Member not found');
      target.sponsored = Boolean(active);
      store.audit(orgId, actor.id, target.sponsored ? 'member.sponsored' : 'member.unsponsored', userId);
      return ok(memberView(target));
    },

    getPerks(actor, orgId) {
      const { m, err } = memberOrFail(actor, orgId);
      if (err) return err;
      if (!m.sponsored && !atLeast(m, 'admin')) return fail(403, 'Perks are only available to sponsored members');
      return ok({ orgId, perks: ['Premium support', 'Conference budget', 'AI credits'] });
    },

    getAuditLog(actor, orgId) {
      const { m, err } = memberOrFail(actor, orgId);
      if (err) return err;
      // INTENTIONAL BUG (BUG-003, broken access control): "admin-only" is implemented as a
      // deny-list that only blocks the `member` role, so `viewer` slips through.
      // Correct rule: allow-list owner + admin.
      const denied = FIXED ? !atLeast(m, 'admin') : m.role === 'member';
      if (denied) return fail(403, 'Only owners and admins can view the audit log');
      return ok({ orgId, entries: store.auditOf(orgId) });
    },

    updateOrg(actor, orgId, { name }) {
      const { m, err } = memberOrFail(actor, orgId);
      if (err) return err;
      if (m.role !== 'owner') return fail(403, 'Only the owner can change organisation settings');
      if (!name || String(name).trim().length < 2) return fail(400, 'Name must be at least 2 characters');
      store.orgs.get(orgId).name = String(name).trim();
      store.audit(orgId, actor.id, 'org.renamed', name);
      return ok({ orgId, name: store.orgs.get(orgId).name });
    },
  };
}

module.exports = { createServices };
