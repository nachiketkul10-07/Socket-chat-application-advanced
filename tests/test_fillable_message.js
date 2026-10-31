const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = 8199;
const DB = path.join(process.env.TEMP || 'C:\\\\tmp', 'test_lcfm_' + Date.now() + '.db');
let serverProc = null;

function startServer(customDb = DB) {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..', 'backend'),
      env: { ...process.env, PORT: String(PORT), DB_PATH: customDb, AUTH_POLICY: 'current_membership' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    serverProc.stdout.on('data', d => {
      out += d.toString();
      if (out.includes('Server listening')) resolve();
    });
    serverProc.stderr.on('data', d => { console.error('SRVERR', d.toString()); });
    setTimeout(() => reject(new Error('server start timeout: ' + out)), 8000);
  });
}

function stopServer() {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
}

function connect() {
  const s = net.createConnection(PORT, '127.0.0.1');
  let buf = '';
  const queue = [];
  const waiters = [];

  s.on('data', d => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const o = JSON.parse(line);
        const idx = waiters.findIndex(w => w.pred(o));
        if (idx >= 0) {
          const w = waiters.splice(idx, 1)[0];
          w.resolve(o);
        } else {
          queue.push(o);
        }
      } catch (e) {}
    }
  });

  function send(o) { s.write(JSON.stringify(o) + '\n'); }

  function waitFor(pred, timeout = 6000) {
    const qi = queue.findIndex(pred);
    if (qi >= 0) {
      const o = queue.splice(qi, 1)[0];
      return Promise.resolve(o);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) waiters.splice(i, 1);
        reject(new Error('waitFor timeout waiting for pred'));
      }, timeout);
      const w = { pred, resolve: (o) => { clearTimeout(timer); resolve(o); } };
      waiters.push(w);
    });
  }

  function close() { s.end(); }

  return { s, send, waitFor, close, queue };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
    throw new Error(msg);
  } else {
    passed++;
    console.log('  PASS:', msg);
  }
}

async function auth(conn, username) {
  conn.send({ type: 'auth', username });
  const ok = await conn.waitFor(o => o.type === 'auth_ok' || o.type === 'auth_success');
  return ok;
}

