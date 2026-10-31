// server.js - Node.js TCP Chat Server (Full SQLite persistence + LCFM + Recovery)
const net = require('net');
const path = require('path');
const fs = require('fs');
const { openDatabase } = require('./lib/database');

const PORT = parseInt(process.env.PORT || process.argv[2] || '8080', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'chat.db');
const AUTH_POLICY = process.env.AUTH_POLICY || 'current_membership';
const RECOVERY_BASE_BATCH = parseInt(process.env.RECOVERY_BASE_BATCH || '25', 10);
const RECOVERY_MIN_BATCH = parseInt(process.env.RECOVERY_MIN_BATCH || '5', 10);
const RECOVERY_MAX_BATCH = parseInt(process.env.RECOVERY_MAX_BATCH || '100', 10);
const RECOVERY_PLAN_TTL_MS = parseInt(process.env.RECOVERY_PLAN_TTL_MS || '60000', 10);

let db = null;

// Active connection mappings
const activeConnections = new Map();  // socket -> session
const userIdToSockets = new Map();    // userId -> Set<socket>

// ==========================================
// Utilities
// ==========================================
function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function ts() {
  return Math.floor(Date.now() / 1000);
}

function sendLine(socket, obj) {
  try {
    if (socket && !socket.destroyed) {
      socket.write(JSON.stringify(obj) + '\n');
    }
  } catch (e) {
    // ignore write errors
  }
}

function sendError(socket, message) {
  sendLine(socket, { type: 'error', message });
}

function broadcast(obj) {
  for (const [sock, session] of activeConnections.entries()) {
    if (session.isAuthenticated) {
      sendLine(sock, obj);
    }
  }
}

function sendToUser(userId, obj) {
  const sockets = userIdToSockets.get(userId);
  if (sockets && sockets.size > 0) {
    for (const socket of sockets) {
      sendLine(socket, obj);
    }
    return true;
  }
  return false;
}

function broadcastToConversation(conversationId, obj, excludeUserId = null) {
  if (conversationId === 'public_general') {
    for (const [sock, session] of activeConnections.entries()) {
      if (session.isAuthenticated && (!excludeUserId || session.userId !== excludeUserId)) {
        sendLine(sock, obj);
      }
    }
    return;
  }

  const memberRows = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
  for (const row of memberRows) {
    if (excludeUserId && row.user_id === excludeUserId) continue;
    sendToUser(row.user_id, obj);
  }
}

function allocateSeq(conversationId) {
  const row = db.prepare('SELECT MAX(seq) as maxSeq FROM messages WHERE conversation_id = ?').get(conversationId);
  return ((row && row.maxSeq) ? row.maxSeq : 0) + 1;
}

function bumpMembershipVersion(conversationId) {
  const conv = db.prepare('SELECT membership_version FROM conversations WHERE id = ?').get(conversationId);
  const nextVer = ((conv && conv.membership_version) ? conv.membership_version : 1) + 1;
  db.prepare('UPDATE conversations SET membership_version = ? WHERE id = ?').run(nextVer, conversationId);
  broadcastToConversation(conversationId, {
    type: 'membership_changed',
    conversationId,
    membershipVersion: nextVer
  });
  return nextVer;
}

function isMember(userId, conversationId) {
  if (conversationId === 'public_general') return true;
  const row = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, userId);
  return !!row;
}

function getUserById(userId) {
  if (!userId) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
}

function getUserByUsername(username) {
  if (!username) return null;
  return db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim()) || null;
}

function getConversation(conversationId) {
  if (!conversationId) return null;
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) || null;
}

