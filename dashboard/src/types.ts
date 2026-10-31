export interface User {
  id: string;
  username: string;
  isOnline: boolean;
  lastSeenAt?: number;
  avatar?: string;
}

export interface GroupMember {
  id: string;
  username: string;
  isOnline: boolean;
  isCreator: boolean;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group' | 'public';
  name?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  lastMessageFrom?: string;
  unreadCount: number;
  participants?: User[];
}

export interface Message {
  id: string;
  conversationId: string;
  fromUserId: string;
  text: string;
  timestamp: number;
  seq?: number;
  senderId?: string;
  content?: string;
  createdAt?: number;
  kind?: string;
  fillable?: FillableMessagePayload;
}

export interface Notification {
  id: string;
  type: 'join' | 'mention' | 'contact_request' | 'contact_accept' | 'group_invite';
  actorId: string;
  text: string;
  timestamp: number;
  isRead: boolean;
}

export interface Suggestion {
  id: string;
  username: string;
  isOnline: boolean;
  mutualCount: number;
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  username: string;
  isTyping: boolean;
}

export interface ServerMessage {
  type: string;
  [key: string]: any;
}

// ==========================================
// Membership-Bound Message Recovery Types
// ==========================================
export interface MissingRange {
  startSeq: number;
  endSeq: number;
}

export interface RecoveryBatch {
  planId: string;
  conversationId: string;
  membershipVersion: number;
  messages: Message[];
  hasMore: boolean;
  nextSeq: number;
  batchSize: number;
}

// ==========================================
// Live Collaborative Fill-in Messages (LCFM)
// ==========================================
export type FillableFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'time'
  | 'select'
  | 'multiselect'
  | 'checkbox';

export type FillableMessageStatus =
  | 'open'
  | 'ready'
  | 'finalized'
  | 'expired'
  | 'cancelled';

export interface FillableFieldValidationRules {
  min?: number;
  max?: number;
  pattern?: string;
  options?: string[];
}

export interface FillableFieldDetail {
  fieldId: string;
  order: number;
  label: string;
  fieldType: FillableFieldType;
  placeholder: string;
  required: boolean;
  validationRules: FillableFieldValidationRules;
  assignmentMode: 'all' | 'creator' | 'custom';
  assignedUserIds: string[];
  assignedUsernames: string[];
  currentValue: any;
  version: number;
  lastEditorId: string | null;
  lastEditorUsername: string | null;
  lastUpdatedAt: number | null;
  isComplete: boolean;
  canCurrentUserEdit: boolean;
  isOwnContribution?: boolean;
}

export interface FillableMessageTemplateSegment {
  type: 'text' | 'field';
  content?: string;
  fieldId?: string;
}

export interface FillableProgress {
  totalRequired: number;
  completedRequired: number;
  percentage: number;
  isReady: boolean;
}

export interface FillableMessagePayload {
  messageId: string;
  conversationId: string;
  creatorId: string;
  creatorUsername: string;
  introText: string;
  templateSegments: FillableMessageTemplateSegment[];
  status: FillableMessageStatus;
  requireAllMandatory: boolean;
  deadline: number | null;
  finalizePermission: 'creator_only' | 'assigned_or_creator' | 'all';
  lockOnCompletion: boolean;
  allowReopen: boolean;
  isCreator?: boolean;
  createdAt: number;
  updatedAt: number;
  finalizedAt: number | null;
  finalizedBy: string | null;
  finalizedByUsername?: string | null;
  fields: FillableFieldDetail[];
  progress: FillableProgress;
}

export interface FillableRevision {
  id: string;
  messageId: string;
  fieldId: string;
  fieldLabel: string;
  editorId: string;
  editorUsername: string;
  previousValue: any;
  newValue: any;
  revisionNumber: number;
  clientMutationId?: string;
  timestamp: number;
}
