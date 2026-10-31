# PATENT PROPOSAL: FORMAL SPECIFICATION

**Title:** A Membership-Bound Adaptive Message Recovery System for Real-Time Chat Applications Across WebSocket and TCP Transports  
**Applicant:** Vishwakarma Institute of Technology, Pune (666, Upper Indiranagar, Bibwewadi, Pune, Maharashtra, India – 411 037)  
**Lead Inventor / Guide:** Prof. Suvarna Patil (Department of Computer Engineering, Vishwakarma Institute of Technology, Pune)  
**Document Ref:** VIT/COMP/PAT/2026-27/01 — Draft for Institutional Review  

---

## 1. Applicant and Inventor Details

### 1.1 Applicant Details
* **Full Name:** Vishwakarma Institute of Technology
* **Nationality:** Indian
* **Registered Address:** 666, Upper Indiranagar, Bibwewadi, Pune, Maharashtra, India – 411 037

### 1.2 Inventor Details
* **Lead Inventor:** Prof. Suvarna Patil
* **Nationality:** Indian
* **Designation / Department:** Department of Computer Engineering, Vishwakarma Institute of Technology, Pune
* **Email ID:** Suvarna.mane@vit.edu
* **Phone No:** +91 96890 02340
* *(Student co-inventors omitted per institutional review guidelines; to be annexed prior to final filing)*

---

## 2. Title of the Invention
**A Membership-Bound Adaptive Message Recovery System for Real-Time Chat Applications Across WebSocket and TCP Transports**

---

## 3. Technical Field of the Invention
The present invention relates generally to computerized communications, distributed systems, real-time messaging protocols, database-backed message sequencing, and access-control validation. More specifically, it concerns a method, system, and data structure for recovering messages missed during temporary client disconnections while continuously validating user conversation membership and session validity throughout the recovery process.

---

## 4. Prior Art and Technical Deficiencies

Real-time chat applications commonly maintain message history and use sequence numbers or cursors to identify messages that a client has not received. When a disconnected client reconnects, it typically requests missing messages after its last known sequence number. Conventional systems commonly employ fixed-size batches (e.g., fixed blocks of 25 or 50 messages). 

### Deficiencies in Conventional Approaches:
1. **Stale Authorization Vulnerability:** Existing architectures check user permissions only when recovery begins. If a user is removed from a private group or if their login session changes while message replay is underway, standard systems continue replaying messages using stale access credentials, causing severe data leaks.
2. **Inflexible Batch Overhead:** Fixed-size batching causes excessive round trips for large message backlogs (e.g., 1,000+ messages), while creating unnecessary server buffering and bandwidth waste when small remaining ranges are transferred at the conclusion of recovery.
3. **Inability to Reconcile Non-Contiguous Gaps:** Simple single-integer cursors fail to capture complex non-contiguous missing intervals (e.g., messages 1–10 received, 11–25 missed, 26–30 received).
4. **Idempotency Failures:** Repeated client acknowledgements across unreliable mobile networks can cause race conditions or erroneously move acknowledgment cursors backward.

---

## 5. Objects of the Invention
1. To recover messages missed by a client after a temporary network disconnection with zero message loss.
2. To prevent a recovery operation from continuing with stale group-membership or session information via dynamic plan invalidation.
3. To minimize network round trips and latency by dynamically adapting recovery batch size to the remaining backlog within strict bounds ($5 \le \text{batch} \le 100$).
4. To maintain a contiguous acknowledgement cursor while recording and reconciling non-contiguous missing sequence intervals.
5. To support browser WebSocket clients and high-performance TCP backends through a unified newline-delimited JSON bridge.
6. To guarantee idempotency and monotonic cursor progression under repeated network acknowledgements.

---

## 6. Synopsis of the Invention
The invention is a message recovery subsystem for a real-time chat application comprising a client dashboard (React/TypeScript), a WebSocket-to-TCP bridge, a backend messaging engine (C++17 / Node.js), and a persistent SQLite database. Messages within each conversation receive strictly monotonic sequence numbers (`seq`). For every user and conversation pair, the system stores the highest contiguous acknowledged sequence cursor and, separately, a table of missing sequence intervals.

