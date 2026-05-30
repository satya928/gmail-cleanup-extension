import { AccountInfo } from '../../types';

/* ── In-memory store for tokens added via launchWebAuthFlow ─────────────────
   chrome.identity.getAuthToken only works for the primary Chrome profile
   account. Extra accounts (added via the picker) get a plain OAuth access
   token from launchWebAuthFlow; we keep those here so the rest of the app
   can call getTokenForAccount(account) uniformly.                           */
const extraTokens = new Map<string, string>(); // email → access token

/* ─── helpers ────────────────────────────────────────────────────────────── */
async function fetchEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email ?? null;
  } catch { return null; }
}

/** Build Google OAuth URL for launchWebAuthFlow (implicit / token flow). */
function buildOAuthUrl(prompt: 'select_account' | 'consent' | 'none'): string {
  const manifest  = chrome.runtime.getManifest();
  const clientId  = manifest.oauth2?.client_id ?? '';
  const scopes    = (manifest.oauth2?.scopes ?? []).join(' ');
  const redirectUri = chrome.identity.getRedirectURL();

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',     clientId);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri',  redirectUri);
  url.searchParams.set('scope',         scopes);
  url.searchParams.set('prompt',        prompt);
  return url.toString();
}

/** Extract access_token from the redirect URL hash/query after OAuth flow. */
function extractToken(responseUrl: string): string | null {
  try {
    // Token is in the hash fragment: #access_token=...
    const hash   = new URL(responseUrl).hash.slice(1);
    const params = new URLSearchParams(hash);
    return params.get('access_token');
  } catch { return null; }
}

/* ─── exported refresh helper (used by GmailApi) ─────────────────────────── */
export function refreshToken(oldToken: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.removeCachedAuthToken({ token: oldToken }, () => {
      chrome.identity.getAuthToken({ interactive: false }, (newToken) => {
        if (chrome.runtime.lastError || !newToken) {
          chrome.identity.getAuthToken({ interactive: true }, (t2) => {
            if (chrome.runtime.lastError || !t2) {
              reject(new Error('Session expired. Please reconnect Gmail.'));
            } else { resolve(t2); }
          });
        } else { resolve(newToken); }
      });
    });
  });
}

/* ─── AuthModule ──────────────────────────────────────────────────────────── */
export class AuthModule {

