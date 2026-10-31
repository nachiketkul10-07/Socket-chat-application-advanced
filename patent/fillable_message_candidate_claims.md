# Candidate Patent Claims: Live Collaborative Fill-in Messages (LCFM)

## Claim 1 (Independent Method Claim)
A computer-implemented method for facilitating real-time multi-party collaborative data entry within a persistent messaging timeline, the method comprising:
1. receiving, at a messaging server from a first client device associated with a message creator in an active conversation, a message creation request comprising:
   - human-readable contextual message text, and
   - a plurality of structured field definitions, wherein each structured field definition comprises a unique field identifier, an input field type, and an asymmetric editor assignment designating one or more authorized contributor user identifiers selected from participants of the active conversation;
2. generating and storing in an atomic relational data store:
   - a single canonical conversation message record assigned a unique message identifier and a conversation sequence number, and
   - a plurality of field records linked to the single canonical conversation message record, each field record storing a current value and an independent monotonic field revision counter;
3. transmitting a message creation event to a plurality of participant client devices connected to the active conversation, wherein the message creation event instructs each participant client device to render a single interactive message card at a position corresponding to the conversation sequence number in a message timeline;
4. receiving, at the messaging server from a second client device associated with a contributing participant, an update request targeting a specific field identifier of the single canonical conversation message record, the update request comprising the unique message identifier, the specific field identifier, a submitted input value, an expected field version, and a client mutation identifier;
5. verifying, by the messaging server, that:
   - the contributing participant is an authorized member of the active conversation,
   - the contributing participant is explicitly permitted to edit the specific field identifier based on the asymmetric editor assignment,
   - the single canonical conversation message record is in an editable lifecycle state, and
   - the expected field version matches the current monotonic field revision counter stored for the specific field identifier;
6. upon successful verification:
   - atomically persisting the submitted input value into the field record corresponding to the specific field identifier,
   - incrementing the independent monotonic field revision counter for the specific field identifier without incrementing the conversation sequence number, and
   - recording an immutable sub-message revision entry comprising the contributing participant identifier, previous value, submitted input value, incremented field revision counter, and client mutation identifier; and
7. broadcasting an in-place update event over persistent bi-directional network connections to the plurality of participant client devices connected to the active conversation, wherein the in-place update event causes each participant client device to update the rendered single interactive message card in-place within the message timeline without inserting a new conversation message into the message timeline.

---

## Claim 2 (Dependent Claim — Per-Field Optimistic Concurrency)
The method of Claim 1, further comprising:
- in response to receiving a concurrent update request from a third client device targeting the specific field identifier wherein the expected field version does not match the current monotonic field revision counter:
  - rejecting the concurrent update request, and
  - transmitting a structured conflict response to the third client device comprising the current monotonic field revision counter and the current value stored in the atomic relational data store, thereby allowing the third client device to display the current value and retry the update without acquiring a global lock on the single canonical conversation message record.

---

## Claim 3 (Dependent Claim — Cross-Field Concurrency Independence)
The method of Claim 1, wherein:
- a first update request targeting a first field identifier and a second update request targeting a second distinct field identifier within the same single canonical conversation message record are processed concurrently and independently by the messaging server, such that an update or conflict in the first field identifier does not block or invalidate an update to the second distinct field identifier.

---

## Claim 4 (Dependent Claim — Idempotent Mutation Deduplication)
The method of Claim 1, further comprising:
- prior to persisting the submitted input value, checking whether the client mutation identifier matches any previously recorded revision entry associated with the specific field identifier; and
- if a match is detected, acknowledging the update request with an idempotency confirmation and the current field value without re-executing the mutation or incrementing the independent monotonic field revision counter.

---

## Claim 5 (Dependent Claim — User-Specific Client Serialization)
The method of Claim 1, wherein transmitting the message creation event and broadcasting the in-place update event comprises:
- generating a base structured payload from the atomic relational data store; and
- for each recipient participant client device, dynamically evaluating field-level permissions against the recipient participant user identifier to set a boolean edit permission flag (`canCurrentUserEdit`) for each field definition, wherein the participant client device renders an active input control when the boolean edit permission flag is true, and renders an immutable read-only value representation when the boolean edit permission flag is false.

---

## Claim 6 (Dependent Claim — Multi-Modal Field Assignment Policies)
The method of Claim 1, wherein the asymmetric editor assignment for each structured field definition is selected from a group comprising:
- a custom participant mode designating one or more specific participant user identifiers;
- a broadcast mode designating all authorized participants of the active conversation; and
- a creator-only mode restricting editing authority exclusively to the message creator.

---

## Claim 7 (Dependent Claim — Dynamic Revocation and Real-Time Enforcement)
The method of Claim 1, further comprising:
- receiving an update permissions request from the message creator modifying the asymmetric editor assignment of a target field;
- atomically updating permission records in the atomic relational data store; and
- immediately rejecting any subsequent field update request submitted by a user whose editing authority has been revoked, even if said user previously held an active input control on their client device.

---

