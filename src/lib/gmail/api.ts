import { GmailLabel, GmailMessageMetadata } from '../../types';

const GMAIL_BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Refresh the cached OAuth token then resolve with the new one. */
function refreshToken(oldToken: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.removeCachedAuthToken({ token: oldToken }, () => {
      chrome.identity.getAuthToken({ interactive: false }, (newToken) => {
        if (chrome.runtime.lastError || !newToken) {
          // Silent refresh failed — try interactive so the user can re-auth
          chrome.identity.getAuthToken({ interactive: true }, (t2) => {
            if (chrome.runtime.lastError || !t2) {
              reject(new Error('Session expired. Please reconnect Gmail.'));
            } else {
              resolve(t2);
            }
          });
        } else {
          resolve(newToken);
        }
      });
    });
  });
}

export class GmailApi {
  constructor(public token: string) {}

  private async fetchApi(path: string, options: RequestInit = {}, isRetry = false): Promise<any> {
    const response = await fetch(`${GMAIL_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Token expired — refresh once and retry
    if (response.status === 401 && !isRetry) {
      this.token = await refreshToken(this.token);
      return this.fetchApi(path, options, true);
    }

    if (!response.ok) {
      let errorMsg = response.statusText;
      try {
        const errJson = await response.json();
        if (errJson?.error?.message) errorMsg = errJson.error.message;
      } catch (_) {}
      throw new Error(`Gmail API error: ${response.status} - ${errorMsg}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async listLabels(): Promise<GmailLabel[]> {
    const data = await this.fetchApi('/labels');
    return data.labels || [];
  }

  async createLabel(name: string): Promise<GmailLabel> {
    const body = JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' });
    return this.fetchApi('/labels', { method: 'POST', body });
  }

  async listMessages(labelIds: string[] = [], maxResults = 500, pageToken?: string): Promise<{ messages: { id: string; threadId: string }[]; nextPageToken?: string }> {
    let path = `/messages?maxResults=${Math.min(maxResults, 500)}`;
    labelIds.forEach(id => path += `&labelIds=${id}`);
    if (pageToken) path += `&pageToken=${pageToken}`;
    return this.fetchApi(path);
  }

  async getMessageMetadata(messageId: string): Promise<GmailMessageMetadata> {
    return this.fetchApi(`/messages/${messageId}?format=metadata`);
  }

  async batchModifyMessages(messageIds: string[], addLabelIds: string[] = [], removeLabelIds: string[] = []): Promise<void> {
    const CHUNK = 1000;
    for (let i = 0; i < messageIds.length; i += CHUNK) {
      const body = JSON.stringify({ ids: messageIds.slice(i, i + CHUNK), addLabelIds, removeLabelIds });
      await this.fetchApi('/messages/batchModify', { method: 'POST', body });
    }
  }

  async trashMessages(messageIds: string[]): Promise<void> {
    const CHUNK = 1000;
    for (let i = 0; i < messageIds.length; i += CHUNK) {
      const body = JSON.stringify({ ids: messageIds.slice(i, i + CHUNK), addLabelIds: ['TRASH'], removeLabelIds: [] });
      await this.fetchApi('/messages/batchModify', { method: 'POST', body });
    }
  }

  async createFilter(fromStr: string, labelId: string): Promise<any> {
    const body = JSON.stringify({ criteria: { from: fromStr }, action: { addLabelIds: [labelId] } });
    return this.fetchApi('/settings/filters', { method: 'POST', body });
  }
}