When a client requests recovery, the backend issues a server-controlled Recovery Plan (`RecoveryPlan`) identified by a server-generated token. The plan binds:
* Requesting User ID
* Target Conversation ID
* Session Generation Counter
* Requested Sequence Interval (`start_seq` to `end_seq`)
* Conversation Membership Version (`membership_version`)
* Plan Expiry Timestamp
* Adaptive Batch Size

Before each batch is transmitted and before each acknowledgement is accepted, the backend revalidates the plan against live database state. Any change to the group's `membership_version` (such as user removal) or `session_generation` immediately invalidates the plan with a structured `recover_invalidate` notification, cutting off message replay. Batch size is dynamically computed based on the remaining sequence backlog, optimizing throughput.

---

## 7. Brief Description of Drawings

The following drawings illustrate preferred embodiments of the invention:
* **Figure 1:** Illustrates the overall distributed chat system architecture:
  * `100` – Client Dashboard (React / TypeScript)
  * `102` – WebSocket-to-TCP Bridge
  * `104` – Backend Messaging Engine (C++17 / Node.js)
  * `106` – Persistent SQLite Storage Layer
* **Figure 2:** Illustrates the recovery-plan validation and lifecycle flow:
  * `200` – Incoming Recovery Request
  * `202` – Plan Generator
  * `204` – Dynamic Membership & Session Generation Validator
  * `206` – Adaptive Batch Sender
  * `208` – Monotonic Acknowledgement Processor
  * `210` – Invalidation Signal (`recover_invalidate`)
* **Figure 3:** Illustrates the recovery state database schema:
  * `300` – Contiguous Cursor Store (`recovery_cursors`)
  * `302` – Missing Sequence Range Store (`recovery_missing`)
  * `304` – Active Recovery Plan Store (`recovery_plans`)
  * `306` – Monotonic Message Sequence Store (`messages`)
* **Figure 4:** Illustrates the adaptive batch size selection algorithm:
  * `400` – Remaining Backlog Calculator
  * `402` – Dynamic Batch Size Selector
  * `404` – Bound Checker ($\min = 5$, $\max = 100$)
  * `406` – Recovery Batch Output

---

## 8. Detailed Description of the Invention

### 8.1 System Architecture
As illustrated in **Figure 1**, browser clients (`100`) communicate over secure WebSockets with a transport bridge (`102`). The bridge maintains persistent bi-directional TCP sockets to the core messaging engine (`104`), translating frames into newline-delimited JSON envelopes. Persistence is managed via an atomic SQLite engine (`106`).

### 8.2 Message Sequencing & Dual-State Recovery Tracking
Every message is allocated a monotonic sequence number `seq` within its conversation. The recovery subsystem isolates tracking into two distinct structures:
1. **Contiguous Cursor (`300`):** Represents the highest sequence number received such that all prior sequences $1 \le s \le \text{cursor}$ have been successfully acknowledged.
2. **Missing Range Store (`302`):** Records discrete intervals $[S_{\text{start}}, S_{\text{end}}]$ representing gaps caused by network drops during active transmission.

### 8.3 Creation and Continuous Validation of Recovery Plans
When client `100` reconnects, it dispatches a recovery request (`200`). Plan generator `202` creates a record in `recovery_plans` (`304`) binding `user_id`, `conversation_id`, `session_generation`, `membership_version`, and `expires_at`.

Crucially, **before sending each batch (`206`) and before processing each acknowledgement (`208`)**, validator `204` re-evaluates:
$$\text{Live Membership Version} == \text{Plan Membership Version}$$
$$\text{Live Session Generation} == \text{Plan Session Generation}$$
$$\text{Current Time} \le \text{Plan Expiry Timestamp}$$

If any condition fails (e.g., the user was kicked from the channel while downloading), validator `204` triggers output `210` (`recover_invalidate`), terminating message streaming immediately.

