import { APIRequestContext, APIResponse, request } from '@playwright/test';
import { PASSWORD } from './accounts';

/**
 * Thin, typed wrapper around an APIRequestContext authenticated with ONE account's
 * Bearer token. Having one client per account makes cross-account tests read naturally:
 *
 *   await outsiderApi.getUser(acmeMember.id)   // account A's token, account B's id
 */
export class ApiClient {
  private constructor(
    readonly ctx: APIRequestContext,
    readonly token: string | null,
    readonly userId: string | null,
    readonly email: string | null
  ) {}

  static async anonymous(baseURL: string) {
    return new ApiClient(await request.newContext({ baseURL }), null, null, null);
  }

  static async withToken(baseURL: string, token: string, userId: string, email: string) {
    const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    return new ApiClient(ctx, token, userId, email);
  }

  static async login(baseURL: string, email: string, password = PASSWORD) {
    const anon = await request.newContext({ baseURL });
    const res = await anon.post('/api/login', { data: { email, password } });
    if (!res.ok()) throw new Error(`Login failed for ${email}: ${res.status()} ${await res.text()}`);
    const { token, user } = await res.json();
    await anon.dispose();
    return ApiClient.withToken(baseURL, token, user.id, email);
  }

  me = () => this.ctx.get('/api/me');
  getUser = (userId: string) => this.ctx.get(`/api/users/${userId}`);
  members = (orgId: string) => this.ctx.get(`/api/orgs/${orgId}/members`);
  orgData = (orgId: string) => this.ctx.get(`/api/orgs/${orgId}/data`);
  updateOrg = (orgId: string, name: string) => this.ctx.patch(`/api/orgs/${orgId}`, { data: { name } });
  invite = (orgId: string, email: string, role = 'member') =>
    this.ctx.post(`/api/orgs/${orgId}/invites`, { data: { email, role } });
  acceptInvite = (token: string, body: { name?: string; password?: string } = {}) =>
    this.ctx.post(`/api/invites/${token}/accept`, { data: body });
  changeRole = (orgId: string, userId: string, role: string) =>
    this.ctx.patch(`/api/orgs/${orgId}/members/${userId}`, { data: { role } });
  removeMember = (orgId: string, userId: string) => this.ctx.delete(`/api/orgs/${orgId}/members/${userId}`);
  setSponsorship = (orgId: string, userId: string, active: boolean) =>
    this.ctx.post(`/api/orgs/${orgId}/members/${userId}/sponsorship`, { data: { active } });
  perks = (orgId: string) => this.ctx.get(`/api/orgs/${orgId}/perks`);
  auditLog = (orgId: string) => this.ctx.get(`/api/orgs/${orgId}/audit-log`);

  dispose = () => this.ctx.dispose();
}

/** Compact, human-readable evidence for reports: "GET /api/x -> 200 {...}". */
export async function describeResponse(res: APIResponse) {
  const url = new URL(res.url());
  let body = await res.text();
  if (body.length > 600) body = body.slice(0, 600) + '…';
  return `${url.pathname} -> HTTP ${res.status()}\n${body}`;
}
