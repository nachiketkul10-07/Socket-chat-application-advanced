# PATENT PROPOSAL: FORMAL SPECIFICATION

**Title:** A System and Method for Live Collaborative Fill-in Messages with Asymmetric Field-Level Authorization and In-Place Synchronization in Real-Time Messaging Networks  
**Applicant:** Vishwakarma Institute of Technology, Pune (666, Upper Indiranagar, Bibwewadi, Pune, Maharashtra, India – 411 037)  
**Lead Inventor / Guide:** Prof. Suvarna Patil (Department of Computer Engineering, Vishwakarma Institute of Technology, Pune)  
**Document Ref:** VIT/COMP/PAT/2026-27/02 — Draft for Institutional Review  

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
**A System and Method for Live Collaborative Fill-in Messages with Asymmetric Field-Level Authorization and In-Place Synchronization in Real-Time Messaging Networks**

---

## 3. Technical Field of the Invention
The present invention relates generally to computerized communications, instant messaging platforms, distributed collaborative computing, and real-time database-backed synchronization. More specifically, it concerns a method and system for embedding multi-party, permission-governed, dynamic collaborative detail-appending directly into a single persistent chat bubble within an active conversation timeline.

---

## 4. Background and Problem Statement

### 4.1 The "Reply Storm" and Timeline Fragmentation
In modern instant messaging applications (e.g., WhatsApp, Slack, Microsoft Teams, Telegram), collecting structured or semi-structured information from a group (e.g., "Please share your pickup point and student PRN number") requires each participant to send an independent reply message. 

In a group of $N$ participants, this creates:
1. **$N$ Disparate Messages:** The conversation timeline is inundated with fragmented replies, pushing prior conversational context off-screen.
2. **Cognitive Collation Overhead:** The coordinator must manually read, compile, and cross-reference answers across dozens of scattered messages.
3. **Loss of Attribution Control & Privacy:** Either everyone sees all replies publicly, or users must resort to private direct messages, destroying shared group awareness.

### 4.2 Deficiencies of External Forms and Single-User Message Editing
* **External Survey Forms (e.g., Google Forms):** Forces users out of the chat app into a web browser, breaking conversation continuity.
* **Single-User Message Editing (e.g., WhatsApp Edit):** Only the original author can edit their own message. Prior art does not provide a multi-party permission-governed collaborative message where authorized recipients append details into the sender's original message bubble in real time.

---

## 5. Summary and Core Technical Contribution

The present invention introduces the **Living Chat Bubble (LCFM)** paradigm:
$$\textbf{ONE MESSAGE} \longrightarrow \textbf{MULTIPLE AUTHORIZED CONTRIBUTORS} \longrightarrow \textbf{SHARED LIVE STATE} \longrightarrow \textbf{ONE UPDATED MESSAGE}$$

### Key Innovations:
1. **Native Chat Bubble Look & Feel:** The collaborative message renders identically to an ordinary chat bubble (not a clunky enterprise form widget). Appended entries appear neatly as bullet points beneath the introductory text.
2. **WhatsApp-Style Right-Click Context Menu:** Participants right-click directly on the message bubble to access options: *"➕ Append Details"*, *"✏️ Edit My Contribution"*, *"🔒 Lock Message"*, and *"🕒 Contributor Audit"*.
3. **Creator-Only Attribution Privacy:** 
   - **Creator's View:** Displays full provenance of who contributed every detail (e.g., `• [Bob]: PRN: 1251076777`).
   - **Other Participants' View:** Displays the data cleanly without other people's names (e.g., `• PRN: 1251076777`). Only the user's own line displays `(You)`. The server strips author identities before dispatching to non-creator clients.
4. **Unconstrained Dynamic Fields:** Users can append any custom topic or value (e.g., PRN, location, dietary choice) on the fly without rigid pre-declared schemas.
5. **Zero Sequence Pollution & $O(1)$ Timeline Scalability:** Appended details mutate sub-records in the relational store without allocating conversation sequence numbers or incrementing timeline message counts, reducing timeline clutter by **up to 97%**.

---

## 6. Brief Description of Drawings

* **Figure 1:** Illustrates the Living Chat Bubble Architecture and Three-Tier Synchronization Pipeline:
  * `100` – Native Message Bubble Component
  * `102` – Floating Context Menu Controller (Right-Click)
  * `104` – WebSocket Transport Bridge
  * `106` – Stateful Core Messaging Engine
  * `108` – Asymmetric Permission & Dynamic Serializer Engine
  * `110` – Atomic Relational Database Engine
