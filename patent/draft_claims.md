# Draft Claims

## Independent claim 1 (method)
A computer-implemented method for recovering missed messages in a multi-transport messaging system, comprising:
1. maintaining, for each (user, conversation) pair, a contiguous recovery cursor and a set of missing ranges;
2. on a recovery request from a user session, issuing an opaque recovery plan bound to the user, the conversation, the session generation, a sequence range, the conversation's current membership version, an expiry time, and an adaptive batch size;
3. on each recovery batch and each acknowledgement, re-authorizing the plan against the conversation's current membership version and the requesting session's generation, and invalidating the plan upon mismatch;
4. replaying messages in batches whose size is determined by a deterministic function of the remaining sequence range;
5. advancing the contiguous cursor idempotently upon acknowledgement and merging/clearing missing ranges;
6. rejecting recovery for users who are not current members under a configurable policy.

## Independent claim 2 (system)
A messaging system comprising a server with a recovery subsystem implementing the method of claim 1, a bridge relaying between TCP and WebSocket transports using an identical recovery protocol, and a client tracking a recovery cursor and missing ranges.

## Dependent claims
3. The method of claim 1, wherein the opaque recovery plan is identified by a server-generated identifier not interpretable by the client.
4. The method of claim 1, wherein membership version is incremented on any add/remove member event in the conversation.
5. The method of claim 1, wherein invalidation on membership-version mismatch notifies the client with a `recover_invalidate` message including a reason.
6. The method of claim 1, wherein adaptive batch size increases by a fixed increment when the remaining range exceeds a threshold and decreases when the remaining range is below a threshold, clamped to configured min/max.
7. The method of claim 1, wherein acknowledgements are idempotent: re-acknowledging an already-advanced cursor does not regress the cursor.
8. The method of claim 1, wherein missing ranges reported by the client are merged (overlapping/adjacent ranges coalesced) and ranges fully at or below the cursor are cleared.
9. The method of claim 1, further comprising a `historical_allowed` policy permitting recovery by users who are no longer current members.
10. The method of claim 1, wherein recovery plans expire after a configured TTL and expired plans are rejected with an `expired` reason.
11. The method of claim 1, wherein per-conversation sequence numbers are allocated monotonically and messages are deduplicated by (conversation, sequence).
12. The method of claim 2, wherein the bridge preserves JSON-line framing and message boundaries across transports.

## Notes
- Claims are draft; to be reviewed by patent counsel.
- Prior art differentiation: see prior_art_search.md.