  /** Silent-or-interactive token for the primary Chrome profile account. */
  static async getToken(interactive = true): Promise<string> {
    return new Promise((resolve, reject) => {
      const tid = interactive ? null : setTimeout(
        () => reject(new Error('Silent token check timed out.')), 15000
      );
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (tid) clearTimeout(tid);
        if (chrome.runtime.lastError || !token)
          reject(chrome.runtime.lastError ?? new Error('Failed to get token'));
        else resolve(token);
      });
    });
  }

  /**
   * Discover all Google accounts available to this extension.
   * Primary account comes from getProfileUserInfo; additional accounts
   * from getAccounts (Chrome-signed-in) or from extraTokens (web-auth-flow).
   */
  static async getAccounts(): Promise<AccountInfo[]> {
    const found = new Map<string, AccountInfo>();

    // 1. Primary via getProfileUserInfo (fast, no network)
    try {
      const primary = await new Promise<{ email: string; id: string }>((res, rej) => {
        (chrome.identity as any).getProfileUserInfo({ accountStatus: 'ANY' }, (info: any) => {
          if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
          else res(info);
        });
      });
      if (primary?.email) found.set(primary.id || 'primary', { id: primary.id || 'primary', email: primary.email });
    } catch { /* fallthrough */ }

    // 2. Other Chrome-signed-in accounts
    if (typeof chrome.identity.getAccounts === 'function') {
      try {
        const chromeAccts = await new Promise<chrome.identity.AccountInfo[]>(
          (res) => chrome.identity.getAccounts(a => res(a ?? []))
        );
        for (const acct of chromeAccts) {
          if (found.has(acct.id)) continue;
          try {
            const token = await new Promise<string>((res, rej) => {
              chrome.identity.getAuthToken({ interactive: false, account: acct } as any, (t) => {
                if (chrome.runtime.lastError || !t) rej(new Error('no token'));
                else res(t);
              });
            });
            const email = await fetchEmail(token);
            if (email) found.set(acct.id, { id: acct.id, email });
          } catch { /* account not yet authorized */ }
        }
      } catch { /* getAccounts unavailable */ }
    }

    // 3. Accounts added via launchWebAuthFlow (extra tokens in memory)
    for (const [email] of extraTokens) {
      if (![...found.values()].find(a => a.email === email)) {
        found.set(email, { id: email, email });
      }
    }

    // 4. Last resort — at least return primary with email from userinfo
    if (found.size === 0) {
      try {
        const token = await AuthModule.getToken(false);
        const email = await fetchEmail(token);
        found.set('primary', { id: 'primary', email: email ?? 'Primary account' });
      } catch { /* nothing we can do */ }
    }

    return [...found.values()].filter(a => !!a.email);
  }

  /**
   * Show Google's account-chooser popup so the user can sign in with any
   * Google account — including ones not currently in Chrome.
   * Uses launchWebAuthFlow with prompt=select_account.
   */
  static getRedirectUri(): string {
    return chrome.identity.getRedirectURL();
  }

  static async authorizeNewAccount(): Promise<AccountInfo> {
    const redirectUri = chrome.identity.getRedirectURL();
    return new Promise((resolve, reject) => {
      const url = buildOAuthUrl('select_account');
      chrome.identity.launchWebAuthFlow({ url, interactive: true }, async (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          const msg = chrome.runtime.lastError?.message ?? 'Account selection cancelled.';
          // Surface the redirect URI so the user knows what to register
          if (msg.toLowerCase().includes('redirect') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('blocked') || msg.toLowerCase().includes('closed')) {
            reject(new Error(`REDIRECT_URI_MISMATCH::${redirectUri}`));
          } else {
            reject(new Error(msg));
          }
          return;
        }
        const token = extractToken(responseUrl);
        if (!token) {
          reject(new Error('Could not extract token from Google response.'));
          return;
        }
        const email = await fetchEmail(token);
        if (!email) {
          reject(new Error('Could not read email from the selected account.'));
          return;
        }
        // Store token so getTokenForAccount can retrieve it
        extraTokens.set(email, token);
        resolve({ id: email, email });
      });
    });
  }

  /**
   * Get a valid access token for the given account.
   * - Primary / Chrome-cached accounts: uses getAuthToken
   * - Extra accounts (added via picker): returns stored token, re-auths if expired
   */
  static async getTokenForAccount(account: AccountInfo, interactive = true): Promise<string> {
    // Extra account (added via launchWebAuthFlow)
    if (extraTokens.has(account.email)) {
      const stored = extraTokens.get(account.email)!;
      // Quick validity check
      const email = await fetchEmail(stored);
      if (email) return stored;
      // Token expired — re-run the web auth flow silently, then interactively
      return new Promise((resolve, reject) => {
        const url = buildOAuthUrl('none'); // silent re-auth
        chrome.identity.launchWebAuthFlow({ url, interactive: false }, async (responseUrl) => {
          const token = responseUrl ? extractToken(responseUrl) : null;
          if (token) {
            extraTokens.set(account.email, token);
            resolve(token);
          } else if (interactive) {
            // Prompt the user again
            try {
              const newAcct = await AuthModule.authorizeNewAccount();
              const newToken = extraTokens.get(newAcct.email);
              if (newToken) resolve(newToken);
              else reject(new Error('Re-authorization failed.'));
            } catch (e) { reject(e); }
          } else {
            reject(new Error(`Token expired for ${account.email}. Please re-authorize.`));
          }
        });
      });
    }

    // Primary / Chrome-cached account
    return new Promise((resolve, reject) => {
      if (account.id === 'primary') {
        AuthModule.getToken(interactive).then(resolve).catch(reject);
        return;
      }
      const tid = interactive ? null : setTimeout(
        () => reject(new Error(`Silent token timed out for ${account.email}`)), 15000
      );
      chrome.identity.getAuthToken({ interactive, account: { id: account.id } } as any, (token) => {
        if (tid) clearTimeout(tid);
        if (chrome.runtime.lastError || !token)
          reject(chrome.runtime.lastError ?? new Error(`Failed to get token for ${account.email}`));
        else resolve(token);
      });
    });
  }

  static async removeToken(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
          .then(() => resolve()).catch(reject);
      });
    });
  }
}
