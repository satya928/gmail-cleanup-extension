import { GmailApi } from '../gmail/api';
import { SenderGroup, GmailLabel } from '../../types';

export class ActionsEngine {
  constructor(private api: GmailApi) {}

  /**
   * Helper to fetch or create a label by name
   */
  async getOrCreateLabel(name: string, existingLabels: GmailLabel[]): Promise<GmailLabel> {
    const existing = existingLabels.find((l) => l.name === name);
    if (existing) return existing;
    return this.api.createLabel(name);
  }

  /**
   * Apply a label to all messages in a group
   */
  async applyLabelToGroup(group: SenderGroup, labelName: string): Promise<void> {
    const labels = await this.api.listLabels();
    
    // Ensure parent cleanup label exists
    await this.getOrCreateLabel('Cleanup', labels);
    
    // Get or create child label
    const targetLabel = await this.getOrCreateLabel(`Cleanup/${labelName}`, labels);

    // Batch apply to message IDs
    if (group.messageIds && group.messageIds.length > 0) {
      await this.api.batchModifyMessages(group.messageIds, [targetLabel.id], []);
    }
  }

  /**
   * Bulk archives messages (removes INBOX label)
   */
  async archiveGroup(group: SenderGroup): Promise<void> {
    if (group.messageIds && group.messageIds.length > 0) {
      await this.api.batchModifyMessages(group.messageIds, [], ['INBOX']);
    }
  }

  /**
   * Bulk trash messages
   */
  async trashGroup(group: SenderGroup): Promise<void> {
    if (group.messageIds && group.messageIds.length > 0) {
      await this.api.trashMessages(group.messageIds);
    }
  }

  /**
   * Create a filter to auto-apply a label for future emails from a domain or sender
   */
  async createFilterForGroup(group: SenderGroup, labelName: string): Promise<void> {
    const labels = await this.api.listLabels();
    await this.getOrCreateLabel('Cleanup', labels);
    const targetLabel = await this.getOrCreateLabel(`Cleanup/${labelName}`, labels);
    
    // Create filter by exact sender email or domain
    const fromCriteria = group.senderDomain ? `*@${group.senderDomain}` : group.senderEmail;
    await this.api.createFilter(fromCriteria, targetLabel.id);
  }
}
