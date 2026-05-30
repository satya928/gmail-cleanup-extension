import { SenderGroup, GmailMessageMetadata } from '../../types';

export class GroupingEngine {
  /**
   * Parses a From header into Name, Email, and Domain
   * e.g., "Google Updates <news@google.com>" -> { name: 'Google Updates', email: 'news@google.com', domain: 'google.com' }
   */
  static parseSender(fromHeader: string): { name: string; email: string; domain: string } {
    let name = '';
    let email = fromHeader;
    
    // Check if it's in the format "Name <email@domain.com>"
    const match = fromHeader.match(/(.*)<(.*)>/);
    if (match) {
      name = match[1].replace(/"/g, '').trim();
      email = match[2].trim().toLowerCase();
    } else {
      email = email.trim().toLowerCase();
    }

    let domain = '';
    if (email.includes('@')) {
      domain = email.split('@')[1];
    }

    return { name, email, domain };
  }

  /**
   * Processes an array of message metadata and groups them by sender email.
   */
  static processMessages(messages: GmailMessageMetadata[]): Record<string, SenderGroup> {
    const groups: Record<string, SenderGroup> = {};

    for (const msg of messages) {
      if (!msg.payload?.headers) continue;
      
      const fromHeader = msg.payload.headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      const listUnsubscribe = msg.payload.headers.find(h => h.name.toLowerCase() === 'list-unsubscribe');
      const dateHeader = msg.payload.headers.find(h => h.name.toLowerCase() === 'date')?.value;
      const ts = dateHeader ? new Date(dateHeader).getTime() : 0;

      const { name, email, domain } = this.parseSender(fromHeader);
      
      if (!email) continue;
      
      if (!groups[email]) {
        groups[email] = {
          senderEmail: email,
          senderDomain: domain,
          senderDisplayName: name || email,
          messageCount: 0,
          inboxCount: 0,
          promotionsCount: 0,
          socialCount: 0,
          latestMessageDate: ts,
          oldestMessageDate: ts,
          suspectedSubscriptionScore: 0,
          hasListUnsubscribeHeader: !!listUnsubscribe,
          messageIds: []
        };
      }

      const group = groups[email];
      group.messageCount += 1;
      group.messageIds.push(msg.id);
      
      const labelIds = msg.labelIds || [];
      if (labelIds.includes('INBOX')) group.inboxCount += 1;
      if (labelIds.includes('CATEGORY_PROMOTIONS')) group.promotionsCount += 1;
      if (labelIds.includes('CATEGORY_SOCIAL')) group.socialCount += 1;
      
      if (ts > group.latestMessageDate) group.latestMessageDate = ts;
      if (ts < group.oldestMessageDate) group.oldestMessageDate = ts;
      
      // Update Name if it was blank and now we have one
      if (!group.senderDisplayName && name) group.senderDisplayName = name;
    }

    // After aggregation, calculate score
    Object.values(groups).forEach(group => {
      let score = 0;
      if (group.hasListUnsubscribeHeader) score += 5;
      if (group.promotionsCount > 0) score += 3;
      if (group.socialCount > 0) score += 2;
      if (group.messageCount > 5) score += 1;
      
      const domainParts = group.senderDomain.split('.');
      if (domainParts[0] === 'mail' || domainParts[0] === 'news' || domainParts[0] === 'hello') {
        score += 2;
      }

      group.suspectedSubscriptionScore = score;
      
      // Recommended Action logic (Archive/Trash)
      if (score >= 5 && group.oldestMessageDate < Date.now() - 90 * 24 * 60 * 60 * 1000) {
        group.recommendedAction = 'trash';
      } else {
        group.recommendedAction = 'archive';
      }
    });

    return groups;
  }
}
