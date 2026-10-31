# Risks and Open Questions

## Technical risks
- **sql.js performance**: JS-compiled SQLite is slower than native; production should use better-sqlite3 or native SQLite. Benchmark numbers are conservative (lower bound on throughput).
- **Single-process concurrency**: seq allocation relies on Node's single-threaded event loop; a multi-process deployment needs a DB-level sequence allocation or distributed lock.
- **Plan expiry vs. slow clients**: 60s TTL may be too short for very large backlogs on slow links; make TTL configurable per deployment (already env-configurable).
- **Membership version granularity**: version increments on any member change, which may invalidate plans more often than necessary; consider per-user membership epoch for finer granularity (open question).
- **Missing-range trust**: client-reported missing ranges are trusted; a malicious client could request ranges it shouldn't receive, but authorization re-check still gates access by membership. Content is only sent for authorized conversations.

## Patent risks
- **Obviousness**: examiner may view cursor + membership check as obvious combination. Mitigation: emphasize opaque plan binding to (session gen, membership version, seq range) and deterministic invalidation protocol. Prior art search (prior_art_search.md) found no single reference combining all elements.
- **Prior art 11 (inline.chat)**: similar sync-recovery pattern; differentiate by membership-version binding and adaptive sizing.
- **Claim scope**: dependent claims 9 (historical_allowed) and 10 (TTL) may be seen as implementation details; keep independent claim focused on the binding + invalidation core.

## Open questions
1. Should recovery plans be persisted across server restarts? Currently in-memory DB persists plans, but in-flight sockets are lost; clients re-auth and re-request. Acceptable.
2. Should adaptive sizing consider client-reported throughput/latency? Currently server-side remaining-range only. Client feedback could improve but adds complexity.
3. Should dedup be by (conversation, seq) globally or per-user? Currently per-conversation seq; user-level dedup is client-side. Consider server-side dedup log for audit.
4. Multi-device: same user on multiple devices shares cursor; may cause one device to skip messages recovered by another. Consider per-device cursor. (Open.)
5. Encryption at rest for messages: not implemented; out of scope for this invention.

## Testing gaps
- No load test with many concurrent recovering clients.
- No property-based fuzzing of missing-range merge logic.
- No chaos test for transport switching mid-recovery.

## Recommendation
Proceed with provisional patent filing on the core binding+invalidation mechanism; pursue dependent claims for adaptive sizing and missing-range reconciliation.
