# Protocol Changes

## Existing (preserved)
- `auth { username }` → `auth_ok { userId, username, sessionGeneration }`
- `message { conversationId, content }` → broadcast `message { id, conversationId, senderId, sender, seq, content, createdAt }`
- `history { conversationId, afterSeq?, limit? }` → `history { conversationId, messages, cursor }`
- `create_group`, `add_member`, `remove_member`, `list_conversations`, `list_users`

## New recovery messages

### Client → Server
- `recover { conversationId, fromSeq?, toSeq?, planId?, batchSize? }`
  - fromSeq defaults to cursor+1; toSeq defaults to current max seq.
- `recover_ack { planId, conversationId, ackedSeq, missingRanges? }`
  - missingRanges: `[{ startSeq, endSeq }]` (client-reported gaps).
- `recover_complete { planId, conversationId }`
- `get_cursor { conversationId }`

### Server → Client
- `recovery_batch { planId, conversationId, membershipVersion, messages, hasMore, nextSeq, batchSize }`
- `recover_ack_ok { planId, conversationId, cursor }`
- `recover_complete { planId, conversationId, cursor }` (or `{ planId: null, conversationId, reason: 'nothing_to_recover' }`)
- `recover_invalidate { planId, conversationId, reason }` — reasons: `membership_changed`, `expired`, etc.
- `cursor { conversationId, cursor }`
- `membership_changed { conversationId, membershipVersion }`

## Semantics
- `seq` is per-conversation monotonic; clients dedup by (conversationId, seq).
- `planId` is opaque; clients must not parse or fabricate.
- Recovery plans expire after RECOVERY_PLAN_TTL_MS (default 60s); expired plans return `expired`.
- A plan is invalidated when the conversation's membership_version changes (under current_membership policy) or the session generation changes.
- `missingRanges` are merged server-side; ranges fully ≤ cursor are cleared.

## Backward compatibility
- Clients that do not send `recover` are unaffected; history-based recovery still works.
- New message types are additive; unknown types yield `{ type: 'error', message: 'unknown type ...' }`.
- Dashboard and bridge updated to pass through new types transparently.
