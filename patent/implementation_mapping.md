# Implementation Mapping

Maps each claim element to concrete code.

| Claim element | File | Symbol |
|---------------|------|--------|
| Contiguous cursor + missing ranges | backend/server.js | `recovery_cursors`, `recovery_missing` tables; `getCursor`, `setCursor`, `addMissingRange`, `getMissingRanges`, `clearMissingUpTo` |
| Opaque recovery plan bound to user/conv/session gen/seq range/membership version/expiry/batch size | backend/server.js | `recovery_plans` table; `handleRecover` (plan creation) |
| Re-authorization on every batch and ack | backend/server.js | `authorizePlan(plan, userId, convId, sessionGen)` called in `handleRecover`, `handleRecoverAck` |
| Invalidation on membership version mismatch | backend/server.js | `authorizePlan` (state→'invalidated', reason 'membership_changed'); `bumpMembershipVersion` on add/remove |
| Session-generation binding | backend/server.js | `sessions` table; `handleAuth` increments generation; `authorizePlan` checks `plan.session_generation !== sessionGen` |
| Adaptive batch sizing | backend/server.js | `adaptiveBatchSize(plan, remaining)`; `RECOVERY_BASE_BATCH/MIN/MAX` |
| Idempotent cursor advancement | backend/server.js | `handleRecoverAck`: `if (ackedSeq > cur) setCursor(...)` |
| Missing-range merge + clear-up-to | backend/server.js | `addMissingRange`, `clearMissingUpTo` |
| Policy selection | backend/server.js | `AUTH_POLICY` env; `authorizePlan` |
| Plan expiry | backend/server.js | `expires_at`; `authorizePlan` checks `plan.expires_at < now()` |
| Per-conversation monotonic seq | backend/server.js | `allocateSeq` (MAX(seq)+1); UNIQUE(conversation_id, seq) |
| Cross-transport uniformity | bridge/server.js | WS↔TCP relay of JSON lines |
| Client recovery UI | dashboard/src/RecoveryPanel.tsx, dashboard/src/types.ts, dashboard/src/websocket.ts, dashboard/src/App.tsx | RecoveryPanel, types, ChatSocket |
| Validation | tests/test_recovery.js | 4 scenarios, 6 assertions, exit 0 |
| Benchmark | tests/benchmark.js, patent/benchmark_results.json | 4 scenarios |

## Configuration (env)
- PORT, DB_PATH, AUTH_POLICY, RECOVERY_BASE_BATCH, RECOVERY_MIN_BATCH, RECOVERY_MAX_BATCH, RECOVERY_PLAN_TTL_MS.

## Persistence
- sql.js SQLite, saved to DB_PATH on each mutation (`saveDb`).

## Tests
- `tests/test_recovery.js` — spawns server, runs scenarios, exit code 0 on success.
- `tests/benchmark.js` — performance scenarios, writes `patent/benchmark_results.json`.