* **Figure 2:** Illustrates the Right-Click User Interaction & Append Flow:
  * `200` – Bubble Right-Click Event (`onContextMenu`)
  * `202` – Context Menu Evaluator (Checking User Permissions)
  * `204` – Dynamic Append Popover
  * `206` – Optimistic Concurrency & Idempotency Validator
  * `208` – In-Place Timeline Synchronization Broadcast
* **Figure 3:** Illustrates the Creator-Only Attribution Privacy Filter (`getFillablePayloadForUser`):
  * `300` – Canonical Sub-Field Records
  * `302` – Viewer Role Check (`isCreator`)
  * `304` – Creator Payload Pipeline (Retaining Full Provenance)
  * `306` – Participant Payload Pipeline (Stripping Author Identity)
* **Figure 4:** Illustrates Timeline Clutter Comparison ($O(1)$ LCFM vs. $O(N)$ Conventional Chat).

---

## 7. Detailed Description of the Preferred Embodiment

### 7.1 Data Structure & Relational Mapping
The backend maintains five interconnected relational tables:
1. `collaborative_messages`: Message metadata, status (`open`, `ready`, `finalized`), and creator ID.
2. `collaborative_message_fields`: Dynamic field records with composite key `PRIMARY KEY (message_id, id)`.
3. `collaborative_field_permissions`: Asymmetric access control list `(message_id, field_id, user_id)`.
4. `collaborative_field_values`: Canonical values, monotonic revision counters (`version`), and editor tracking.
5. `collaborative_message_revisions`: Immutable sub-message audit trail recording previous value, new value, editor ID, timestamp, and client mutation ID.

### 7.2 Dynamic Field Appending Workflow
1. An authorized user right-clicks on a collaborative message bubble.
2. The user enters a label (e.g., "PRN") and value (e.g., "1251076777") into the popover.
3. The client emits `append_fillable_detail` over WebSocket with a unique `clientMutationId`.
4. The server validates active conversation membership and confirms the message is not finalized/locked.
5. The server dynamically allocates a sub-field ID (`fld_dyn_...`), records the value, initializes version to `1`, and appends an audit revision.
6. The server generates user-tailored representations:
   - For the creator, `lastEditorUsername` is included.
   - For other conversation members, `lastEditorUsername` is set to `null` (or `"You"` for the author).
7. The server broadcasts `fillable_message_updated` to all connected conversation participants. The bubble updates in-place instantly.

---

## 8. Empirical Performance & Timeline Metrics

Empirical benchmarks conducted across varying contributor group sizes ($N=5, 15, 30$):

| Contributors ($N$) | Normal Chat Approach | LCFM Living Bubble | Timeline Pollution Reduction |
|---|---|---|---|
| **5** | 6 messages (5 replies) | **1 message (0 replies)** | **-83.3% clutter** |
| **15** | 16 messages (15 replies) | **1 message (0 replies)** | **-93.8% clutter** |
| **30** | 31 messages (30 replies) | **1 message (0 replies)** | **-96.8% clutter** |

* **Zero Sequence Contamination:** Because field edits do not consume conversation sequence numbers (`seq`), existing sequence recovery cursors remain completely unperturbed.

---

## 9. Patent Claims

We claim:
1. A computer-implemented method for collaborative data entry within a persistent real-time messaging timeline, the method comprising:
   - displaying a single canonical message bubble in an active conversation timeline;
   - displaying a context menu upon detecting a selection action on the message bubble;
   - receiving an append request comprising a submitted detail from an authorized participant;
   - storing the submitted detail as a sub-record linked to the single canonical message bubble;
   - dynamically generating user-specific representations of the single canonical message bubble, wherein author attribution of the submitted detail is visible to a creator of the single canonical message bubble and is stripped from representations transmitted to other participants; and
   - broadcasting an in-place update event causing participant client devices to render the submitted detail inside the single canonical message bubble without appending a new conversation message.
2. The method of claim 1, wherein the selection action comprises a right-click pointer event on the message bubble.
3. The method of claim 1, wherein author attribution is visible to the contributing participant as an own-contribution indicator, while author attributions of other contributors are hidden from said contributing participant.
4. The method of claim 1, wherein the submitted detail comprises a dynamically defined label and value entered without pre-configured field constraints.
5. The method of claim 1, wherein a creator of the single canonical message bubble can trigger a lock action via the context menu, transitioning the message bubble to an immutable finalized state.
6. The method of claim 1, wherein updates to the single canonical message bubble are deduplicated via a client mutation identifier for idempotency.
7. The method of claim 1, wherein appending a detail to the single canonical message bubble does not increment conversation sequence counters, preserving integrity of message recovery sequence cursors.
8. A real-time messaging server configured to perform the method of any preceding claim.

