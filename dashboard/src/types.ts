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
  isDeleted?: boolean;
  deletedForEveryone?: boolean;
  deletedByUsername?: string;
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

// ==========================================
// User Avatar Gradient Palette Utility
// ==========================================
export interface AvatarGradient {
  bg: string;
  text: string;
  border: string;
  glow: string;
}

export function getAvatarGradient(name?: string): AvatarGradient {
  const gradients: AvatarGradient[] = [
    { bg: 'linear-gradient(135deg, #6366f1, #8b5cf6)', text: '#ffffff', border: 'rgba(167, 139, 250, 0.5)', glow: 'rgba(99, 102, 241, 0.35)' },
    { bg: 'linear-gradient(135deg, #0ea5e9, #0284c7)', text: '#ffffff', border: 'rgba(56, 189, 248, 0.5)', glow: 'rgba(14, 165, 233, 0.35)' },
    { bg: 'linear-gradient(135deg, #10b981, #059669)', text: '#ffffff', border: 'rgba(110, 231, 183, 0.5)', glow: 'rgba(16, 185, 129, 0.35)' },
    { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', text: '#ffffff', border: 'rgba(252, 211, 77, 0.5)', glow: 'rgba(245, 158, 11, 0.35)' },
    { bg: 'linear-gradient(135deg, #ec4899, #e11d48)', text: '#ffffff', border: 'rgba(244, 114, 182, 0.5)', glow: 'rgba(236, 72, 153, 0.35)' },
    { bg: 'linear-gradient(135deg, #8b5cf6, #d946ef)', text: '#ffffff', border: 'rgba(232, 121, 249, 0.5)', glow: 'rgba(139, 92, 246, 0.35)' },
    { bg: 'linear-gradient(135deg, #14b8a6, #0f766e)', text: '#ffffff', border: 'rgba(94, 234, 212, 0.5)', glow: 'rgba(20, 184, 166, 0.35)' },
    { bg: 'linear-gradient(135deg, #f97316, #ea580c)', text: '#ffffff', border: 'rgba(253, 186, 116, 0.5)', glow: 'rgba(249, 115, 22, 0.35)' },
  ];
  if (!name || name.trim() === '') return gradients[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}
