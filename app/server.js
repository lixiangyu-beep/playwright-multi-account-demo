'use strict';
/**
 * TeamHub – a deliberately small multi-tenant demo app used as a test target.
 * Run: npm start   (PORT defaults to 3210)
 */
const express = require('express');
const { createStore } = require('./store');
const { createServices } = require('./services');
const views = require('./views');

function createApp() {
  const store = createStore();
  const svc = createServices(store);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // ---- authentication: Bearer token (API clients) or `sid` cookie (browser) --------------
  app.use((req, _res, next) => {
    const bearer = (req.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
    const cookie = (req.get('cookie') || '').match(/(?:^|;\s*)sid=([^;]+)/);
    const token = bearer ? bearer[1] : cookie ? decodeURIComponent(cookie[1]) : null;
    const session = token && store.sessions.get(token);
    if (session) {
      req.session = session;
      req.sessionToken = token;
      req.user = store.users.get(session.userId);
    }
    next();
  });
  const setSessionCookie = (res, token) =>
    res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', path: '/' });

  const apiAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Authentication required' }));
  const pageAuth = (req, res, next) => (req.user ? next() : res.redirect('/login'));
  const send = (res, { status, body }) => res.status(status).json(body);

  // ---- JSON API ---------------------------------------------------------------------------
  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = store.findUserByEmail(email || '');
    if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid email or password' });
    const token = store.createSession(user.id);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  });
  app.post('/api/logout', apiAuth, (req, res) => {
    store.sessions.delete(req.sessionToken);
    res.status(204).end();
  });
  app.get('/api/me', apiAuth, (req, res) => send(res, svc.me(req.user)));
  app.get('/api/users/:userId', apiAuth, (req, res) => send(res, svc.getUserProfile(req.user, req.params.userId)));
  app.get('/api/orgs/:orgId/members', apiAuth, (req, res) => send(res, svc.listMembers(req.user, req.params.orgId)));
  app.get('/api/orgs/:orgId/data', apiAuth, (req, res) =>
    send(res, svc.getOrgData(req.user, req.session, req.params.orgId))
  );
  app.patch('/api/orgs/:orgId', apiAuth, (req, res) => send(res, svc.updateOrg(req.user, req.params.orgId, req.body)));
  app.post('/api/orgs/:orgId/invites', apiAuth, (req, res) => send(res, svc.invite(req.user, req.params.orgId, req.body)));
  app.post('/api/invites/:token/accept', (req, res) =>
    send(res, svc.acceptInvite(req.params.token, req.user || null, req.body))
  );
  app.patch('/api/orgs/:orgId/members/:userId', apiAuth, (req, res) =>
    send(res, svc.changeRole(req.user, req.params.orgId, req.params.userId, req.body && req.body.role))
  );
  app.delete('/api/orgs/:orgId/members/:userId', apiAuth, (req, res) =>
    send(res, svc.removeMember(req.user, req.params.orgId, req.params.userId))
  );
  app.post('/api/orgs/:orgId/members/:userId/sponsorship', apiAuth, (req, res) =>
    send(res, svc.setSponsorship(req.user, req.params.orgId, req.params.userId, req.body && req.body.active))
  );
  app.get('/api/orgs/:orgId/perks', apiAuth, (req, res) => send(res, svc.getPerks(req.user, req.params.orgId)));
  app.get('/api/orgs/:orgId/audit-log', apiAuth, (req, res) => send(res, svc.getAuditLog(req.user, req.params.orgId)));

  // ---- HTML pages -------------------------------------------------------------------------
  app.get('/', (req, res) => res.redirect(req.user ? '/dashboard' : '/login'));
  app.get('/login', (_req, res) => res.send(views.loginPage()));
  app.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = store.findUserByEmail(email || '');
    if (!user || user.password !== password)
      return res.status(401).send(views.loginPage({ error: 'Invalid email or password', email }));
    setSessionCookie(res, store.createSession(user.id));
    res.redirect('/dashboard');
  });
  app.post('/logout', (req, res) => {
    if (req.sessionToken) store.sessions.delete(req.sessionToken);
    res.clearCookie('sid', { path: '/' });
    res.redirect('/login');
  });

  app.get('/dashboard', pageAuth, (req, res) => {
    const me = svc.me(req.user).body;
    let members = [];
    let invites = [];
    let canManage = false;
    if (me.membership) {
      members = svc.listMembers(req.user, me.membership.orgId).body.members;
      canManage = ['owner', 'admin'].includes(me.membership.role);
      if (canManage) invites = store.invitesOf(me.membership.orgId);
    }
    res.send(views.dashboardPage({ user: req.user, me, members, invites, canManage }));
  });

  const formAction = (fn) => (req, res) => {
    const result = fn(req);
    if (result.status >= 400) return res.status(result.status).send(views.errorPage(result.status, result.body.error, req.user));
    res.redirect('/dashboard');
  };
  app.post('/orgs/:orgId/invites', pageAuth, formAction((req) => svc.invite(req.user, req.params.orgId, req.body)));
  app.post(
    '/orgs/:orgId/members/:userId/role',
    pageAuth,
    formAction((req) => svc.changeRole(req.user, req.params.orgId, req.params.userId, req.body.role))
  );
  app.post(
    '/orgs/:orgId/members/:userId/remove',
    pageAuth,
    formAction((req) => svc.removeMember(req.user, req.params.orgId, req.params.userId))
  );
  app.post(
    '/orgs/:orgId/members/:userId/sponsorship',
    pageAuth,
    formAction((req) => svc.setSponsorship(req.user, req.params.orgId, req.params.userId, req.body.active === 'true'))
  );

  app.get('/orgs/:orgId/data', pageAuth, (req, res) => {
    const r = svc.getOrgData(req.user, req.session, req.params.orgId);
    if (r.status >= 400) return res.status(r.status).send(views.errorPage(r.status, r.body.error, req.user));
    res.send(views.orgDataPage(r.body, req.user));
  });
  app.get('/orgs/:orgId/audit-log', pageAuth, (req, res) => {
    const r = svc.getAuditLog(req.user, req.params.orgId);
    if (r.status >= 400) return res.status(r.status).send(views.errorPage(r.status, r.body.error, req.user));
    res.send(views.auditLogPage(r.body, req.user));
  });

  app.get('/invite/:token', (req, res) => {
    const r = svc.getInvite(req.params.token);
    if (r.status >= 400) return res.status(r.status).send(views.errorPage(r.status, r.body.error, req.user));
    res.send(views.invitePage({ invite: r.body, user: req.user }));
  });
  app.post('/invite/:token/accept', (req, res) => {
    const r = svc.acceptInvite(req.params.token, req.user || null, req.body);
    if (r.status >= 400) {
      const inv = svc.getInvite(req.params.token);
      if (inv.status >= 400) return res.status(r.status).send(views.errorPage(r.status, r.body.error, req.user));
      return res.status(r.status).send(views.invitePage({ invite: inv.body, user: req.user, error: r.body.error }));
    }
    setSessionCookie(res, r.body.token);
    res.redirect('/dashboard');
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3210;
  createApp().listen(port, () => console.log(`TeamHub demo app listening on http://localhost:${port}`));
}

module.exports = { createApp };
