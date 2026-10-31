# Invention Disclosure

## Title
Membership-Bound Adaptive Message Recovery for Multi-Transport Messaging Systems

## Field
Real-time messaging, multi-transport (TCP + WebSocket) chat systems, reliable delivery and recovery, access control.

## Problem
In multi-transport chat systems, clients disconnect and reconnect frequently (mobile networks, browser tab suspension, transport switching). Missed messages must be recovered without:
- leaking messages from conversations the user no longer belongs to,
- replaying duplicates,
- overwhelming the client/server with fixed-size bursts,
- allowing a stale session to recover data after membership revocation.

Existing recovery (cursor + replay) typically authorizes once at plan creation and uses fixed batch sizes, leaving windows for data leakage and inefficiency.

## Invention
A server-side recovery subsystem that:
1. Maintains a per-(user, conversation) **contiguous recovery cursor** and a set of **missing ranges**.
2. On a recovery request, issues an **opaque recovery plan** bound to (user, conversation, session generation, seq range [start,end], membership version at issuance, expiry, adaptive batch size).
3. Re-checks authorization against the **current** membership version and session generation on **every** batch and ack; on mismatch, invalidates the plan and notifies the client.
4. Replays messages in **adaptive batches** whose size is deterministically adjusted from the remaining range (smaller near the tail, larger for large backlogs), bounded by configurable min/max.
5. Reconciles duplicates via idempotent acks (re-acking a seq is a no-op for the cursor) and merges missing ranges.
6. Applies a configurable authorization policy (`current_membership` default vs `historical_allowed`).

## Key novel elements
- **Membership-version binding of an opaque plan**: the plan captures the conversation's membership version at issuance; any membership change increments the version and invalidates outstanding plans for removed/changed users.
- **Session-generation binding**: prevents a stale/replayed session from using a plan issued to a prior session.
- **Adaptive batch sizing with deterministic function**: measurable throughput improvement (see benchmark_results.md) without client-side tuning.
- **Missing-range tracking with merge + clear-up-to**: supports partial/failed recovery and resumption.
- **Cross-transport uniformity**: identical recovery protocol over TCP and WebSocket via the bridge.

## Benefits
- No data leakage after membership revocation (plan invalidated, replay blocked).
- Reduced duplicate delivery (idempotent acks, cursor advancement).
- Higher recovery throughput for large backlogs (adaptive batching).
- Deterministic, auditable authorization decisions (policy-configurable).

## Implementation status
Implemented in Node.js backend (server.js), bridged to WebSocket (bridge/server.js), with React dashboard (dashboard/src). Validated by tests/test_recovery.js (4 scenarios, all pass) and benchmarks (tests/benchmark.js).