### 8.4 Adaptive Batch Sizing Algorithm
The batch selector (`402`, `404`) evaluates remaining messages $R$:
$$B(R) = \begin{cases} 
R & \text{if } R < 5 \\
100 & \text{if } R > 500 \\
50 & \text{if } 100 < R \le 500 \\
\min(R, 25) & \text{otherwise}
\end{cases}$$
Bounded strictly by $[5, 100]$. This eliminates fixed-batch round-trip bottlenecks for large backlogs and avoids trailing buffer waste for small backlogs.

### 8.5 Monotonic Acknowledgement & Gap Reconciler
Upon receiving an acknowledgement (`recover_ack`), processor `208`:
1. Advances the cursor monotonically: $\text{cursor}_{\text{new}} = \max(\text{cursor}_{\text{old}}, \text{ack}_{\text{seq}})$.
2. Automatically merges overlapping or adjacent missing ranges: $[a, b] \cup [b+1, c] \to [a, c]$.
3. Deletes any missing ranges where $S_{\text{end}} \le \text{cursor}_{\text{new}}$.

---

## 9. Empirical Validation & Benchmarks
In test scenarios executed on the production codebase:
* **All 4 Recovery Integration Scenarios Passed (6/6 assertions):**
  1. Full end-to-end recovery of 200 missed messages.
  2. Non-contiguous gap recording and reconciliation.
  3. Immediate invalidation upon member removal (`membership_revoked`).
  4. Multi-batch cursor progression across network re-connections.
* **Empirical Performance Benchmark (1,000 Messages):**
  * Fixed Batching ($B=25$): Elapsed Time = **996 ms** ($\approx 1,004\text{ msgs/sec}$).
  * Adaptive Batching: Elapsed Time = **489 ms** ($\approx 2,045\text{ msgs/sec}$).
  * **Result:** **50.9% latency reduction and $2.04\times$ throughput increase.**

---

## 10. Patent Claims

We claim:
1. A computer-implemented method for recovering missed messages in a real-time messaging system, comprising:
   - maintaining, for a user and a conversation, a contiguous acknowledgement cursor and a set of missing sequence ranges;
   - generating a server-side recovery plan associated with the user, conversation, session generation, sequence range, membership version, and expiry time;
   - validating the plan against current session and membership state during recovery;
   - selecting message batch sizes dynamically based on the remaining sequence range; and
   - updating the cursor and missing ranges monotonically based on client acknowledgements.
2. The method of claim 1, wherein the recovery plan is identified by a server-generated identifier and the client cannot modify the plan's authorization fields.
3. The method of claim 1, wherein a change in the conversation membership version causes an active recovery plan to be invalidated before a subsequent batch is sent or an acknowledgement is accepted.
4. The method of claim 1, wherein a session-generation mismatch or an expiry-time violation causes the server to reject the recovery plan and provide an explicit invalidation reason to the client.
5. The method of claim 1, wherein the batch size is selected from a configurable range bounded by a minimum batch size of 5 and a maximum batch size of 100, and is adjusted according to the number of messages remaining to be recovered.
6. The method of claim 1, wherein the acknowledgement cursor advances monotonically and repeated acknowledgements do not cause the cursor to move to an earlier sequence number.
7. The method of claim 1, wherein overlapping or adjacent missing sequence ranges are merged and ranges fully covered by the contiguous acknowledgement cursor are removed from the missing-range store.
8. The method of claim 1, wherein the recovery subsystem operates over a messaging architecture comprising a browser WebSocket client, a transport bridge, and a TCP backend using newline-delimited JSON messages.
9. A real-time messaging system comprising a client interface, a transport bridge, a backend message engine, persistent recovery-state storage, and a recovery controller configured to perform the method of any preceding claim.
10. The system of claim 9, wherein the backend message engine is implemented using either a Node.js runtime with a SQLite-compatible persistence layer or a native C++ socket server with SQLite.