// ==========================================
// Schema initialization and migrations
// ==========================================
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER,
      is_online INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT,
      created_at INTEGER NOT NULL,
      creator_id TEXT,
      membership_version INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      seq INTEGER,
      kind TEXT DEFAULT 'text'
    );

    CREATE TABLE IF NOT EXISTS deleted_messages_for_me (
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      target_user_id TEXT NOT NULL,
      actor_id TEXT,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      is_read INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS contacts (
      user_id1 TEXT NOT NULL,
      user_id2 TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id1, user_id2)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      user_id TEXT PRIMARY KEY,
      generation INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_cursors (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      contiguous_seq INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, conversation_id)
    );

    CREATE TABLE IF NOT EXISTS recovery_missing (
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      start_seq INTEGER NOT NULL,
      end_seq INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      session_generation INTEGER NOT NULL,
      start_seq INTEGER NOT NULL,
      end_seq INTEGER NOT NULL,
      membership_version INTEGER NOT NULL,
      state TEXT NOT NULL,
      batch_size INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    -- Live Collaborative Fill-in Messages (LCFM)
    CREATE TABLE IF NOT EXISTS collaborative_messages (
      message_id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      intro_text TEXT,
      template_segments TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      require_all_mandatory INTEGER DEFAULT 1,
      deadline INTEGER,
      finalize_permission TEXT DEFAULT 'creator_only',
      lock_on_completion INTEGER DEFAULT 1,
      allow_reopen INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      finalized_at INTEGER,
      finalized_by TEXT
    );

    CREATE TABLE IF NOT EXISTS collaborative_message_fields (
      id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      field_order INTEGER NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL,
      placeholder TEXT,
      required INTEGER DEFAULT 1,
      validation_rules TEXT,
      assignment_mode TEXT NOT NULL DEFAULT 'custom',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (message_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_collab_fields_msg ON collaborative_message_fields (message_id);

    CREATE TABLE IF NOT EXISTS collaborative_field_permissions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      field_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      permission_type TEXT DEFAULT 'edit',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_collab_perm_field ON collaborative_field_permissions (message_id, field_id);

    CREATE TABLE IF NOT EXISTS collaborative_field_values (
      field_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      current_value TEXT,
      version INTEGER DEFAULT 0,
      updated_by TEXT,
      updated_at INTEGER,
      is_complete INTEGER DEFAULT 0,
      PRIMARY KEY (message_id, field_id)
    );
    CREATE INDEX IF NOT EXISTS idx_collab_values_msg ON collaborative_field_values (message_id);

    CREATE TABLE IF NOT EXISTS collaborative_message_revisions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      field_id TEXT NOT NULL,
      editor_user_id TEXT NOT NULL,
      previous_value TEXT,
      new_value TEXT,
      revision_number INTEGER NOT NULL,
      client_mutation_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_collab_rev_msg ON collaborative_message_revisions (message_id);
  `);

  // Ensure migrations on existing tables if needed
  try {
    const convCols = db.prepare("PRAGMA table_info(conversations)").all();
    if (!convCols.some(c => c.name === 'membership_version')) {
      db.exec("ALTER TABLE conversations ADD COLUMN membership_version INTEGER DEFAULT 1");
    }
  } catch (e) {}

  try {
    const msgCols = db.prepare("PRAGMA table_info(messages)").all();
    if (!msgCols.some(c => c.name === 'seq')) {
      db.exec("ALTER TABLE messages ADD COLUMN seq INTEGER");
    }
    if (!msgCols.some(c => c.name === 'kind')) {
      db.exec("ALTER TABLE messages ADD COLUMN kind TEXT DEFAULT 'text'");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON messages (conversation_id, seq)");
  } catch (e) {}

  // Seed public general channel if missing
  const pubConv = db.prepare("SELECT * FROM conversations WHERE id = 'public_general'").get();
  if (!pubConv) {
    db.prepare(`
      INSERT INTO conversations (id, type, name, created_at, creator_id, membership_version)
      VALUES ('public_general', 'public', 'General', ?, 'system', 1)
    `).run(ts());
  }

  // Mark all users offline at fresh server startup
  db.exec("UPDATE users SET is_online = 0");
}

// ==========================================
// Recovery Subsystem Logic
// ==========================================
function getCursor(userId, conversationId) {
  const row = db.prepare('SELECT contiguous_seq FROM recovery_cursors WHERE user_id = ? AND conversation_id = ?').get(userId, conversationId);
  return row ? row.contiguous_seq : 0;
}

function setCursor(userId, conversationId, contiguousSeq) {
  const existing = db.prepare('SELECT contiguous_seq FROM recovery_cursors WHERE user_id = ? AND conversation_id = ?').get(userId, conversationId);
  if (existing) {
    if (contiguousSeq > existing.contiguous_seq) {
      db.prepare('UPDATE recovery_cursors SET contiguous_seq = ?, updated_at = ? WHERE user_id = ? AND conversation_id = ?')
        .run(contiguousSeq, ts(), userId, conversationId);
    }
  } else {
    db.prepare('INSERT INTO recovery_cursors (user_id, conversation_id, contiguous_seq, updated_at) VALUES (?, ?, ?, ?)')
      .run(userId, conversationId, contiguousSeq, ts());
  }
}

function addMissingRange(userId, conversationId, startSeq, endSeq) {
  if (startSeq > endSeq) return;
  db.prepare('INSERT INTO recovery_missing (user_id, conversation_id, start_seq, end_seq) VALUES (?, ?, ?, ?)')
    .run(userId, conversationId, startSeq, endSeq);
}

function clearMissingUpTo(userId, conversationId, cursor) {
  db.prepare('DELETE FROM recovery_missing WHERE user_id = ? AND conversation_id = ? AND end_seq <= ?')
    .run(userId, conversationId, cursor);
}

function adaptiveBatchSize(plan, remaining) {
  let bs = plan.batch_size || RECOVERY_BASE_BATCH;
  if (remaining < 50) {
    bs = Math.min(bs, remaining);
  } else if (remaining > 200) {
    bs = Math.min(RECOVERY_MAX_BATCH, bs + 25);
  }
  return Math.max(RECOVERY_MIN_BATCH, Math.min(RECOVERY_MAX_BATCH, bs));
}

function authorizePlan(plan, userId, convId, sessionGen) {
  if (!plan) return { authorized: false, reason: 'plan_not_found' };
  if (plan.user_id !== userId || plan.conversation_id !== convId) {
    return { authorized: false, reason: 'unauthorized_session' };
  }
  if (plan.session_generation !== sessionGen) {
    db.prepare("UPDATE recovery_plans SET state = 'invalidated' WHERE id = ?").run(plan.id);
    return { authorized: false, reason: 'session_changed' };
  }
  if (plan.state !== 'active') {
    return { authorized: false, reason: plan.state };
  }
  if (Date.now() > plan.expires_at) {
    db.prepare("UPDATE recovery_plans SET state = 'invalidated' WHERE id = ?").run(plan.id);
    return { authorized: false, reason: 'expired' };
  }

  const conv = getConversation(convId);
  if (!conv) return { authorized: false, reason: 'conversation_not_found' };

  if (AUTH_POLICY === 'current_membership') {
    if (!isMember(userId, convId)) {
      db.prepare("UPDATE recovery_plans SET state = 'invalidated' WHERE id = ?").run(plan.id);
      return { authorized: false, reason: 'membership_revoked' };
    }
    if (conv.membership_version !== plan.membership_version) {
      db.prepare("UPDATE recovery_plans SET state = 'invalidated' WHERE id = ?").run(plan.id);
      return { authorized: false, reason: 'membership_changed' };
    }
  }

  return { authorized: true };
}

// ==========================================
// LCFM Helper Functions
// ==========================================
function validateFieldValue(fieldType, validationRules, value) {
  const rules = validationRules || {};

  // Check empty
  if (value === null || value === undefined || value === '') {
    return { valid: true, isComplete: false, sanitizedValue: null };
  }

  switch (fieldType) {
    case 'text':
    case 'textarea': {
      if (typeof value !== 'string') {
        return { valid: false, error: 'Value must be a string', isComplete: false };
      }
      const trimmed = value.trim();
      const maxLen = rules.max || (fieldType === 'textarea' ? 4000 : 500);
      if (trimmed.length > maxLen) {
        return { valid: false, error: `Maximum length is ${maxLen} characters`, isComplete: false };
      }
      if (rules.min && trimmed.length < rules.min) {
        return { valid: false, error: `Minimum length is ${rules.min} characters`, isComplete: false };
      }
      if (rules.pattern) {
        try {
          const re = new RegExp(rules.pattern);
          if (!re.test(trimmed)) {
            return { valid: false, error: 'Value does not match required format', isComplete: false };
          }
        } catch (e) {}
      }
      return { valid: true, sanitizedValue: trimmed, isComplete: trimmed.length > 0 };
    }

    case 'number': {
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, error: 'Value must be a valid number', isComplete: false };
      }
      if (rules.min !== undefined && num < rules.min) {
        return { valid: false, error: `Minimum value is ${rules.min}`, isComplete: false };
      }
      if (rules.max !== undefined && num > rules.max) {
        return { valid: false, error: `Maximum value is ${rules.max}`, isComplete: false };
      }
      return { valid: true, sanitizedValue: num, isComplete: true };
    }

    case 'date': {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { valid: false, error: 'Date must be in YYYY-MM-DD format', isComplete: false };
      }
      return { valid: true, sanitizedValue: value, isComplete: true };
    }

    case 'time': {
      if (typeof value !== 'string' || value.trim().length === 0) {
        return { valid: false, error: 'Time must be a valid time string', isComplete: false };
      }
      return { valid: true, sanitizedValue: value.trim(), isComplete: true };
    }

    case 'select': {
      const options = rules.options || [];
      if (!options.includes(value)) {
        return { valid: false, error: 'Selected value is not a permitted option', isComplete: false };
      }
      return { valid: true, sanitizedValue: value, isComplete: true };
    }

    case 'multiselect': {
      let arr = value;
      if (typeof arr === 'string') {
        try { arr = JSON.parse(arr); } catch (e) { arr = [arr]; }
      }
      if (!Array.isArray(arr)) {
        return { valid: false, error: 'Value must be an array of selected options', isComplete: false };
      }
      const options = rules.options || [];
      for (const item of arr) {
        if (!options.includes(item)) {
          return { valid: false, error: `Option "${item}" is not permitted`, isComplete: false };
        }
      }
      return { valid: true, sanitizedValue: arr, isComplete: arr.length > 0 };
    }

    case 'checkbox': {
      const boolVal = Boolean(value);
      return { valid: true, sanitizedValue: boolVal, isComplete: boolVal };
    }

    default:
      return { valid: true, sanitizedValue: value, isComplete: Boolean(value) };
  }
}

function getFillablePayloadForUser(basePayload, userId) {
  if (!basePayload) return null;
  const isMsgMember = userId ? isMember(userId, basePayload.conversationId) : false;
  const isEditableStatus = (basePayload.status === 'open' || basePayload.status === 'ready');
  const deadlinePassed = basePayload.deadline && ts() > basePayload.deadline;

  const isCreator = (userId === basePayload.creatorId);

  const userFields = basePayload.fields.map(f => {
    let canEdit = false;
    if (userId && isEditableStatus && !deadlinePassed && isMsgMember) {
      if (f.assignmentMode === 'all') {
        canEdit = true;
      } else if (f.assignmentMode === 'creator') {
        canEdit = isCreator;
      } else if (f.assignmentMode === 'custom') {
        canEdit = f.assignedUserIds.includes(userId);
      }
    }

    const isOwn = Boolean(userId && f.lastEditorId === userId);
    // Creator sees who edited every field. Non-creators only see their own author identity;
    // other contributors' identities are strictly hidden from non-creators!
    const showAuthor = isCreator || isOwn;

    return {
      ...f,
      canCurrentUserEdit: canEdit,
      isOwnContribution: isOwn,
      lastEditorId: showAuthor ? f.lastEditorId : null,
      lastEditorUsername: showAuthor ? (isOwn && !isCreator ? 'You' : f.lastEditorUsername) : null,
      assignedUsernames: isCreator ? f.assignedUsernames : []
    };
  });

  return {
    ...basePayload,
    isCreator,
    fields: userFields
  };
}

function getFillablePayload(messageId, forUserId = null) {
  const msgRow = db.prepare('SELECT * FROM collaborative_messages WHERE message_id = ?').get(messageId);
  if (!msgRow) return null;

  // Auto-check deadline
  if (msgRow.deadline && ts() > msgRow.deadline && (msgRow.status === 'open' || msgRow.status === 'ready')) {
    db.prepare("UPDATE collaborative_messages SET status = 'expired', updated_at = ? WHERE message_id = ?")
      .run(ts(), messageId);
    msgRow.status = 'expired';
  }

  const creator = getUserById(msgRow.creator_id);
  const finalizedByUser = msgRow.finalized_by ? getUserById(msgRow.finalized_by) : null;

  let templateSegments = [];
  try {
    templateSegments = JSON.parse(msgRow.template_segments || '[]');
  } catch (e) {}

  const fieldRows = db.prepare('SELECT * FROM collaborative_message_fields WHERE message_id = ? ORDER BY field_order ASC').all(messageId);
  const fields = [];
  let totalRequired = 0;
  let completedRequired = 0;

  for (const f of fieldRows) {
    if (f.required) totalRequired++;

    const valRow = db.prepare('SELECT * FROM collaborative_field_values WHERE field_id = ? AND message_id = ?').get(f.id, messageId);
    let parsedVal = null;
    let version = 0;
    let isComplete = false;
    let lastEditorId = null;
    let lastUpdatedAt = null;

    if (valRow) {
      version = valRow.version || 0;
      isComplete = Boolean(valRow.is_complete);
      lastEditorId = valRow.updated_by;
      lastUpdatedAt = valRow.updated_at;
      if (valRow.current_value !== null && valRow.current_value !== undefined) {
        try {
          parsedVal = JSON.parse(valRow.current_value);
        } catch (e) {
          parsedVal = valRow.current_value;
        }
      }
    }

    if (f.required && isComplete) completedRequired++;

    // Fetch assigned user IDs
    const permRows = db.prepare('SELECT user_id FROM collaborative_field_permissions WHERE field_id = ? AND message_id = ?').all(f.id, messageId);
    const assignedUserIds = permRows.map(p => p.user_id);
    const assignedUsernames = assignedUserIds.map(uid => {
      const u = getUserById(uid);
      return u ? u.username : uid;
    });

    let validationRules = {};
    try {
      validationRules = JSON.parse(f.validation_rules || '{}');
    } catch (e) {}

    const lastEditorUser = lastEditorId ? getUserById(lastEditorId) : null;

    fields.push({
      fieldId: f.id,
      order: f.field_order,
      label: f.label,
      fieldType: f.field_type,
      placeholder: f.placeholder || '',
      required: Boolean(f.required),
      validationRules,
      assignmentMode: f.assignment_mode,
      assignedUserIds,
      assignedUsernames,
      currentValue: parsedVal,
      version,
      lastEditorId,
      lastEditorUsername: lastEditorUser ? lastEditorUser.username : null,
      lastUpdatedAt,
      isComplete,
      canCurrentUserEdit: false
    });
  }

  const isReady = totalRequired > 0 ? (completedRequired >= totalRequired) : true;
  const percentage = totalRequired === 0 ? 100 : Math.round((completedRequired / totalRequired) * 100);

  const basePayload = {
    messageId: msgRow.message_id,
    conversationId: msgRow.conversation_id,
    creatorId: msgRow.creator_id,
    creatorUsername: creator ? creator.username : 'Unknown',
    introText: msgRow.intro_text || '',
    templateSegments,
    status: msgRow.status,
    requireAllMandatory: Boolean(msgRow.require_all_mandatory),
    deadline: msgRow.deadline || null,
    finalizePermission: msgRow.finalize_permission || 'creator_only',
    lockOnCompletion: Boolean(msgRow.lock_on_completion),
    allowReopen: Boolean(msgRow.allow_reopen),
    createdAt: msgRow.created_at,
    updatedAt: msgRow.updated_at,
    finalizedAt: msgRow.finalized_at || null,
    finalizedBy: msgRow.finalized_by || null,
    finalizedByUsername: finalizedByUser ? finalizedByUser.username : null,
    fields,
    progress: {
      totalRequired,
      completedRequired,
      percentage,
      isReady
    }
  };

  return forUserId ? getFillablePayloadForUser(basePayload, forUserId) : basePayload;
}

function formatMessageForUser(rawMsg, userId) {
  const msgObj = {
    type: 'message',
    id: rawMsg.id,
    conversationId: rawMsg.conversation_id,
    fromUserId: rawMsg.from_user_id,
    senderId: rawMsg.from_user_id,
    text: rawMsg.text,
    content: rawMsg.text,
    timestamp: rawMsg.timestamp,
    createdAt: rawMsg.timestamp,
    seq: rawMsg.seq,
    kind: rawMsg.kind || 'text'
  };

  if (rawMsg.kind === 'collaborative_fillin') {
    msgObj.fillable = getFillablePayload(rawMsg.id, userId);
  }

  return msgObj;
}

// ==========================================
// Connection Handling
// ==========================================
const server = net.createServer((socket) => {
  let buffer = '';
  const session = {
    socket,
    userId: null,
    username: null,
    isAuthenticated: false,
    sessionGeneration: 1
  };
  activeConnections.set(socket, session);

  sendLine(socket, {
    type: 'welcome',
    message: 'Connected to Socket Chat Server'
  });

  socket.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      try {
        const payload = JSON.parse(line);
        handleMessage(session, payload);
      } catch (err) {
        console.error('[Server] Error handling message:', err);
        sendError(socket, 'Server error: ' + err.message);
      }
    }
  });

  socket.on('close', () => cleanupSession(session));
  socket.on('error', (err) => {
    // ignore or log socket errors
  });
});

function cleanupSession(session) {
  activeConnections.delete(session.socket);
  if (session.isAuthenticated && session.userId) {
    const sockets = userIdToSockets.get(session.userId);
    if (sockets) {
      sockets.delete(session.socket);
      if (sockets.size === 0) {
        userIdToSockets.delete(session.userId);
        db.prepare('UPDATE users SET is_online = 0, last_seen_at = ? WHERE id = ?').run(ts(), session.userId);
        broadcast({
          type: 'presence',
          user: { id: session.userId, username: session.username, isOnline: false, lastSeenAt: ts() }
        });
      }
    }
  }
}

// ==========================================
// Message Router
// ==========================================
function handleMessage(session, msg) {
  const { socket } = session;
  const { type } = msg;

  if (type === 'ping') {
    sendLine(socket, { type: 'pong' });
    return;
  }

  if (type === 'auth') {
    return handleAuth(session, msg);
  }

  if (!session.isAuthenticated) {
    sendError(socket, 'Not authenticated');
    return;
  }

  switch (type) {
    // Core Messaging & Conversations
    case 'message':               return handleSendMessage(session, msg);
    case 'fetch_conversations':   return handleFetchConversations(session);
    case 'fetch_history':         return handleFetchHistory(session, msg);
    case 'history':               return handleFetchHistory(session, msg);
    case 'fetch_users':           return handleFetchUsers(session);
    case 'fetch_notifications':   return handleFetchNotifications(session);
    case 'fetch_suggestions':     return handleFetchSuggestions(session);
    case 'create_direct':         return handleCreateDirect(session, msg);
    case 'create_group':          return handleCreateGroup(session, msg);
    case 'add_group_member':
    case 'add_member':            return handleAddGroupMember(session, msg);
    case 'remove_group_member':
    case 'remove_member':         return handleRemoveGroupMember(session, msg);
    case 'leave_group':           return handleLeaveGroup(session, msg);
    case 'fetch_group_members':   return handleFetchGroupMembers(session, msg);
    case 'typing':                return handleTyping(session, msg);
    case 'delete_message':        return handleDeleteMessage(session, msg);
    case 'mark_read':             return; // ack
    case 'mark_notification_read':return handleMarkNotifRead(session, msg);
    case 'search_users':          return handleSearchUsers(session, msg);

    // Membership-Bound Recovery Subsystem
    case 'recover':               return handleRecover(session, msg);
    case 'recover_ack':           return handleRecoverAck(session, msg);
    case 'recover_complete':      return handleRecoverComplete(session, msg);
    case 'get_cursor':            return handleGetCursor(session, msg);

    // Live Collaborative Fill-in Messages (LCFM)
    case 'create_fillable_message':     return handleCreateFillableMessage(session, msg);
    case 'update_fillable_field':       return handleUpdateFillableField(session, msg);
    case 'append_fillable_detail':      return handleAppendFillableDetail(session, msg);
    case 'delete_fillable_detail':      return handleDeleteFillableDetail(session, msg);
    case 'fetch_fillable_message':      return handleFetchFillableMessage(session, msg);
    case 'update_fillable_permissions': return handleUpdateFillablePermissions(session, msg);
    case 'finalize_fillable_message':   return handleFinalizeFillableMessage(session, msg);
    case 'reopen_fillable_message':     return handleReopenFillableMessage(session, msg);
    case 'cancel_fillable_message':     return handleCancelFillableMessage(session, msg);
    case 'fetch_fillable_history':      return handleFetchFillableHistory(session, msg);

    default:
      console.log('[Server] Unknown message type:', type);
  }
}

// ==========================================
// Handlers: Authentication
// ==========================================
function handleAuth(session, msg) {
  const { socket } = session;
  const username = (msg.username || '').trim();

  if (!username || username.length > 50) {
    sendError(socket, 'Invalid username');
    return;
  }

  let user = getUserByUsername(username);
  if (!user) {
    const newId = generateId('user');
    db.prepare('INSERT INTO users (id, username, created_at, last_seen_at, is_online) VALUES (?, ?, ?, ?, 1)')
      .run(newId, username, ts(), ts());
    user = getUserById(newId);
  } else {
    db.prepare('UPDATE users SET is_online = 1, last_seen_at = ? WHERE id = ?').run(ts(), user.id);
  }

  // Update session generation
  const existingSession = db.prepare('SELECT generation FROM sessions WHERE user_id = ?').get(user.id);
  const nextGen = (existingSession ? existingSession.generation : 0) + 1;
  if (existingSession) {
    db.prepare('UPDATE sessions SET generation = ?, created_at = ? WHERE user_id = ?').run(nextGen, ts(), user.id);
  } else {
    db.prepare('INSERT INTO sessions (user_id, generation, created_at) VALUES (?, ?, ?)').run(user.id, nextGen, ts());
  }

  session.userId = user.id;
  session.username = user.username;
  session.isAuthenticated = true;
  session.sessionGeneration = nextGen;

  if (!userIdToSockets.has(user.id)) {
    userIdToSockets.set(user.id, new Set());
  }
  userIdToSockets.get(user.id).add(socket);

  // Auto-join public general channel in DB
  const inPub = db.prepare("SELECT 1 FROM conversation_members WHERE conversation_id = 'public_general' AND user_id = ?").get(user.id);
  if (!inPub) {
    db.prepare("INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ('public_general', ?, ?)").run(user.id, ts());
  }

  // Dual protocol response: auth_success (dashboard) AND auth_ok (recovery test suite)
  sendLine(socket, {
    type: 'auth_success',
    user: { id: user.id, username: user.username, isOnline: true },
    sessionGeneration: nextGen
  });

  sendLine(socket, {
    type: 'auth_ok',
    userId: user.id,
    username: user.username,
    sessionGeneration: nextGen
  });

  broadcast({
    type: 'presence',
    user: { id: user.id, username: user.username, isOnline: true }
  });
}

// ==========================================
// Handlers: Core Messaging
// ==========================================

function handleDeleteMessage(session, msg) {
  const { socket } = session;
  const messageId = msg.messageId;
  const conversationId = msg.conversationId;
  const deleteMode = msg.deleteMode || 'for_me';

  if (!messageId || !conversationId) {
    sendError(socket, 'Invalid delete request');
    return;
  }

  const rawMsg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!rawMsg) {
    sendError(socket, 'Message not found');
    return;
  }

  if (deleteMode === 'for_me') {
    const now = ts();
    try {
      db.prepare('INSERT OR IGNORE INTO deleted_messages_for_me (user_id, message_id, created_at) VALUES (?, ?, ?)')
        .run(session.userId, messageId, now);
    } catch (e) {}

    sendLine(socket, {
      type: 'message_deleted',
      messageId,
      conversationId,
      deleteMode: 'for_me',
      userId: session.userId
    });
    return;
  }

  if (deleteMode === 'for_everyone') {
    const conv = getConversation(conversationId);
    const isSender = rawMsg.from_user_id === session.userId;
    const isGroupCreator = conv && conv.creator_id === session.userId;

    let isCollabCreator = false;
    if (rawMsg.kind === 'collaborative_fillin') {
      const collab = db.prepare('SELECT creator_id FROM collaborative_messages WHERE message_id = ?').get(messageId);
      if (collab && collab.creator_id === session.userId) {
        isCollabCreator = true;
      }
    }

    if (!isSender && !isGroupCreator && !isCollabCreator) {
      sendError(socket, 'Only the sender or group creator can delete this message for everyone');
      return;
    }

    const now = ts();
    db.prepare("UPDATE messages SET text = '🚫 This message was deleted', kind = 'deleted' WHERE id = ?").run(messageId);

    if (rawMsg.kind === 'collaborative_fillin') {
      db.prepare("UPDATE collaborative_messages SET status = 'cancelled', updated_at = ? WHERE message_id = ?").run(now, messageId);
    }

    broadcastToConversation(conversationId, {
      type: 'message_deleted',
      messageId,
      conversationId,
      deleteMode: 'for_everyone',
      deletedByUserId: session.userId,
      deletedByUsername: session.username
    });
  }
}

function handleSendMessage(session, msg) {
  const { socket } = session;
  const conversationId = msg.conversationId;
  const text = (msg.text || msg.content || '').trim();

  if (!conversationId || !text || text.length > 4000) {
    sendError(socket, 'Invalid message');
    return;
  }

  if (conversationId !== 'public_general' && !isMember(session.userId, conversationId)) {
    sendError(socket, 'Unauthorized conversation access');
    return;
  }

  const msgId = generateId('msg');
  const seq = allocateSeq(conversationId);
  const now = ts();

  db.prepare(`
    INSERT INTO messages (id, conversation_id, from_user_id, text, timestamp, seq, kind)
    VALUES (?, ?, ?, ?, ?, ?, 'text')
  `).run(msgId, conversationId, session.userId, text, now, seq);

  const messageObj = {
    type: 'message',
    id: msgId,
    conversationId,
    fromUserId: session.userId,
    senderId: session.userId,
    text,
    content: text,
    timestamp: now,
    createdAt: now,
    seq,
    kind: 'text'
  };

  broadcastToConversation(conversationId, messageObj);
}

function handleFetchConversations(session) {
  const { socket } = session;
  const convRows = db.prepare(`
    SELECT DISTINCT c.* FROM conversations c
    LEFT JOIN conversation_members cm ON c.id = cm.conversation_id
    WHERE c.type = 'public' OR cm.user_id = ?
    ORDER BY c.created_at ASC
  `).all(session.userId);

  const conversationsList = convRows.map(conv => {
    let displayName = conv.name;

    if (conv.type === 'direct') {
      const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conv.id);
      const otherId = members.find(m => m.user_id !== session.userId)?.user_id;
      const other = otherId ? getUserById(otherId) : null;
      displayName = other ? other.username : (conv.name || 'Direct Message');
    }

    const lastMsg = db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND id NOT IN (SELECT message_id FROM deleted_messages_for_me WHERE user_id = ?) ORDER BY seq DESC, timestamp DESC LIMIT 1').get(conv.id, session.userId);

    return {
      id: conv.id,
      type: conv.type,
      name: displayName,
      creatorId: conv.creator_id,
      createdAt: conv.created_at,
      lastMessage: lastMsg ? lastMsg.text : null,
      lastMessageTime: lastMsg ? lastMsg.timestamp : null,
      lastMessageFrom: lastMsg ? lastMsg.from_user_id : null,
      unreadCount: 0
    };
  });

  sendLine(socket, { type: 'conversations', conversations: conversationsList });
}

function handleFetchHistory(session, msg) {
  const { socket } = session;
  const conversationId = msg.conversationId;
  const limit = Math.min(200, parseInt(msg.limit || 50, 10));

  if (!isMember(session.userId, conversationId)) {
    sendError(socket, 'Unauthorized conversation access');
    return;
  }

  const rawMsgs = db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ?
      AND id NOT IN (SELECT message_id FROM deleted_messages_for_me WHERE user_id = ?)
    ORDER BY seq ASC, timestamp ASC
    LIMIT ?
  `).all(conversationId, session.userId, limit);

  const formatted = rawMsgs.map(m => formatMessageForUser(m, session.userId));
  const cur = getCursor(session.userId, conversationId);

  sendLine(socket, {
    type: 'history',
    conversationId,
    messages: formatted,
    cursor: cur
  });
}

function handleFetchUsers(session) {
  const { socket } = session;
  const allUsers = db.prepare('SELECT id, username, is_online, last_seen_at FROM users').all()
    .map(u => ({
      id: u.id,
      username: u.username,
      isOnline: Boolean(u.is_online),
      lastSeenAt: u.last_seen_at
    }));

  sendLine(socket, { type: 'users', users: allUsers });
}

function handleFetchNotifications(session) {
  const { socket } = session;
  const notifs = db.prepare('SELECT * FROM notifications WHERE target_user_id = ? ORDER BY timestamp DESC LIMIT 50')
    .all(session.userId)
    .map(n => ({
      id: n.id,
      targetUserId: n.target_user_id,
      actorId: n.actor_id,
      type: n.type,
      text: n.text,
      timestamp: n.timestamp,
      isRead: Boolean(n.is_read)
    }));

  sendLine(socket, { type: 'notifications', notifications: notifs });
}

function handleFetchSuggestions(session) {
  const { socket } = session;
  const suggestions = db.prepare('SELECT id, username, is_online FROM users WHERE id != ?').all(session.userId)
    .map(u => ({
      id: u.id,
      username: u.username,
      isOnline: Boolean(u.is_online),
      mutualCount: 0
    }));

  sendLine(socket, { type: 'suggestions', suggestions });
}

function handleCreateDirect(session, msg) {
  const { socket } = session;
  const otherUserId = msg.userId;

  if (!otherUserId || otherUserId === session.userId) {
    sendError(socket, 'Invalid user');
    return;
  }

  const otherUser = getUserById(otherUserId);
  if (!otherUser) {
    sendError(socket, 'User not found');
    return;
  }

  // Check existing DM
  const existing = db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
    JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
    WHERE c.type = 'direct'
  `).get(session.userId, otherUserId);

  if (existing) {
    sendLine(socket, { type: 'conversation_created', conversationId: existing.id });
    return;
  }

  const convId = generateId('direct');
  const now = ts();
  const name = `${session.username} & ${otherUser.username}`;

  db.prepare('INSERT INTO conversations (id, type, name, created_at, creator_id, membership_version) VALUES (?, ?, ?, ?, ?, 1)')
    .run(convId, 'direct', name, now, session.userId);

  db.prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)')
    .run(convId, session.userId, now);
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)')
    .run(convId, otherUserId, now);

  sendLine(socket, { type: 'conversation_created', conversationId: convId });
  sendToUser(otherUserId, { type: 'conversation_created', conversationId: convId });
}

function handleCreateGroup(session, msg) {
  const { socket } = session;
  const groupName = (msg.name || msg.title || '').trim();
  const rawMembers = msg.memberIds || msg.members || [];

  if (!groupName || groupName.length > 100) {
    sendError(socket, 'Invalid group name');
    return;
  }

  const memberUserIds = new Set([session.userId]);
  for (const m of rawMembers) {
    if (!m) continue;
    if (m.startsWith('user_')) {
      memberUserIds.add(m);
    } else {
      const u = getUserByUsername(m);
      if (u) memberUserIds.add(u.id);
    }
  }

  const convId = generateId('group');
  const now = ts();

  db.prepare('INSERT INTO conversations (id, type, name, created_at, creator_id, membership_version) VALUES (?, ?, ?, ?, ?, 1)')
    .run(convId, 'group', groupName, now, session.userId);

  for (const uid of memberUserIds) {
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)')
      .run(convId, uid, now);
  }

  // Notify added members
  for (const memberId of memberUserIds) {
    if (memberId !== session.userId) {
      const notifText = `${session.username} added you to group: ${groupName}`;
      const notifId = generateId('notif');
      db.prepare('INSERT INTO notifications (id, target_user_id, actor_id, type, text, timestamp, is_read) VALUES (?, ?, ?, ?, ?, ?, 0)')
        .run(notifId, memberId, session.userId, 'group_invite', notifText, now);

      sendToUser(memberId, { type: 'notification', notifType: 'group_invite', text: notifText });
      sendToUser(memberId, { type: 'group_created', conversationId: convId });
    }
  }

  sendLine(socket, {
    type: 'group_created',
    conversationId: convId,
    conversation: { id: convId, type: 'group', name: groupName, unreadCount: 0 }
  });
}

function handleAddGroupMember(session, msg) {
  const { socket } = session;
  const conversationId = msg.conversationId;
  const targetId = msg.userId || (msg.username ? getUserByUsername(msg.username)?.id : null);

  const conv = getConversation(conversationId);
  if (!conv || conv.type !== 'group') {
    sendError(socket, 'Invalid group');
    return;
  }

  if (conv.creator_id !== session.userId) {
    sendError(socket, 'Only group creator can add members');
    return;
  }

  if (!targetId || !getUserById(targetId)) {
    sendError(socket, 'User not found');
    return;
  }

  const already = db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, targetId);
  if (!already) {
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)')
      .run(conversationId, targetId, ts());
  }

  bumpMembershipVersion(conversationId);

  broadcastToConversation(conversationId, {
    type: 'member_added',
    conversationId,
    userId: targetId
  });
}

function handleRemoveGroupMember(session, msg) {
  const { socket } = session;
  const conversationId = msg.conversationId;
  const targetId = msg.userId || (msg.username ? getUserByUsername(msg.username)?.id : null);

  const conv = getConversation(conversationId);
  if (!conv || conv.type !== 'group') {
    sendError(socket, 'Invalid group');
    return;
  }

  if (conv.creator_id !== session.userId) {
    sendError(socket, 'Only group creator can remove members');
    return;
  }

  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(conversationId, targetId);
  bumpMembershipVersion(conversationId);

  broadcastToConversation(conversationId, {
    type: 'member_removed',
    conversationId,
    userId: targetId
  });
  sendToUser(targetId, { type: 'group_left', conversationId });
}

function handleLeaveGroup(session, msg) {
  const { socket } = session;
  const conversationId = msg.conversationId;

  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(conversationId, session.userId);
  bumpMembershipVersion(conversationId);

  broadcastToConversation(conversationId, {
    type: 'member_removed',
    conversationId,
    userId: session.userId
  });
  sendLine(socket, { type: 'group_left', conversationId });
}

function handleFetchGroupMembers(session, msg) {
  const { socket } = session;
  const conversationId = msg.conversationId;

  const conv = getConversation(conversationId);
  if (!conv) {
    sendError(socket, 'Group not found');
    return;
  }

  const members = db.prepare(`
    SELECT u.id, u.username, u.is_online
    FROM conversation_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.conversation_id = ?
  `).all(conversationId).map(u => ({
    id: u.id,
    username: u.username,
    isOnline: Boolean(u.is_online),
    isCreator: u.id === conv.creator_id
  }));

  sendLine(socket, { type: 'group_members', conversationId, members });
}

function handleTyping(session, msg) {
  const { conversationId, isTyping } = msg;
  const typingMsg = {
    type: 'typing',
    conversationId,
    userId: session.userId,
    username: session.username,
    isTyping: !!isTyping
  };
  broadcastToConversation(conversationId, typingMsg, session.userId);
}

function handleMarkNotifRead(session, msg) {
  if (msg.notificationId) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND target_user_id = ?').run(msg.notificationId, session.userId);
  }
}

function handleSearchUsers(session, msg) {
  const { socket } = session;
  const query = (msg.query || '').toLowerCase().trim();
  const results = db.prepare('SELECT id, username, is_online FROM users WHERE id != ? AND LOWER(username) LIKE ?')
    .all(session.userId, `%${query}%`)
    .map(u => ({ id: u.id, username: u.username, isOnline: Boolean(u.is_online) }));

  sendLine(socket, { type: 'search_results', users: results });
}

// ==========================================
// Handlers: Recovery Subsystem
// ==========================================
function handleRecover(session, msg) {
  const { socket } = session;
  const { conversationId, planId } = msg;

  if (!conversationId) {
    sendError(socket, 'Missing conversationId');
    return;
  }

  const conv = getConversation(conversationId);
  if (!conv) {
    sendError(socket, 'Conversation not found');
    return;
  }

  if (AUTH_POLICY === 'current_membership' && !isMember(session.userId, conversationId)) {
    sendError(socket, 'Unauthorized');
    return;
  }

  const currentCursor = getCursor(session.userId, conversationId);
  const maxRow = db.prepare('SELECT MAX(seq) as maxSeq FROM messages WHERE conversation_id = ?').get(conversationId);
  const maxSeq = (maxRow && maxRow.maxSeq) ? maxRow.maxSeq : 0;

  const fromSeq = msg.fromSeq !== undefined ? parseInt(msg.fromSeq, 10) : (currentCursor + 1);
  const toSeq = msg.toSeq !== undefined ? parseInt(msg.toSeq, 10) : maxSeq;

  if (fromSeq > toSeq || maxSeq === 0 || fromSeq > maxSeq) {
    sendLine(socket, {
      type: 'recover_complete',
      planId: null,
      conversationId,
      reason: 'nothing_to_recover',
      cursor: currentCursor
    });
    return;
  }

  let plan = null;
  if (planId) {
    plan = db.prepare('SELECT * FROM recovery_plans WHERE id = ?').get(planId);
  }

  if (!plan) {
    const newPlanId = generateId('plan');
    const bs = Math.max(RECOVERY_MIN_BATCH, Math.min(RECOVERY_MAX_BATCH, parseInt(msg.batchSize || RECOVERY_BASE_BATCH, 10)));
    const expiresAt = Date.now() + RECOVERY_PLAN_TTL_MS;

    db.prepare(`
      INSERT INTO recovery_plans (id, user_id, conversation_id, session_generation, start_seq, end_seq, membership_version, state, batch_size, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(newPlanId, session.userId, conversationId, session.sessionGeneration, fromSeq, toSeq, conv.membership_version || 1, bs, ts(), expiresAt);

    plan = db.prepare('SELECT * FROM recovery_plans WHERE id = ?').get(newPlanId);
  }

  const authCheck = authorizePlan(plan, session.userId, conversationId, session.sessionGeneration);
  if (!authCheck.authorized) {
    sendLine(socket, {
      type: 'recover_invalidate',
      planId: plan.id,
      conversationId,
      reason: authCheck.reason
    });
    return;
  }

  const remaining = toSeq - fromSeq + 1;
  const bs = adaptiveBatchSize(plan, remaining);

  const rawMessages = db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ? AND seq >= ? AND seq <= ?
    ORDER BY seq ASC
    LIMIT ?
  `).all(conversationId, fromSeq, toSeq, bs);

  const formattedMessages = rawMessages.map(m => formatMessageForUser(m, session.userId));
  const batchCount = formattedMessages.length;
  const nextSeq = fromSeq + batchCount;
  const hasMore = nextSeq <= toSeq;

  sendLine(socket, {
    type: 'recovery_batch',
    planId: plan.id,
    conversationId,
    membershipVersion: plan.membership_version,
    messages: formattedMessages,
    hasMore,
    nextSeq,
    batchSize: bs
  });
}

function handleRecoverAck(session, msg) {
  const { socket } = session;
  const { planId, conversationId, ackedSeq, missingRanges } = msg;

  const plan = db.prepare('SELECT * FROM recovery_plans WHERE id = ?').get(planId);
  const authCheck = authorizePlan(plan, session.userId, conversationId, session.sessionGeneration);

  if (!authCheck.authorized) {
    sendLine(socket, {
      type: 'recover_invalidate',
      planId,
      conversationId,
      reason: authCheck.reason
    });
    return;
  }

  if (ackedSeq !== undefined && ackedSeq !== null) {
    const cur = getCursor(session.userId, conversationId);
    if (ackedSeq > cur) {
      setCursor(session.userId, conversationId, ackedSeq);
      clearMissingUpTo(session.userId, conversationId, ackedSeq);
    }
  }

  if (Array.isArray(missingRanges)) {
    for (const range of missingRanges) {
      addMissingRange(session.userId, conversationId, range.startSeq, range.endSeq);
    }
  }

  const updatedCursor = getCursor(session.userId, conversationId);
  sendLine(socket, {
    type: 'recover_ack_ok',
    planId,
    conversationId,
    cursor: updatedCursor
  });
}

function handleRecoverComplete(session, msg) {
  const { socket } = session;
  const { planId, conversationId } = msg;

  if (planId) {
    db.prepare("UPDATE recovery_plans SET state = 'completed' WHERE id = ?").run(planId);
  }

  const cur = getCursor(session.userId, conversationId);
  sendLine(socket, {
    type: 'recover_complete',
    planId,
    conversationId,
    cursor: cur
  });
}

function handleGetCursor(session, msg) {
  const { socket } = session;
  const { conversationId } = msg;
  const cur = getCursor(session.userId, conversationId);
  sendLine(socket, { type: 'cursor', conversationId, cursor: cur });
}

// ==========================================
// Handlers: Live Collaborative Fill-in Messages (LCFM)
// ==========================================
function handleCreateFillableMessage(session, msg) {
  const { socket } = session;
  const {
    conversationId,
    introText,
    templateSegments,
    fields,
    finalizationSettings
  } = msg;

  if (!conversationId) {
    sendError(socket, 'Missing conversationId');
    return;
  }

  if (!isMember(session.userId, conversationId)) {
    sendError(socket, 'Unauthorized conversation access');
    return;
  }

  const fieldList = Array.isArray(fields) ? fields : [];

  const messageId = generateId('msg_fillin');
  const seq = allocateSeq(conversationId);
  const now = ts();

  const settings = finalizationSettings || {};
  const requireAllMandatory = settings.requireAllMandatory !== false ? 1 : 0;
  const deadline = settings.deadline ? parseInt(settings.deadline, 10) : null;
  const finalizePermission = settings.finalizePermission || 'creator_only';
  const lockOnCompletion = settings.lockOnCompletion !== false ? 1 : 0;
  const allowReopen = settings.allowReopen !== false ? 1 : 0;

  // Insert primary timeline message
  db.prepare(`
    INSERT INTO messages (id, conversation_id, from_user_id, text, timestamp, seq, kind)
    VALUES (?, ?, ?, ?, ?, ?, 'collaborative_fillin')
  `).run(messageId, conversationId, session.userId, introText || 'Live Collaborative Fill-in Message', now, seq);

  // Insert collaborative message metadata
  db.prepare(`
    INSERT INTO collaborative_messages (
      message_id, conversation_id, creator_id, intro_text, template_segments, status,
      require_all_mandatory, deadline, finalize_permission, lock_on_completion, allow_reopen,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId, conversationId, session.userId, introText || '',
    JSON.stringify(templateSegments || []),
    requireAllMandatory, deadline, finalizePermission, lockOnCompletion, allowReopen,
    now, now
  );

  // Insert fields, values, permissions
  fieldList.forEach((f, idx) => {
    const fieldId = f.fieldId || generateId('fld');
    const fieldOrder = idx;
    const label = (f.label || `Field ${idx + 1}`).trim();
    const fieldType = f.fieldType || 'text';
    const placeholder = f.placeholder || '';
    const required = f.required !== false ? 1 : 0;
    const validationRules = JSON.stringify(f.validationRules || {});
    const assignmentMode = f.assignmentMode || 'custom';

    db.prepare(`
      INSERT INTO collaborative_message_fields (
        id, message_id, field_order, label, field_type, placeholder, required,
        validation_rules, assignment_mode, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fieldId, messageId, fieldOrder, label, fieldType, placeholder, required, validationRules, assignmentMode, now);

    // Initial empty value row
    db.prepare(`
      INSERT INTO collaborative_field_values (field_id, message_id, current_value, version, updated_by, updated_at, is_complete)
      VALUES (?, ?, NULL, 0, NULL, ?, 0)
    `).run(fieldId, messageId, now);

    // Insert permissions
    const assignedIds = Array.isArray(f.assignedUserIds) ? f.assignedUserIds : [];
    for (const uid of assignedIds) {
      if (!uid) continue;
      db.prepare(`
        INSERT INTO collaborative_field_permissions (id, message_id, field_id, user_id, permission_type, created_at)
        VALUES (?, ?, ?, ?, 'edit', ?)
      `).run(generateId('perm'), messageId, fieldId, uid, now);
    }
  });

  // Broadcast to all conversation members (with user-specific edit flags)
  const memberRows = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
  const targetUserIds = conversationId === 'public_general'
    ? Array.from(activeConnections.values()).filter(s => s.isAuthenticated).map(s => s.userId)
    : memberRows.map(m => m.user_id);

  const basePayload = getFillablePayload(messageId, null);
  for (const uid of targetUserIds) {
    const payload = getFillablePayloadForUser(basePayload, uid);
    const msgEvent = {
      type: 'message',
      id: messageId,
      conversationId,
      fromUserId: session.userId,
      senderId: session.userId,
      text: introText || 'Live Collaborative Fill-in Message',
      content: introText || 'Live Collaborative Fill-in Message',
      timestamp: now,
      createdAt: now,
      seq,
      kind: 'collaborative_fillin',
      fillable: payload
    };

    sendToUser(uid, {
      type: 'fillable_message_created',
      messageId,
      conversationId,
      message: msgEvent
    });

    sendToUser(uid, msgEvent);
  }
}

function handleUpdateFillableField(session, msg) {
  const { socket } = session;
  const {
    messageId,
    fieldId,
    value,
    expectedFieldVersion,
    clientMutationId
  } = msg;

  if (!messageId || !fieldId) {
    sendError(socket, 'Missing messageId or fieldId');
    return;
  }

  // 1. Message existence & type check
  const msgRow = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msgRow || msgRow.kind !== 'collaborative_fillin') {
    sendLine(socket, { type: 'fillable_message_error', messageId, fieldId, error: 'Message not found' });
    return;
  }

  const collabMsg = db.prepare('SELECT * FROM collaborative_messages WHERE message_id = ?').get(messageId);
  if (!collabMsg) {
    sendLine(socket, { type: 'fillable_message_error', messageId, fieldId, error: 'Fillable message data not found' });
    return;
  }

  // 2. Active conversation membership check
  if (!isMember(session.userId, collabMsg.conversation_id)) {
    sendLine(socket, { type: 'fillable_message_error', messageId, fieldId, error: 'You are not a member of this conversation' });
    return;
  }

  // 3. Status check (open / ready)
  if (collabMsg.status === 'finalized' || collabMsg.status === 'cancelled' || collabMsg.status === 'expired') {
    sendLine(socket, {
      type: 'fillable_message_error',
      messageId,
      fieldId,
      error: `Message is ${collabMsg.status} and cannot be modified`
    });
    return;
  }

  // 4. Deadline check
  if (collabMsg.deadline && ts() > collabMsg.deadline) {
    db.prepare("UPDATE collaborative_messages SET status = 'expired', updated_at = ? WHERE message_id = ?")
      .run(ts(), messageId);
    sendLine(socket, {
      type: 'fillable_message_error',
      messageId,
      fieldId,
      error: 'Message deadline has expired'
    });
    broadcastToConversation(collabMsg.conversation_id, {
      type: 'fillable_message_expired',
      messageId,
      conversationId: collabMsg.conversation_id
    });
    return;
  }

  // 5. Field existence
  const fieldDef = db.prepare('SELECT * FROM collaborative_message_fields WHERE id = ? AND message_id = ?').get(fieldId, messageId);
  if (!fieldDef) {
    console.error(`[Server] Field not found: ${fieldId} in ${messageId}`);
    sendLine(socket, { type: 'fillable_message_error', messageId, fieldId, error: 'Field not found' });
    return;
  }

  // 6. User permission check
  let isAuthorized = false;
  if (fieldDef.assignment_mode === 'all') {
    isAuthorized = true;
  } else if (fieldDef.assignment_mode === 'creator') {
    isAuthorized = (session.userId === collabMsg.creator_id);
  } else if (fieldDef.assignment_mode === 'custom') {
    const hasPerm = db.prepare('SELECT 1 FROM collaborative_field_permissions WHERE field_id = ? AND user_id = ? AND message_id = ?').get(fieldId, session.userId, messageId);
    isAuthorized = !!hasPerm;
  }

  if (!isAuthorized) {
    console.error(`[Server] Unauthorized: user ${session.userId} for field ${fieldId}`);
    sendLine(socket, {
      type: 'fillable_message_error',
      messageId,
      fieldId,
      error: 'You do not have permission to edit this field'
    });
    return;
  }

  // 7. Idempotency check with clientMutationId
  if (clientMutationId) {
    const existingRev = db.prepare('SELECT * FROM collaborative_message_revisions WHERE field_id = ? AND editor_user_id = ? AND client_mutation_id = ? AND message_id = ?')
      .get(fieldId, session.userId, clientMutationId, messageId);
    if (existingRev) {
      // Idempotent duplicate return
      const currentPayload = getFillablePayload(messageId, session.userId);
      sendLine(socket, {
        type: 'fillable_message_updated',
        messageId,
        conversationId: collabMsg.conversation_id,
        fieldId,
        idempotent: true,
        fillable: currentPayload
      });
      return;
    }
  }

  // 8. Optimistic Concurrency Control (Version check)
  const currentValRow = db.prepare('SELECT * FROM collaborative_field_values WHERE field_id = ? AND message_id = ?').get(fieldId, messageId);
  const currentVersion = currentValRow ? currentValRow.version : 0;

  if (expectedFieldVersion !== undefined && expectedFieldVersion !== currentVersion) {
    let parsedCurVal = null;
    if (currentValRow && currentValRow.current_value !== null) {
      try { parsedCurVal = JSON.parse(currentValRow.current_value); } catch (e) { parsedCurVal = currentValRow.current_value; }
    }
    const lastEdUser = currentValRow && currentValRow.updated_by ? getUserById(currentValRow.updated_by) : null;

    sendLine(socket, {
      type: 'fillable_field_conflict',
      messageId,
      fieldId,
      expectedVersion: expectedFieldVersion,
      currentVersion,
      currentValue: parsedCurVal,
      currentEditor: lastEdUser ? lastEdUser.username : null,
      message: 'Field was modified by another contributor. Your view has been refreshed.'
    });
    return;
  }

  // 9. Value Validation
  let rules = {};
  try { rules = JSON.parse(fieldDef.validation_rules || '{}'); } catch (e) {}

  const validation = validateFieldValue(fieldDef.field_type, rules, value);
  if (!validation.valid) {
    sendLine(socket, {
      type: 'fillable_message_error',
      messageId,
      fieldId,
      error: validation.error || 'Invalid field value'
    });
    return;
  }

  // 10. Persist mutation atomically
  const now = ts();
  const newVersion = currentVersion + 1;
  const serializedVal = validation.sanitizedValue !== null ? JSON.stringify(validation.sanitizedValue) : null;
  const isComplete = validation.isComplete ? 1 : 0;
  const prevVal = currentValRow ? currentValRow.current_value : null;

  db.prepare(`
    UPDATE collaborative_field_values
    SET current_value = ?, version = ?, updated_by = ?, updated_at = ?, is_complete = ?
    WHERE field_id = ? AND message_id = ?
  `).run(serializedVal, newVersion, session.userId, now, isComplete, fieldId, messageId);

  // Insert audit record
  const revId = generateId('rev');
  db.prepare(`
    INSERT INTO collaborative_message_revisions (
      id, message_id, field_id, editor_user_id, previous_value, new_value, revision_number, client_mutation_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(revId, messageId, fieldId, session.userId, prevVal, serializedVal, newVersion, clientMutationId || null, now);

  // Recalculate message status
  const allFieldValues = db.prepare(`
    SELECT f.required, v.is_complete
    FROM collaborative_message_fields f
    LEFT JOIN collaborative_field_values v ON f.id = v.field_id
    WHERE f.message_id = ?
  `).all(messageId);

  const totalMandatory = allFieldValues.filter(f => f.required).length;
  const completedMandatory = allFieldValues.filter(f => f.required && f.is_complete).length;
  const allMandatoryDone = totalMandatory > 0 ? (completedMandatory >= totalMandatory) : true;

  let newStatus = collabMsg.status;
  if (collabMsg.status === 'open' && allMandatoryDone) {
    newStatus = 'ready';
  } else if (collabMsg.status === 'ready' && !allMandatoryDone) {
    newStatus = 'open';
  }

  db.prepare('UPDATE collaborative_messages SET status = ?, updated_at = ? WHERE message_id = ?')
    .run(newStatus, now, messageId);

  // Broadcast updated field to all conversation participants
  const memberRows = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(collabMsg.conversation_id);
  const targetUserIds = collabMsg.conversation_id === 'public_general'
    ? Array.from(activeConnections.values()).filter(s => s.isAuthenticated).map(s => s.userId)
    : memberRows.map(m => m.user_id);

  const basePayload = getFillablePayload(messageId, null);
  for (const uid of targetUserIds) {
    const fullPayload = getFillablePayloadForUser(basePayload, uid);
    sendToUser(uid, {
      type: 'fillable_message_updated',
      messageId,
      conversationId: collabMsg.conversation_id,
      fieldId,
      status: newStatus,
      updatedAt: now,
      mutationId: clientMutationId || null,
      fillable: fullPayload,
      revision: {
        id: revId,
        fieldId,
        fieldLabel: fieldDef.label,
        editorId: session.userId,
        editorUsername: session.username,
        previousValue: prevVal ? JSON.parse(prevVal) : null,
        newValue: validation.sanitizedValue,
        revisionNumber: newVersion,
        timestamp: now
      }
    });
  }
}

function handleFetchFillableMessage(session, msg) {
  const { socket } = session;
  const { messageId } = msg;

  const collabMsg = db.prepare('SELECT * FROM collaborative_messages WHERE message_id = ?').get(messageId);
  if (!collabMsg) {
    sendError(socket, 'Fillable message not found');
    return;
  }

  if (!isMember(session.userId, collabMsg.conversation_id)) {
    sendError(socket, 'Unauthorized conversation access');
    return;
  }

  const payload = getFillablePayload(messageId, session.userId);
  sendLine(socket, {
    type: 'fillable_message',
    messageId,
    fillable: payload
  });
}

function handleFinalizeFillableMessage(session, msg) {
  const { socket } = session;
  const { messageId } = msg;

  const collabMsg = db.prepare('SELECT * FROM collaborative_messages WHERE message_id = ?').get(messageId);
  if (!collabMsg) {
    sendError(socket, 'Fillable message not found');
    return;
  }

  if (!isMember(session.userId, collabMsg.conversation_id)) {
    sendError(socket, 'Unauthorized conversation access');
    return;
  }

  // Permission check
  if (collabMsg.finalize_permission === 'creator_only' && session.userId !== collabMsg.creator_id) {
    sendError(socket, 'Only the message creator can finalize this message');
    return;
  }

  // Mandatory fields check
  if (collabMsg.require_all_mandatory) {
    const payload = getFillablePayload(messageId, session.userId);
    if (!payload.progress.isReady) {
      sendError(socket, 'Cannot finalize: required fields remain incomplete');
      return;
    }
  }

  const now = ts();
  db.prepare(`
    UPDATE collaborative_messages
    SET status = 'finalized', finalized_at = ?, finalized_by = ?, updated_at = ?
    WHERE message_id = ?
  `).run(now, session.userId, now, messageId);

  const memberRows = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(collabMsg.conversation_id);
  const targetUserIds = collabMsg.conversation_id === 'public_general'
    ? Array.from(activeConnections.values()).filter(s => s.isAuthenticated).map(s => s.userId)
    : memberRows.map(m => m.user_id);

  const basePayload = getFillablePayload(messageId, null);
  for (const uid of targetUserIds) {
    const fullPayload = getFillablePayloadForUser(basePayload, uid);
    sendToUser(uid, {
      type: 'fillable_message_finalized',
      messageId,
      conversationId: collabMsg.conversation_id,
      finalizedAt: now,
      finalizedBy: session.userId,
      finalizedByUsername: session.username,
      fillable: fullPayload
    });
  }
}

function handleReopenFillableMessage(session, msg) {
  const { socket } = session;
  const { messageId } = msg;

  const collabMsg = db.prepare('SELECT * FROM collaborative_messages WHERE message_id = ?').get(messageId);
  if (!collabMsg) {
    sendError(socket, 'Fillable message not found');
    return;
  }

  if (session.userId !== collabMsg.creator_id) {
    sendError(socket, 'Only the message creator can reopen this message');
    return;
  }

  if (!collabMsg.allow_reopen) {
    sendError(socket, 'Reopening is disabled for this message');
    return;
  }

  const now = ts();
  const payload = getFillablePayload(messageId, session.userId);
  const newStatus = payload.progress.isReady ? 'ready' : 'open';

  db.prepare(`
    UPDATE collaborative_messages
    SET status = ?, finalized_at = NULL, finalized_by = NULL, updated_at = ?
    WHERE message_id = ?
  `).run(newStatus, now, messageId);

  const memberRows = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(collabMsg.conversation_id);
  const targetUserIds = collabMsg.conversation_id === 'public_general'
    ? Array.from(activeConnections.values()).filter(s => s.isAuthenticated).map(s => s.userId)
    : memberRows.map(m => m.user_id);

  const basePayload = getFillablePayload(messageId, null);
  for (const uid of targetUserIds) {
    const fullPayload = getFillablePayloadForUser(basePayload, uid);
    sendToUser(uid, {
      type: 'fillable_message_reopened',
      messageId,
      conversationId: collabMsg.conversation_id,
      status: newStatus,
      fillable: fullPayload
    });
  }
}

function handleCancelFillableMessage(session, msg) {
  const { socket } = session;
  const { messageId } = msg;

  const collabMsg = db.prepare('SELECT * FROM collaborative_messages WHERE message_id = ?').get(messageId);
  if (!collabMsg) {
    sendError(socket, 'Fillable message not found');
    return;
  }

  if (session.userId !== collabMsg.creator_id) {
    sendError(socket, 'Only the creator can cancel this message');
    return;
  }

  const now = ts();
  db.prepare("UPDATE collaborative_messages SET status = 'cancelled', updated_at = ? WHERE message_id = ?")
    .run(now, messageId);

  broadcastToConversation(collabMsg.conversation_id, {
    type: 'fillable_message_cancelled',
    messageId,
    conversationId: collabMsg.conversation_id
  });
}

function handleUpdateFillablePermissions(session, msg) {
  const { socket } = session;
  const { messageId, fieldId, assignmentMode, assignedUserIds } = msg;

  const collabMsg = db.prepare('SELECT * FROM collaborative_messages WHERE message_id = ?').get(messageId);
  if (!collabMsg) {
    sendError(socket, 'Fillable message not found');
    return;
  }

  if (session.userId !== collabMsg.creator_id) {
    sendError(socket, 'Only the creator can alter field permissions');
    return;
  }

  const now = ts();
  if (assignmentMode) {
    db.prepare('UPDATE collaborative_message_fields SET assignment_mode = ? WHERE id = ? AND message_id = ?')
      .run(assignmentMode, fieldId, messageId);
  }

  if (Array.isArray(assignedUserIds)) {
    db.prepare('DELETE FROM collaborative_field_permissions WHERE field_id = ? AND message_id = ?').run(fieldId, messageId);
    for (const uid of assignedUserIds) {
      if (uid) {
        db.prepare(`INSERT INTO collaborative_field_permissions (id, message_id, field_id, user_id, permission_type, created_at) VALUES (?, ?, ?, ?, 'edit', ?)` )
          .run(generateId('perm'), messageId, fieldId, uid, now);
      }
    }
  }

  const memberRows = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(collabMsg.conversation_id);
  const targetUserIds = collabMsg.conversation_id === 'public_general'
    ? Array.from(activeConnections.values()).filter(s => s.isAuthenticated).map(s => s.userId)
    : memberRows.map(m => m.user_id);

  const basePayload = getFillablePayload(messageId, null);
  for (const uid of targetUserIds) {
    const fullPayload = getFillablePayloadForUser(basePayload, uid);
    sendToUser(uid, {
      type: 'fillable_message_permission_updated',
      messageId,
      conversationId: collabMsg.conversation_id,
      fieldId,
      assignmentMode,
      assignedUserIds,
      fillable: fullPayload
    });
  }
}

function handleFetchFillableHistory(session, msg) {
  const { socket } = session;
  const { messageId } = msg;

  const collabMsg = db.prepare('SELECT * FROM collaborative_messages WHERE message_id = ?').get(messageId);
  if (!collabMsg) {
    sendError(socket, 'Fillable message not found');
    return;
  }

  if (!isMember(session.userId, collabMsg.conversation_id)) {
    sendError(socket, 'Unauthorized conversation access');
    return;
  }

  const revRows = db.prepare(`
    SELECT r.*, f.label as field_label, u.username as editor_username
    FROM collaborative_message_revisions r
    LEFT JOIN collaborative_message_fields f ON r.field_id = f.id
    LEFT JOIN users u ON r.editor_user_id = u.id
    WHERE r.message_id = ?
    ORDER BY r.created_at ASC, r.revision_number ASC
  `).all(messageId);

  const revisions = revRows.map(r => {
    let prevVal = null;
    let nextVal = null;
    try { prevVal = r.previous_value ? JSON.parse(r.previous_value) : null; } catch (e) { prevVal = r.previous_value; }
    try { nextVal = r.new_value ? JSON.parse(r.new_value) : null; } catch (e) { nextVal = r.new_value; }

    return {
      id: r.id,
      messageId: r.message_id,
      fieldId: r.field_id,
      fieldLabel: r.field_label || 'Field',
      editorId: r.editor_user_id,
      editorUsername: r.editor_username || 'Unknown',
      previousValue: prevVal,
      newValue: nextVal,
      revisionNumber: r.revision_number,
      clientMutationId: r.client_mutation_id,
      timestamp: r.created_at
    };
  });

  sendLine(socket, {
    type: 'fillable_history',
    messageId,
    revisions
  });
}

function handleAppendFillableDetail(session, msg) {
  const { socket } = session;
  const { messageId, label, value, clientMutationId } = msg;

  if (!messageId) {
    sendError(socket, 'Missing messageId');
    return;
  }

  const collabMsg = db.prepare('SELECT * FROM collaborative_messages WHERE message_id = ?').get(messageId);
  if (!collabMsg) {
    sendError(socket, 'Collaborative message not found');
    return;
  }

  if (!isMember(session.userId, collabMsg.conversation_id)) {
    sendError(socket, 'Unauthorized conversation access');
    return;
  }

  if (collabMsg.status === 'finalized' || collabMsg.status === 'cancelled' || collabMsg.status === 'expired') {
    sendLine(socket, { type: 'fillable_message_error', messageId, error: `Message is ${collabMsg.status}` });
    return;
  }

  if (collabMsg.deadline && ts() > collabMsg.deadline) {
    sendLine(socket, { type: 'fillable_message_error', messageId, error: 'Message has expired' });
    return;
  }

  const cleanVal = (value !== undefined && value !== null) ? String(value).trim() : '';
  if (!cleanVal) {
    sendError(socket, 'Detail value cannot be empty');
    return;
  }

  // Idempotency check
  if (clientMutationId) {
    const existingRev = db.prepare('SELECT * FROM collaborative_message_revisions WHERE client_mutation_id = ?').get(clientMutationId);
    if (existingRev) {
      const currentPayload = getFillablePayload(messageId, session.userId);
      sendLine(socket, {
        type: 'fillable_message_updated',
        messageId,
        conversationId: collabMsg.conversation_id,
        idempotent: true,
        fillable: currentPayload
      });
      return;
    }
  }

  const now = ts();
  const fieldId = generateId('fld_dyn');
  const maxOrderRow = db.prepare('SELECT MAX(field_order) as maxOrder FROM collaborative_message_fields WHERE message_id = ?').get(messageId);
  const nextOrder = (maxOrderRow && maxOrderRow.maxOrder !== null && maxOrderRow.maxOrder !== undefined) ? (maxOrderRow.maxOrder + 1) : 0;
  const fieldLabel = (label && label.trim()) || 'Detail';

  // Insert field definition
  db.prepare(`
    INSERT INTO collaborative_message_fields (
      id, message_id, field_order, label, field_type, placeholder, required,
      validation_rules, assignment_mode, created_at
    ) VALUES (?, ?, ?, ?, 'text', '', 0, '{}', 'all', ?)
  `).run(fieldId, messageId, nextOrder, fieldLabel, now);

  // Insert value
  db.prepare(`
    INSERT INTO collaborative_field_values (field_id, message_id, current_value, version, updated_by, updated_at, is_complete)
    VALUES (?, ?, ?, 1, ?, ?, 1)
  `).run(fieldId, messageId, JSON.stringify(cleanVal), session.userId, now);

  // Authorize the editor and creator
  db.prepare(`
    INSERT INTO collaborative_field_permissions (id, message_id, field_id, user_id, permission_type, created_at)
    VALUES (?, ?, ?, ?, 'edit', ?)
  `).run(generateId('perm'), messageId, fieldId, session.userId, now);

  if (session.userId !== collabMsg.creator_id) {
    db.prepare(`
      INSERT INTO collaborative_field_permissions (id, message_id, field_id, user_id, permission_type, created_at)
      VALUES (?, ?, ?, ?, 'edit', ?)
    `).run(generateId('perm'), messageId, fieldId, collabMsg.creator_id, now);
  }

  // Record audit revision
  const revId = generateId('rev');
  db.prepare(`
    INSERT INTO collaborative_message_revisions (
      id, message_id, field_id, editor_user_id, previous_value, new_value, revision_number, client_mutation_id, created_at
    ) VALUES (?, ?, ?, ?, NULL, ?, 1, ?, ?)
  `).run(revId, messageId, fieldId, session.userId, JSON.stringify(cleanVal), clientMutationId || null, now);

  db.prepare('UPDATE collaborative_messages SET updated_at = ? WHERE message_id = ?').run(now, messageId);

  // Broadcast to all conversation members
  const memberRows = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(collabMsg.conversation_id);
  const targetUserIds = collabMsg.conversation_id === 'public_general'
    ? Array.from(activeConnections.values()).filter(s => s.isAuthenticated).map(s => s.userId)
    : memberRows.map(m => m.user_id);

  const basePayload = getFillablePayload(messageId, null);
  for (const uid of targetUserIds) {
    const fullPayload = getFillablePayloadForUser(basePayload, uid);
    sendToUser(uid, {
      type: 'fillable_message_updated',
      messageId,
      conversationId: collabMsg.conversation_id,
      fieldId,
      status: collabMsg.status,
      updatedAt: now,
      mutationId: clientMutationId || null,
      fillable: fullPayload
    });
  }
}

function handleDeleteFillableDetail(session, msg) {
  const { socket } = session;
  const { messageId, fieldId } = msg;

  if (!messageId || !fieldId) {
    sendError(socket, 'Missing messageId or fieldId');
    return;
  }

  const collabMsg = db.prepare('SELECT * FROM collaborative_messages WHERE message_id = ?').get(messageId);
  if (!collabMsg) {
    sendError(socket, 'Collaborative message not found');
    return;
  }

  const valRow = db.prepare('SELECT * FROM collaborative_field_values WHERE field_id = ? AND message_id = ?').get(fieldId, messageId);
  if (!valRow) {
    sendError(socket, 'Field not found');
    return;
  }

  const isCreator = (session.userId === collabMsg.creator_id);
  const isAuthor = (valRow.updated_by === session.userId);
  if (!isCreator && !isAuthor) {
    sendError(socket, 'Unauthorized to delete this detail');
    return;
  }

  db.prepare('DELETE FROM collaborative_field_values WHERE field_id = ? AND message_id = ?').run(fieldId, messageId);
  db.prepare('DELETE FROM collaborative_field_permissions WHERE field_id = ? AND message_id = ?').run(fieldId, messageId);
  db.prepare('DELETE FROM collaborative_message_fields WHERE id = ? AND message_id = ?').run(fieldId, messageId);

  const now = ts();
  db.prepare('UPDATE collaborative_messages SET updated_at = ? WHERE message_id = ?').run(now, messageId);

  const memberRows = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(collabMsg.conversation_id);
  const targetUserIds = collabMsg.conversation_id === 'public_general'
    ? Array.from(activeConnections.values()).filter(s => s.isAuthenticated).map(s => s.userId)
    : memberRows.map(m => m.user_id);

  const basePayload = getFillablePayload(messageId, null);
  for (const uid of targetUserIds) {
    const fullPayload = getFillablePayloadForUser(basePayload, uid);
    sendToUser(uid, {
      type: 'fillable_message_updated',
      messageId,
      conversationId: collabMsg.conversation_id,
      status: collabMsg.status,
      updatedAt: now,
      fillable: fullPayload
    });
  }
}

// ==========================================
// Server Startup
// ==========================================
async function startServer() {
  try {
    db = await openDatabase(DB_PATH);
    initSchema();

    server.listen(PORT, '127.0.0.1', () => {
      console.log('Server listening on port ' + PORT);
      console.log('========================================================');
      console.log('  Socket Chat Server (Enhanced Node.js + SQLite backend)');
      console.log('========================================================');
      console.log(`  Port        : ${PORT}`);
      console.log(`  Database    : ${DB_PATH}`);
      console.log(`  Auth Policy : ${AUTH_POLICY}`);
      console.log(`  LCFM Engine : Active (Live Collaborative Fill-in Messages)`);
      console.log(`  Recovery    : Active (Membership-Bound Adaptive Engine)`);
      console.log('========================================================');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Server] ERROR: Port ${PORT} is already in use. Stop existing server and retry.`);
      } else {
        console.error('[Server] ERROR:', err.message);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  }
}

startServer();
