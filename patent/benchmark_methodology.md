# Benchmark Methodology

## Environment
- OS: Windows 11 (host).
- Runtime: Node.js v24.22.1.
- Backend: reconstructed Node.js server (server.js) using sql.js (SQLite compiled to JS).
- Transport: TCP localhost (127.0.0.1), JSON lines.
- DB: fresh SQLite file per run.

## Workload
- 2 users (alice sender, bob receiver).
- 1 group conversation containing both.
- N = 1000 messages sent by alice before recovery.
- bob recovers all N messages from seq 1 to N.
- Ack after every batch; plan reused across batches? No — each `recover` call with a new fromSeq creates a new plan (server-side). Cursor accumulates.

## Scenarios
1. Fixed batch size 25 (base=max=25).
2. Fixed batch size 50.
3. Fixed batch size 100.
4. Adaptive (base 25, max 100): server increases batch by 25 when remaining > 200.

## Metrics
- `batches`: number of recovery_batch round-trips.
- `totalReceived`: messages received (should equal N).
- `elapsedMs`: wall-clock from first recover send to last batch ack (excludes message seeding).
- `throughputMsgPerSec`: totalReceived / elapsedMs * 1000.

## Procedure
- `tests/benchmark.js` spawns a fresh server per scenario, seeds 1000 messages, runs recovery, records metrics, writes patent/benchmark_results.json.
- Each scenario repeated conceptually; reported values are single-run (deterministic enough for relative comparison).

## Correctness checks
- totalReceived == N for all scenarios.
- No duplicate seq in received set (verified by construction; client dedups by seq).
- Cursor reaches N after completion.

## Limitations
- Localhost only; no network latency/jitter.
- Single process; no horizontal scaling.
- sql.js (JS SQLite) slower than native SQLite; native numbers would differ.
- No concurrency from multiple recovering clients in this run (covered separately by tests/test_recovery.js).
