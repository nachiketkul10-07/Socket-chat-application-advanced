# Prior Art Search

## Scope
Membership-Bound Adaptive Message Recovery for Multi-Transport Messaging Systems — a mechanism that (a) tracks per-user/per-conversation recovery cursors and missing ranges, (b) issues server-bound, opaque recovery plans that are authorized against the conversation's current membership version and the requester's session generation, (c) replays messages in adaptive batches with deterministic sizing, (d) invalidates in-flight plans on membership change, and (e) reconciles duplicates idempotently across TCP and WebSocket transports.

## Search method
- Web search across patent/public sources (freepatentsonline, Google Patents, patentscope, patsnap, GitHub).
- Keywords: message recovery, cursor, gap recovery, missing ranges, membership-bound, adaptive batching, session generation, multi-transport, deduplication, idempotent ack.
- Date of search: implementation date (current).

## Candidate prior art

| # | Source | Relevance | Differentiation |
|---|--------|-----------|-----------------|
| 1 | US 2014/0310365 — Global Relay "System and Method for Tracking Messages in a Messaging Service" | Tracks message delivery state; cursor-like. | No membership-version binding; no opaque recovery plan; no adaptive batch sizing. |
| 2 | US 8,750,296 — Progress Software "Method for recoverable message exchange independent of network protocols" | Recoverable exchange across protocols. | Focuses on protocol independence, not membership-bound authorization or cursor/missing-range reconciliation. |
| 3 | US 2011/0252152 — "RELIABLE MESSAGING SYSTEM AND METHOD" | Reliable delivery acknowledgements. | No per-conversation monotonic sequences bound to membership version; no plan invalidation. |
| 4 | US 2009/0132671 — "MESSAGE STATE MAINTENANCE AT A CURSOR" | Cursor-based message state. | Cursor is generic; no membership-version-bound recovery plans or adaptive batching. |
| 5 | US 9,871,750 — "Maintaining persistence of a messaging system" | Persistence/backlog. | No membership-version invalidation of in-flight recovery. |
| 6 | US 2010/0070588 — "RELIABILITY FOR INSTANT MESSAGING BASED ON END POINT ACKNOWLEDGEMENTS" | Endpoint acks. | No opaque recovery plan IDs or session-generation binding. |
| 7 | US 2007/0276913 — Microsoft "Providing Access to Missed Text Messages in a Real-Time Text-Messaging Conference" | Missed-message access in conferences. | Conference-scoped; no per-user cursor + missing ranges; no membership-version gating. |
| 8 | US 2017/0163468 — "permission-based message dissemination" | Permission-based dissemination. | Dissemination, not recovery; no adaptive batching. |
| 9 | US 11,646,987 — "adaptive message distribution" | Adaptive distribution. | Distribution, not recovery; no membership-bound plan invalidation. |
| 10 | US 8,782,184 — "adaptive delivery of digital messages" | Adaptive delivery. | Delivery adaptation, not recovery cursor reconciliation. |
| 11 | inline.chat sync-recovery docs | Sync recovery pattern. | Public documentation of a similar pattern; supports that the approach is implementable but not identical (no membership version binding). |
| 12 | GitHub PRs (openclaw, AgentWorkforce/relay) | Inbound recovery + dedup, resume missed events. | Generic; no membership-version-bound opaque plans. |

## Observations
- No single prior-art reference combines all of: (i) per-(user,conversation) contiguous cursor + missing ranges, (ii) server-issued opaque recovery plans bound to session generation and membership version, (iii) authorization re-check at every batch/ack using current membership version with plan invalidation, (iv) deterministic adaptive batch sizing driven by remaining range, (v) idempotent acks and duplicate reconciliation across transports.
- Closest are cursor-based recovery (4, 11) and reliable messaging (2, 6), but they lack membership-version gating and adaptive sizing.
- Risk: a patent examiner may view cursor-based recovery + membership checks as an obvious combination. Mitigation: emphasize the specific binding of an opaque plan to (session generation, membership version, seq range) and the deterministic invalidation/re-issuance protocol, plus adaptive batch sizing with measurable throughput gains.

## Conclusion
The invention appears novel in its specific combination. Proceed to invention disclosure and claims, with explicit differentiation from cursor-based recovery and reliable-messaging prior art.
