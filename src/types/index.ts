export interface AccountInfo {
  id: string;
  email: string;
}

export interface SenderGroup {
  senderEmail: string;
  senderDomain: string;
  senderDisplayName: string;
  messageCount: number;
  inboxCount: number;
  promotionsCount: number;
  socialCount: number;
  latestMessageDate: number;
  oldestMessageDate: number;
  suspectedSubscriptionScore: number;
  hasListUnsubscribeHeader: boolean;
  selectedLabel?: string;
  recommendedAction?: 'label' | 'archive' | 'trash';
  messageIds: string[];
  accountEmail?: string; // which Gmail account this sender belongs to
  category?: string;     // auto-detected context category
}

export interface CleanupRule {
  ruleId: string;
  senderDomain?: string;
  senderEmail?: string;
  actionType: 'label' | 'archive' | 'trash' | 'filterCreate';
  olderThanDays?: number;
  labelName?: string;
  enabled: boolean;
}

export interface GmailLabel {
  id: string;
  name: string;
  messageListVisibility?: string;
  labelListVisibility?: string;
  type?: string;
}

export interface GmailMessageMetadata {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: {
    headers: { name: string; value: string }[];
  };
}
