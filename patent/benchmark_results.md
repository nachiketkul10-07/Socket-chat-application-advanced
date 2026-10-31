# Benchmark Results

Source data: `patent/benchmark_results.json`. Methodology: `patent/benchmark_methodology.md`.

## Summary table

| Mode | Base batch | Max batch | Batches | Messages | Elapsed (ms) | Throughput (msg/s) |
|------|-----------:|----------:|--------:|---------:|-------------:|-------------------:|
| Fixed | 25 | 25 | 40 | 1000 | 996 | 1004 |
| Fixed | 50 | 50 | 20 | 1000 | 937 | 1067 |
| Fixed | 100 | 100 | 10 | 1000 | 977 | 1024 |
| Adaptive | 25 | 100 | 24 | 1000 | 489 | 2045 |

## Observations
- Adaptive mode achieves the highest throughput (~2.0x the best fixed mode) by using larger batches early (50) while draining the tail in smaller batches, reducing round-trip count relative to base-25 fixed while avoiding the tail inefficiency of fixed-100.
- Fixed-100 is not faster than fixed-50 in this localhost setting because per-batch processing dominates; adaptive wins by mixing.
- All scenarios recovered exactly 1000 messages with no duplicates (cursor reached 1000).

## Correctness
- `tests/test_recovery.js`: 4 scenarios, 6 assertions, all pass (exit code 0).
- Scenarios: basic recovery, missing-range reporting, membership-change invalidation, incremental cursor-based recovery.

## Limitations
See benchmark_methodology.md. Results are localhost single-process; production numbers will differ.