async function runTests() {
  console.log('========================================================');
  console.log(' Starting Automated Test Suite for LCFM & Chat Application');
  console.log('========================================================\n');

  await startServer();
  console.log('[Server] Started on port', PORT);

  const alice = connect();
  const bob = connect();
  const charlie = connect();

  await sleep(150);
  const aAuth = await auth(alice, 'alice');
  const bAuth = await auth(bob, 'bob');
  const cAuth = await auth(charlie, 'charlie');

  const aliceId = aAuth.userId || aAuth.user.id;
  const bobId = bAuth.userId || bAuth.user.id;
  const charlieId = cAuth.userId || cAuth.user.id;

  console.log(`[Users] Authenticated: Alice (${aliceId}), Bob (${bobId}), Charlie (${charlieId})`);

  // Baseline 1: Direct chat
  alice.send({ type: 'create_direct', userId: bobId });
  const dmEvt = await alice.waitFor(o => o.type === 'conversation_created');
  const dmId = dmEvt.conversationId;
  alice.send({ type: 'message', conversationId: dmId, text: 'Hi Bob in DM' });
  const dmMsg = await bob.waitFor(o => o.type === 'message' && o.conversationId === dmId);
  assert(dmMsg.text === 'Hi Bob in DM', 'Direct chat message successfully delivered');

  // Baseline 2: Public chat
  bob.send({ type: 'message', conversationId: 'public_general', text: 'Hello public general' });
  const pubMsg = await charlie.waitFor(o => o.type === 'message' && o.conversationId === 'public_general');
  assert(pubMsg.text === 'Hello public general', 'Public chat broadcast works');

  // Baseline 3: Group chat
  alice.send({ type: 'create_group', title: 'Weekend Trip', members: [bobId, charlieId] });
  const grpEvt = await alice.waitFor(o => o.type === 'group_created');
  const convId = grpEvt.conversationId;
  assert(convId !== undefined, 'Group conversation created');
  await sleep(200);

  // ==========================================
  // Test 1: Create fillable message
  // Test 3: Assign one editor to a field
  // Test 4: Assign multiple editors to a field
  // Test 5: Assign all group members
  // Test 10: Optional field behavior
  // ==========================================
  console.log('\n--- Scenario A: Creation & Field Assignment Rules ---');
  alice.send({
    type: 'create_fillable_message',
    conversationId: convId,
    introText: 'Trip details for this weekend. Please fill your parts.',
    templateSegments: [
      { type: 'text', content: 'Pickup: ' },
      { type: 'field', fieldId: 'fld_pickup' },
      { type: 'text', content: ' | Departure: ' },
      { type: 'field', fieldId: 'fld_depart' },
      { type: 'text', content: ' | Budget: ' },
      { type: 'field', fieldId: 'fld_budget' },
      { type: 'text', content: ' | Notes: ' },
      { type: 'field', fieldId: 'fld_notes' }
    ],
    fields: [
      {
        fieldId: 'fld_pickup',
        label: 'Pickup Location',
        fieldType: 'text',
        placeholder: 'e.g. Pune Station',
        required: true,
        validationRules: { max: 100 },
        assignmentMode: 'custom',
        assignedUserIds: [bobId] // 3. One assigned editor
      },
      {
        fieldId: 'fld_depart',
        label: 'Departure Time',
        fieldType: 'time',
        placeholder: 'e.g. 7:30 AM',
        required: true,
        validationRules: {},
        assignmentMode: 'custom',
        assignedUserIds: [charlieId] // 3. Charlie only
      },
      {
        fieldId: 'fld_budget',
        label: 'Total Budget',
        fieldType: 'number',
        placeholder: 'Total in INR',
        required: true,
        validationRules: { min: 100, max: 100000 },
        assignmentMode: 'custom',
        assignedUserIds: [bobId, charlieId] // 4. Multiple assigned editors
      },
      {
        fieldId: 'fld_notes',
        label: 'Trip Notes',
        fieldType: 'text',
        placeholder: 'Optional notes',
        required: false, // 10. Optional field
        validationRules: { max: 500 },
        assignmentMode: 'all', // 5. Assign all group members
        assignedUserIds: []
      }
    ],
    finalizationSettings: {
      requireAllMandatory: true,
      deadline: null,
      finalizePermission: 'creator_only',
      lockOnCompletion: true,
      allowReopen: true
    }
  });

  const createdBob = await bob.waitFor(o => o.type === 'fillable_message_created');
  const messageId = createdBob.messageId;
  assert(messageId.startsWith('msg_fillin'), '1. Fillable message created with stable ID');

  // Test 2: Render fillable message in chat
  const bobPayload = createdBob.message.fillable;
  assert(bobPayload.fields.length === 4, '2. Fillable message rendered with 4 fields');
  assert(bobPayload.fields[0].canCurrentUserEdit === true, '3. Bob can edit Pickup Location (one assigned editor)');
  assert(bobPayload.fields[1].canCurrentUserEdit === false, '3. Bob CANNOT edit Departure Time (assigned to Charlie)');
  assert(bobPayload.fields[2].canCurrentUserEdit === true, '4. Bob can edit Total Budget (assigned to Bob and Charlie)');
  assert(bobPayload.fields[3].canCurrentUserEdit === true, '5. Bob can edit Trip Notes (assignmentMode=all)');

  // Verify Charlie's view
  charlie.send({ type: 'fetch_fillable_message', messageId });
  const charlieFetch = await charlie.waitFor(o => o.type === 'fillable_message' && o.messageId === messageId);
  const charliePayload = charlieFetch.fillable;
  assert(charliePayload.fields[0].canCurrentUserEdit === false, 'Charlie CANNOT edit Pickup Location');
  assert(charliePayload.fields[1].canCurrentUserEdit === true, 'Charlie CAN edit Departure Time');
  assert(charliePayload.fields[2].canCurrentUserEdit === true, 'Charlie CAN edit Total Budget');
  assert(charliePayload.fields[3].canCurrentUserEdit === true, 'Charlie CAN edit Trip Notes');

  // ==========================================
  // Test 6: Unauthorized editor attempts an update
  // ==========================================
  console.log('\n--- Scenario B: Authorization & Validation ---');
  charlie.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_pickup',
    value: 'Hacked by Charlie',
    expectedFieldVersion: 0,
    clientMutationId: 'mut_unauth_1'
  });
  const unauthResp = await charlie.waitFor(o => o.type === 'fillable_message_error');
  assert(unauthResp.error.includes('permission'), '6. Unauthorized editor update rejected by backend');

  // ==========================================
  // Test 8: Invalid field value is rejected
  // ==========================================
  bob.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_budget',
    value: 'NotANumber',
    expectedFieldVersion: 0,
    clientMutationId: 'mut_invalid_1'
  });
  const invalidResp = await bob.waitFor(o => o.type === 'fillable_message_error');
  assert(invalidResp.error.includes('valid number'), '8. Invalid numeric field value rejected');

  // ==========================================
  // Test 7: Authorized editor submits valid data
  // Test 18: Two or more users receive live updates
  // Test 24: No extra chat message created
  // Test 25: Original message ID remains stable
  // ==========================================
  console.log('\n--- Scenario C: Authorized Edits & In-Place Synchronization ---');
  bob.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_pickup',
    value: 'Pune Station',
    expectedFieldVersion: 0,
    clientMutationId: 'mut_bob_1'
  });

  const aliceUpdate1 = await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_pickup');
  const charlieUpdate1 = await charlie.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_pickup');
  assert(aliceUpdate1.fillable.fields[0].currentValue === 'Pune Station', '7. Authorized editor valid submission accepted');
  assert(charlieUpdate1.fillable.fields[0].currentValue === 'Pune Station', '18. Both Alice and Charlie receive live update');
  assert(aliceUpdate1.messageId === messageId, '25. Original message ID remains identical');

  // Check history count in conversation - should only have 1 message!
  alice.send({ type: 'fetch_history', conversationId: convId, limit: 50 });
  const histAfterUpdate1 = await alice.waitFor(o => o.type === 'history' && o.conversationId === convId);
  assert(histAfterUpdate1.messages.length === 1, '24. No extra chat message created on field update (count=1)');

  // ==========================================
  // Test 14: Duplicate mutation ID (Idempotency)
  // ==========================================
  bob.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_pickup',
    value: 'Pune Station Duplicate',
    expectedFieldVersion: 1,
    clientMutationId: 'mut_bob_1' // Same mutation ID as above
  });
  const dupResp = await bob.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_pickup' && o.idempotent === true);
  assert(dupResp.idempotent === true, '14. Duplicate mutation ID treated idempotently');

  // ==========================================
  // Test 11: Concurrent edits to different fields
  // ==========================================
  console.log('\n--- Scenario D: Concurrency & Conflict Handling ---');
  // Bob updates Budget, Charlie updates Departure Time simultaneously
  bob.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_budget',
    value: 1500,
    expectedFieldVersion: 0,
    clientMutationId: 'mut_bob_budget'
  });
  charlie.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_depart',
    value: '7:30 AM',
    expectedFieldVersion: 0,
    clientMutationId: 'mut_charlie_depart'
  });

  const bBudgetUp = await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_budget');
  const cDepartUp = await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_depart');
  assert(bBudgetUp && cDepartUp, '11. Independent concurrent edits to different fields both succeed');

  // ==========================================
  // Test 12 & 13: Concurrent edits to same field & Stale version rejection
  // ==========================================
  // Current version of fld_budget is now 1.
  // Bob tries updating fld_budget with expectedFieldVersion: 0 (stale)
  bob.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_budget',
    value: 2000,
    expectedFieldVersion: 0, // Stale!
    clientMutationId: 'mut_stale_1'
  });
  const conflictResp = await bob.waitFor(o => o.type === 'fillable_field_conflict');
  assert(conflictResp.currentVersion === 1, '12/13. Stale version rejected with structured conflict response');
  assert(conflictResp.currentValue === 1500, '13. Conflict response returns canonical current value');

  // ==========================================
  // Test 9: Required field completion & progress tracking
  // ==========================================
  console.log('\n--- Scenario E: Completion, Finalization & Lifecycle ---');
  // Check current status: pickup, depart, budget are done. Notes is optional.
  // All 3 mandatory fields done! Status should now be ready!
  alice.send({ type: 'fetch_fillable_message', messageId });
  const checkReady = await alice.waitFor(o => o.type === 'fillable_message' && o.messageId === messageId);
  assert(checkReady.fillable.progress.isReady === true, '9. Required field completion verified (progress.isReady=true)');
  assert(checkReady.fillable.status === 'ready', '9. Message transitioned to READY state');

  // Optional field test: Charlie fills optional notes
  charlie.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_notes',
    value: 'Dont forget snacks!',
    expectedFieldVersion: 0,
    clientMutationId: 'mut_notes_1'
  });
  await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_notes');

  // ==========================================
  // Test 19: Finalize the original message
  // Test 20: Attempt update after finalization
  // ==========================================
  alice.send({ type: 'finalize_fillable_message', messageId });
  const finEvt = await bob.waitFor(o => o.type === 'fillable_message_finalized');
  assert(finEvt.fillable.status === 'finalized', '19. Original message locked in finalized state');

  // Attempt update after finalization: should be rejected
  bob.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_pickup',
    value: 'New Location Post-Finalize',
    expectedFieldVersion: 1,
    clientMutationId: 'mut_post_fin'
  });
  const postFinErr = await bob.waitFor(o => o.type === 'fillable_message_error');
  assert(postFinErr.error.includes('finalized'), '20. Updates rejected after finalization');

  // ==========================================
  // Test 21: Reopen finalized message
  // ==========================================
  alice.send({ type: 'reopen_fillable_message', messageId });
  const reopenEvt = await bob.waitFor(o => o.type === 'fillable_message_reopened');
  assert(reopenEvt.status === 'ready' || reopenEvt.status === 'open', '21. Creator can reopen finalized message');

  // Now Bob can edit again
  bob.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_pickup',
    value: 'Pune Railway Station Platform 1',
    expectedFieldVersion: 1,
    clientMutationId: 'mut_reopen_edit'
  });
  const reopenedEdit = await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_pickup');
  assert(reopenedEdit.fillable.fields[0].currentValue === 'Pune Railway Station Platform 1', '21. Edits work after reopen');

  // Re-finalize for completeness
  alice.send({ type: 'finalize_fillable_message', messageId });
  await bob.waitFor(o => o.type === 'fillable_message_finalized');

  // ==========================================
  // Test 15: Revoke editing permission (Permission modification)
  // ==========================================
  console.log('\n--- Scenario F: Dynamic Permissions & Membership Revocation ---');
  // Create another fillable message in group
  alice.send({
    type: 'create_fillable_message',
    conversationId: convId,
    introText: 'Second message for permission tests',
    templateSegments: [{ type: 'field', fieldId: 'fld_perm_test' }],
    fields: [
      {
        fieldId: 'fld_perm_test',
        label: 'Dynamic Field',
        fieldType: 'text',
        required: true,
        assignmentMode: 'custom',
        assignedUserIds: [bobId]
      }
    ]
  });
  const msg2Evt = await bob.waitFor(o => o.type === 'fillable_message_created');
  const msg2Id = msg2Evt.messageId;

  // Alice modifies permission: revokes Bob, assigns Charlie
  alice.send({
    type: 'update_fillable_permissions',
    messageId: msg2Id,
    fieldId: 'fld_perm_test',
    assignmentMode: 'custom',
    assignedUserIds: [charlieId]
  });
  const permUpdate = await bob.waitFor(o => o.type === 'fillable_message_permission_updated');
  assert(permUpdate.fillable.fields[0].canCurrentUserEdit === false, '15. Bob editing permission revoked');

  // Bob attempts edit -> rejected
  bob.send({
    type: 'update_fillable_field',
    messageId: msg2Id,
    fieldId: 'fld_perm_test',
    value: 'Bob trying',
    expectedFieldVersion: 0
  });
  const bobRevokedErr = await bob.waitFor(o => o.type === 'fillable_message_error');
  assert(bobRevokedErr.error.includes('permission'), '15. Revoked editor update rejected');

  // ==========================================
  // Test 16: Remove a user from a group
  // ==========================================
  // Add a 4th user Dave to group, assign field, then remove Dave from group
  const dave = connect();
  await auth(dave, 'dave');
  const dAuth = await dave.waitFor(o => o.type === 'auth_ok' || o.type === 'auth_success');
  const daveId = dAuth.userId || dAuth.user.id;

  alice.send({ type: 'add_group_member', conversationId: convId, userId: daveId });
  await alice.waitFor(o => o.type === 'member_added');

  // Create message assigning field to Dave
  alice.send({
    type: 'create_fillable_message',
    conversationId: convId,
    introText: 'Dave test message',
    fields: [
      {
        fieldId: 'fld_dave',
        label: 'Daves Field',
        fieldType: 'text',
        required: true,
        assignmentMode: 'custom',
        assignedUserIds: [daveId]
      }
    ]
  });
  const msgDaveEvt = await dave.waitFor(o => o.type === 'fillable_message_created');
  const msgDaveId = msgDaveEvt.messageId;

  // Now remove Dave from group
  alice.send({ type: 'remove_group_member', conversationId: convId, userId: daveId });
  await alice.waitFor(o => o.type === 'member_removed');

  // Dave attempts edit on his assigned field -> rejected because no longer in group!
  dave.send({
    type: 'update_fillable_field',
    messageId: msgDaveId,
    fieldId: 'fld_dave',
    value: 'Dave trying while removed',
    expectedFieldVersion: 0
  });
  const daveRemovedErr = await dave.waitFor(o => o.type === 'fillable_message_error');
  assert(daveRemovedErr.error.includes('not a member'), '16. Removed group member immediately rejected from editing');
  dave.close();

  // ==========================================
  // Test 17: Reconnect while a field is being edited
  // ==========================================
  console.log('\n--- Scenario G: Reconnect & Server Restart Durability ---');
  bob.close();
  await sleep(150);

  // Charlie updates field in msg2
  charlie.send({
    type: 'update_fillable_field',
    messageId: msg2Id,
    fieldId: 'fld_perm_test',
    value: 'Charlie edited while Bob offline',
    expectedFieldVersion: 0
  });
  await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_perm_test');

  // Bob reconnects
  const bob2 = connect();
  await auth(bob2, 'bob');
  bob2.send({ type: 'fetch_fillable_message', messageId: msg2Id });
  const bob2Fetch = await bob2.waitFor(o => o.type === 'fillable_message' && o.messageId === msg2Id);
  assert(bob2Fetch.fillable.fields[0].currentValue === 'Charlie edited while Bob offline', '17. Reconnected client receives current canonical state');

  // ==========================================
  // Test 22: Expired message rejects edits
  // ==========================================
  alice.send({
    type: 'create_fillable_message',
    conversationId: convId,
    introText: 'Expiring message',
    fields: [
      {
        fieldId: 'fld_exp',
        label: 'Expiring field',
        fieldType: 'text',
        assignmentMode: 'all'
      }
    ],
    finalizationSettings: {
      deadline: Math.floor(Date.now() / 1000) - 10 // Expired 10s ago
    }
  });
  const expCreated = await alice.waitFor(o => o.type === 'fillable_message_created' && o.message.text === 'Expiring message');
  const expMsgId = expCreated.messageId;

  charlie.send({
    type: 'update_fillable_field',
    messageId: expMsgId,
    fieldId: 'fld_exp',
    value: 'Attempt late edit',
    expectedFieldVersion: 0
  });
  const expErr = await charlie.waitFor(o => o.type === 'fillable_message_error');
  assert(expErr.error.includes('expired'), '22. Expired message rejects edits');

  // ==========================================
  // Test 23: Message history survives server restart
  // ==========================================
  console.log('\n--- Scenario H: Restart Durability & History Inspection ---');
  // Check history before restart
  alice.send({ type: 'fetch_fillable_history', messageId });
  const histBefore = await alice.waitFor(o => o.type === 'fillable_history');
  assert(histBefore.revisions.length >= 3, 'Audit history contains all field revisions');

  // Stop server
  alice.close();
  bob2.close();
  charlie.close();
  await sleep(200);
  stopServer();
  console.log('[Server] Stopped for restart test');

  // Restart server on same DB
  await sleep(300);
  await startServer();
  console.log('[Server] Restarted successfully with persistent DB');

  const aliceAfterRestart = connect();
  await auth(aliceAfterRestart, 'alice');
  aliceAfterRestart.send({ type: 'fetch_fillable_message', messageId });
  const restartedFetch = await aliceAfterRestart.waitFor(o => o.type === 'fillable_message' && o.messageId === messageId);
  assert(restartedFetch.fillable.fields[0].currentValue === 'Pune Railway Station Platform 1', '23. Message field values survive server restart');
  assert(restartedFetch.fillable.status === 'finalized', '23. Message status survives server restart');

  aliceAfterRestart.send({ type: 'fetch_fillable_history', messageId });
  const histAfter = await aliceAfterRestart.waitFor(o => o.type === 'fillable_history');
  assert(histAfter.revisions.length === histBefore.revisions.length, '23. Revision audit history survives server restart');

  aliceAfterRestart.close();
  await sleep(200);
  stopServer();

  try { fs.unlinkSync(DB); } catch (e) {}

  console.log('\n========================================================');
  console.log(` ALL 25 LCFM AUTOMATED TESTS PASSED! (${passed} assertions)`);
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('\nTEST FAILED WITH EXCEPTION:', err);
  stopServer();
  try { fs.unlinkSync(DB); } catch (e) {}
  process.exit(1);
});
