'use strict';
/** Tiny server-side HTML templates (no frontend framework needed). */

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const layout = (title, body, user) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · TeamHub</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#1f2937}
  header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb;margin-bottom:1rem}
  table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e5e7eb;padding:.4rem;text-align:left}
  .badge{padding:.1rem .45rem;border-radius:.5rem;background:#eef2ff;font-size:.85rem}
  .sponsored{background:#fef3c7}.error{color:#b91c1c}.card{border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem;margin:1rem 0}
  form.inline{display:inline}
</style></head><body>
<header><strong>TeamHub <small>(demo app with intentional bugs)</small></strong>
${user ? `<span>Signed in as <span data-testid="signed-in-as">${esc(user.email)}</span>
<form class="inline" method="post" action="/logout"><button>Log out</button></form></span>` : ''}
</header>
<main>${body}</main></body></html>`;

const loginPage = ({ error, email } = {}) =>
  layout(
    'Log in',
    `<h1>Log in</h1>
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/login">
  <label>Email <input name="email" type="email" value="${esc(email)}" required></label><br>
  <label>Password <input name="password" type="password" required></label><br>
  <button type="submit">Log in</button>
</form>`
  );

function dashboardPage({ user, me, members, invites, canManage }) {
  if (!me.membership) {
    return layout(
      'Dashboard',
      `<h1>Dashboard</h1><p data-testid="no-org">You are not a member of any organisation.</p>`,
      user
    );
  }
  const { orgId, orgName, role, sponsored } = me.membership;
  const rows = members
    .map(
      (m) => `<tr data-testid="member-row" data-user-id="${esc(m.id)}" data-email="${esc(m.email)}">
  <td>${esc(m.name)}</td><td>${esc(m.email)}</td>
  <td data-testid="member-role">${esc(m.role)}</td>
  <td>${m.sponsored ? '<span class="badge sponsored" data-testid="member-sponsored">Sponsored</span>' : ''}</td>
  <td>${
    canManage && m.role !== 'owner' && m.id !== user.id
      ? `<form class="inline" method="post" action="/orgs/${esc(orgId)}/members/${esc(m.id)}/role">
       <select name="role" aria-label="Role for ${esc(m.email)}">${['admin', 'member', 'viewer']
         .map((r) => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`)
         .join('')}</select>
       <button type="submit">Save role</button></form>
     <form class="inline" method="post" action="/orgs/${esc(orgId)}/members/${esc(m.id)}/sponsorship">
       <input type="hidden" name="active" value="${m.sponsored ? 'false' : 'true'}">
       <button type="submit">${m.sponsored ? 'Stop sponsoring' : 'Sponsor'}</button></form>
     <form class="inline" method="post" action="/orgs/${esc(orgId)}/members/${esc(m.id)}/remove">
       <button type="submit">Remove</button></form>`
      : ''
  }</td></tr>`
    )
    .join('\n');

  const inviteSection = canManage
    ? `<section class="card" data-testid="invite-section"><h2>Invite a teammate</h2>
<form method="post" action="/orgs/${esc(orgId)}/invites">
  <label>Email <input name="email" type="email" required></label>
  <label>Role <select name="role"><option>member</option><option>admin</option><option>viewer</option></select></label>
  <button type="submit">Send invite</button>
</form>
<h3>Invites</h3>
<ul>${invites
        .map(
          (i) => `<li data-testid="invite-item" data-email="${esc(i.email)}">${esc(i.email)} (${esc(i.role)}) –
  <span data-testid="invite-status">${esc(i.status)}</span>
  ${i.status === 'pending' ? `<a data-testid="invite-link" href="/invite/${esc(i.token)}">invite link</a>` : ''}</li>`
        )
        .join('')}</ul>
<p><a href="/orgs/${esc(orgId)}/audit-log">Audit log</a></p></section>`
    : '';

  return layout(
    'Dashboard',
    `<h1>Dashboard</h1>
<p>Organisation: <strong data-testid="org-name">${esc(orgName)}</strong> ·
Your role: <span class="badge" data-testid="current-role">${esc(role)}</span>
${sponsored ? '<span class="badge sponsored" data-testid="sponsored-badge">Sponsored</span>' : ''}</p>
<p><a href="/orgs/${esc(orgId)}/data">Confidential org data</a></p>
<h2>Members</h2>
<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th><th></th></tr></thead>
<tbody>${rows}</tbody></table>
${inviteSection}`,
    user
  );
}

const invitePage = ({ invite, user, error }) =>
  layout(
    'Join organisation',
    `<h1>Join ${esc(invite.orgName)}</h1>
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
${
  invite.status !== 'pending'
    ? `<p data-testid="invite-used">This invite has already been used.</p>`
    : `<p>You were invited as <strong data-testid="invite-role">${esc(invite.role)}</strong> (${esc(invite.email)}).</p>
<form method="post" action="/invite/${esc(invite.token)}/accept">
${
  user
    ? ''
    : `<label>Your name <input name="name" required></label><br>
<label>Choose a password <input name="password" type="password" minlength="8" required></label><br>`
}
<button type="submit">${user ? 'Accept invite' : 'Create account & join'}</button></form>`
}`,
    user
  );

const errorPage = (status, message, user) =>
  layout(
    `Error ${status}`,
    `<h1 data-testid="error-status">${status}</h1><p class="error" role="alert" data-testid="error-message">${esc(message)}</p>
<p><a href="/dashboard">Back to dashboard</a></p>`,
    user
  );

const orgDataPage = (data, user) =>
  layout(
    'Confidential data',
    `<h1>Confidential data – ${esc(data.name)}</h1>
<dl data-testid="org-data"><dt>Plan</dt><dd>${esc(data.plan)}</dd>
<dt>Annual revenue</dt><dd data-testid="org-revenue">$${esc(data.confidential.annualRevenueUsd.toLocaleString('en-US'))}</dd>
<dt>Roadmap</dt><dd>${data.confidential.roadmap.map(esc).join(', ')}</dd>
<dt>API key</dt><dd>••••${esc(data.confidential.apiKeyLast4)}</dd></dl>`,
    user
  );

const auditLogPage = (data, user) =>
  layout(
    'Audit log',
    `<h1>Audit log</h1><table data-testid="audit-log"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
<tbody>${data.entries
      .map((e) => `<tr><td>${esc(e.at)}</td><td>${esc(e.actorId)}</td><td>${esc(e.action)}</td><td>${esc(e.detail)}</td></tr>`)
      .join('')}</tbody></table>`,
    user
  );

module.exports = { loginPage, dashboardPage, invitePage, errorPage, orgDataPage, auditLogPage };
