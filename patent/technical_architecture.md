# Technical Architecture

## System overview
Three tiers:
- **Backend** (Node.js, TCP, JSON lines): auth, conversations, membership, messaging, persistence (sql.js SQLite), recovery subsystem.
- **Bridge** (Node.js, WebSocket ↔ TCP): transparent relay; preserves JSON-line framing.
- **Dashboard** (React + TypeScript): chat UI + RecoveryPanel.

## Data model
- `users(id, username)`
- `conversations(id, type, title, created_by, created_at, membership_version)`
- `conversation_members(conversation_id, user_id, added_at, removed_at)`
- `messages(id, conversation_id, sender_id, seq, content, created_at)` with UNIQUE(conversation_id, seq)
- `recovery_cursors(user_id, conversation_id, contiguous_seq, updated_at)`
- `recovery_missing(user_id, conversation_id, start_seq, end_seq)`
- `recovery_plans(id, user_id, conversation_id, session_generation, start_seq, end_seq, membership_version, state, batch_size, created_at, expires_at)`
- `sessions(user_id, generation, created_at)`

## Sequencing
- Per-conversation monotonic `seq` allocated as `MAX(seq)+1` within a synchronous handler (Node single-threaded), guaranteeing no gaps from concurrent allocation within a process.

## Membership versioning
- `conversations.membership_version` starts at 1; increments on add/remove member.
- Membership changes broadcast `membership_changed` to participants.

## Recovery flow
1. Client sends `recover { conversationId, fromSeq?, toSeq?, planId?, batchSize? }`.
2. Server resolves range against current max seq; creates or reuses an opaque plan (if planId valid and authorized).
3. Server authorizes plan (user, conv, session gen, state, expiry, membership version, membership).
4. Server fetches adaptive batch `[fromSeq, fromSeq+bs-1]`, returns `recovery_batch`.
5. Client processes messages (dedup by (conversationId, seq)), sends `recover_ack { planId, ackedSeq, missingRanges? }`.
6. Server updates cursor (contiguous, max), merges missing ranges, clears missing up to cursor, re-authorizes.
7. Client sends `recover_complete` when done; server marks plan completed.

## Authorization policy
- `AUTH_POLICY=current_membership` (default): plan invalidated when membership version changes; removed users cannot recover.
- `AUTH_POLICY=historical_allowed`: plans survive membership changes (for archival/audit scenarios).

## Adaptive batching
`adaptiveBatchSize(plan, remaining)`:
- base = RECOVERY_BASE_BATCH (default 25)
- if remaining < 50: bs = min(bs, remaining)
- if remaining > 200: bs = min(RECOVERY_MAX_BATCH, bs + 25)
- clamp to [RECOVERY_MIN_BATCH, RECOVERY_MAX_BATCH]

## Transport uniformity
The bridge relays JSON lines verbatim; recovery protocol is identical over TCP and WebSocket.

## Persistence
sql.js (SQLite compiled to JS) persisted to disk on each mutation (saveDb). DB path configurable via DB_PATH.