## Claim 8 (Dependent Claim — Membership Revocation Immediate Lockout)
The method of Claim 1, further comprising:
- detecting removal of a user from the active conversation; and
- immediately rejecting any subsequent field update request submitted by the removed user across all fields of the single canonical conversation message record, regardless of prior field-specific editor assignments.

---

## Claim 9 (Dependent Claim — Lifecycle State Machine)
The method of Claim 1, wherein the single canonical conversation message record transitions through a deterministic lifecycle state machine comprising:
- an `active` state wherein authorized contributors are permitted to submit field values;
- a `ready` state automatically triggered when all mandatory fields satisfy predefined validation rules;
- a `finalized` state triggered by an authorized finalizer wherein all fields are locked against further modification; and
- an `expired` state automatically triggered when a current wall-clock time exceeds a designated completion deadline timestamp.

---

## Claim 10 (Dependent Claim — Finalization Mandatory Constraint Verification)
The method of Claim 9, further comprising:
- receiving a finalization request for the single canonical conversation message record;
- verifying whether a mandatory field completion policy is enabled;
- if the mandatory field completion policy is enabled, verifying that every required field definition contains a valid completed value; and
- if any required field definition lacks a valid completed value, rejecting the finalization request with a validation failure response.

---

## Claim 11 (Dependent Claim — Reopen and Reactivation)
The method of Claim 9, further comprising:
- receiving a reopen request from the message creator while the single canonical conversation message record is in the `finalized` state; and
- transitioning the single canonical conversation message record from the `finalized` state to an editable state, thereby re-enabling authorized contributors to submit updated field values.

---

## Claim 12 (Dependent Claim — Field Validation Rules)
The method of Claim 1, wherein the input field type is selected from: short text, long text, integer or decimal number, calendar date, clock time, single selection, multiple selection, and boolean checkbox; and
- wherein verifying the submitted input value comprises executing server-side type and boundary validation against rules defined in the structured field definition prior to accepting the mutation.

---

## Claim 13 (Dependent Claim — Sub-Message Audit Trail Inspection)
The method of Claim 1, further comprising:
- receiving a history request from an authorized participant referencing the unique message identifier; and
- returning an ordered chronological list of immutable sub-message revision entries for display within an expandable audit interface associated with the single interactive message card, without displaying the revision entries as individual messages in the conversation timeline.

---

## Claim 14 (Dependent Claim — Zero Timeline Sequence Impact on Message Recovery)
The method of Claim 1, wherein:
- field update events mutate sub-message data structures without allocating new sequence numbers in the active conversation, such that client recovery cursors tracking message sequence gaps and membership-bound message recovery protocols remain unaffected by high-frequency collaborative field edits.

---

## Claim 15 (Independent System Claim)
A collaborative messaging server system configured for real-time multi-party data entry within a persistent messaging timeline, the system comprising:
- one or more processors;
- a network interface configured to maintain bi-directional stateful connections with a plurality of client devices;
- a memory storing instructions and an atomic relational data store comprising conversation records, conversation sequence counters, message records, and collaborative field tables;
wherein the instructions, when executed by the one or more processors, cause the system to:
1. receive, from a first client device of a message creator, a message creation request comprising contextual message text and a plurality of structured field definitions, each field definition specifying a unique field identifier, an input field type, and an asymmetric editor assignment designating one or more authorized contributor user identifiers;
2. allocate exactly one conversation sequence number and store in the atomic relational data store a single canonical conversation message record and linked field records, each field record storing a current value and an independent monotonic field revision counter;
3. dispatch a message creation event to the plurality of client devices to render a single interactive message card at the conversation sequence number in a message timeline;
4. receive, from a second client device of a contributor, an update request targeting a specific field identifier, the update request comprising an expected field version, a client mutation identifier, and a submitted value;
5. authenticate the contributor, verify active conversation membership, confirm authorized editing rights for the specific field identifier, and verify that the expected field version matches the current monotonic field revision counter;
6. atomically persist the submitted value, increment the independent monotonic field revision counter without incrementing the conversation sequence number, and append an immutable revision log entry; and
7. broadcast an in-place update event over the network interface causing each client device to update the rendered single interactive message card in-place within the message timeline without appending a new conversation message.

---

## Claim 16 (Independent Non-Transitory Computer-Readable Medium Claim)
A non-transitory computer-readable storage medium having stored thereon computer-executable instructions that, when executed by one or more processors of a messaging server, cause the messaging server to perform operations comprising:
- receiving a collaborative message creation payload comprising intro text and a plurality of typed field definitions having per-field access control lists;
- persisting a single conversation message record having a single timeline sequence number;
- receiving a field update request comprising a target field identifier, a submitted value, an expected version counter, and a client mutation token;
- verifying user conversation membership and per-field access authorization;
- performing optimistic concurrency verification by comparing the expected version counter with a stored monotonic version counter of the target field;
- atomically committing the submitted value and incrementing the stored monotonic version counter of the target field while maintaining the single timeline sequence number of the single conversation message record; and
- broadcasting an in-place synchronization event to connected conversation participants causing client rendering engines to update the single conversation message record in-place within an active conversation thread.

