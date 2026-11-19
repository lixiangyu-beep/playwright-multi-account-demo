import { test as base, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { ACME, accounts, authFile, PASSWORD, SeedRole, uniqueEmail } from './support/accounts';
import { ApiClient } from './support/api-client';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';

export interface Actor {
  page: Page;
  context: BrowserContext;
  dashboard: DashboardPage;
}

export interface TempMember {
  id: string;
  name: string;
  email: string;
  password: string;
  /** API client authenticated as this member (Bearer token). */
  api: ApiClient;
}

type Fixtures = {
  /** Opens an isolated browser context logged in as a seeded account (via storageState). */
  as: (role: SeedRole) => Promise<Actor>;
  /** Opens an isolated browser context and logs in through the UI with any credentials. */
  loginAs: (email: string, password?: string) => Promise<Actor>;
  /** Opens a fresh, logged-out browser context (e.g. for an invitee). */
  anonymous: () => Promise<Actor>;
  /** API client authenticated with a seeded account's Bearer token. */
  apiAs: (role: SeedRole) => Promise<ApiClient>;
  /**
   * Creates a brand-new Acme member through the real invite + accept API, so tests that
   * mutate roles / remove people never touch the shared seed accounts.
   */
  tempMember: (role?: 'admin' | 'member' | 'viewer') => Promise<TempMember>;
};

async function openContext(browser: Browser, contexts: BrowserContext[], storageState?: string): Promise<Actor> {
  const context = await browser.newContext(storageState ? { storageState } : {});
  contexts.push(context);
  const page = await context.newPage();
  return { page, context, dashboard: new DashboardPage(page) };
}

export const test = base.extend<Fixtures>({
  as: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use((role) => openContext(browser, contexts, authFile(role)));
    await Promise.all(contexts.map((c) => c.close()));
  },

  anonymous: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(() => openContext(browser, contexts));
    await Promise.all(contexts.map((c) => c.close()));
  },

  loginAs: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (email, password = PASSWORD) => {
      const actor = await openContext(browser, contexts);
      const login = new LoginPage(actor.page);
      await login.goto();
      await login.login(email, password);
      await expect(actor.page).toHaveURL(/\/dashboard$/);
      return actor;
    });
    await Promise.all(contexts.map((c) => c.close()));
  },

  apiAs: async ({ baseURL }, use) => {
    const clients: ApiClient[] = [];
    await use(async (role) => {
      const client = await ApiClient.login(baseURL!, accounts[role].email);
      clients.push(client);
      return client;
    });
    await Promise.all(clients.map((c) => c.dispose()));
  },

  tempMember: async ({ baseURL }, use) => {
    const clients: ApiClient[] = [];
    await use(async (role = 'member') => {
      const owner = await ApiClient.login(baseURL!, accounts.owner.email);
      clients.push(owner);
      const email = uniqueEmail('temp');
      const name = `Temp ${role}`;
      const invite = await owner.invite(ACME, email, role);
      expect(invite.status(), 'precondition: owner can create an invite').toBe(201);
      const { token: inviteToken } = await invite.json();

      const anon = await ApiClient.anonymous(baseURL!);
      clients.push(anon);
      const accepted = await anon.acceptInvite(inviteToken, { name, password: PASSWORD });
      expect(accepted.status(), 'precondition: invitee can accept').toBe(200);
      const { token, user } = await accepted.json();

      const api = await ApiClient.withToken(baseURL!, token, user.id, email);
      clients.push(api);
      return { id: user.id, name, email, password: PASSWORD, api };
    });
    await Promise.all(clients.map((c) => c.dispose()));
  },
});

export { expect };
