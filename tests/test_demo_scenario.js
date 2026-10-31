// tests/test_demo_scenario.js
// Validates Section 17: Demonstration Scenario (Alice, Bob, Charlie in "Weekend Trip")
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = 8350;
const DB = path.join(process.env.TEMP || 'C:\\\\tmp', 'demo_lcfm_' + Date.now() + '.db');
let serverProc = null;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..', 'backend'),
      env: { ...process.env, PORT: String(PORT), DB_PATH: DB },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    serverProc.stdout.on('data', d => {
      out += d.toString();
      if (out.includes('Server listening')) resolve();
    });
    setTimeout(() => reject(new Error('server start timeout: ' + out)), 8000);
  });
}

function stopServer() {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
  try { fs.unlinkSync(DB); } catch (e) {}
}

function connect() {
  const s = net.createConnection(PORT, '127.0.0.1');
  s.on('error', () => {}); // swallow socket errors on teardown
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

  function waitFor(pred, timeout = 7000) {
    const qi = queue.findIndex(pred);
    if (qi >= 0) {
      const o = queue.splice(qi, 1)[0];
      return Promise.resolve(o);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) waiters.splice(i, 1);
        reject(new Error('waitFor timeout'));
      }, timeout);
      const w = { pred, resolve: (o) => { clearTimeout(timer); resolve(o); } };
      waiters.push(w);
    });
  }

  function close() { s.end(); }

  return { s, send, waitFor, close };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function auth(conn, username) {
  conn.send({ type: 'auth', username });
  const ok = await conn.waitFor(o => o.type === 'auth_ok' || o.type === 'auth_success');
  return ok.userId || ok.user.id;
}

let passed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    throw new Error(msg);
  }
  passed++;
  console.log('  PASS:', msg);
}

async function runDemoScenario() {
  console.log('========================================================');
  console.log(' Running Demonstration Scenario (Section 17)');
  console.log('========================================================\n');

  await startServer();

  // 1. Three users: Alice, Bob, Charlie
  const alice = connect();
  const bob = connect();
  const charlie = connect();

  const aliceId = await auth(alice, 'Alice');
  const bobId = await auth(bob, 'Bob');
  const charlieId = await auth(charlie, 'Charlie');

  console.log(`[Step 1] Alice (${aliceId}), Bob (${bobId}), Charlie (${charlieId}) connected.`);

  // 2. Group: Weekend Trip
  alice.send({
    type: 'create_group',
    name: 'Weekend Trip',
    memberIds: [bobId, charlieId]
  });
  const grpCreated = await alice.waitFor(o => o.type === 'group_created');
  const convId = grpCreated.conversationId;
  console.log(`[Step 2] Group "Weekend Trip" created (convId: ${convId}).`);
  await sleep(150);

  // 3. Alice creates a Live Fill-in Message
  console.log('[Step 3] Alice creates Live Fill-in Message...');
  alice.send({
    type: 'create_fillable_message',
    conversationId: convId,
    introText: "Let's finalize the weekend trip details.",
    templateSegments: [
      { type: 'text', content: 'Pickup: ' },
      { type: 'field', fieldId: 'fld_pickup' },
      { type: 'text', content: ' | Departure: ' },
      { type: 'field', fieldId: 'fld_depart' },
      { type: 'text', content: ' | Budget: ' },
      { type: 'field', fieldId: 'fld_budget' },
      { type: 'text', content: ' | Participants: ' },
      { type: 'field', fieldId: 'fld_count' }
    ],
    fields: [
      {
        fieldId: 'fld_pickup',
        label: 'Pickup Location',
        fieldType: 'text',
        required: true,
        assignmentMode: 'custom',
        assignedUserIds: [bobId]
      },
      {
        fieldId: 'fld_depart',
        label: 'Departure Time',
        fieldType: 'time',
        required: true,
        assignmentMode: 'custom',
        assignedUserIds: [charlieId]
      },
      {
        fieldId: 'fld_budget',
        label: 'Total Budget',
        fieldType: 'number',
        required: true,
        assignmentMode: 'custom',
        assignedUserIds: [bobId, charlieId]
      },
      {
        fieldId: 'fld_count',
        label: 'Participant Count',
        fieldType: 'number',
        required: true,
        assignmentMode: 'custom',
        assignedUserIds: [aliceId]
      }
    ],
    finalizationSettings: {
      requireAllMandatory: true,
      allowReopen: true,
      lockOnCompletion: true,
      finalizePermission: 'creator_only'
    }
  });

  const aEvt = await alice.waitFor(o => o.type === 'fillable_message_created');
  const bEvt = await bob.waitFor(o => o.type === 'fillable_message_created');
  const cEvt = await charlie.waitFor(o => o.type === 'fillable_message_created');

  const messageId = aEvt.messageId;
  assert(messageId === bEvt.messageId && messageId === cEvt.messageId, 'All 3 users see the exact same message ID');
  console.log(`[Step 3] Message ID: ${messageId}`);

  // Check permissions:
  // Bob: can edit Pickup (yes), Budget (yes), Departure (NO)
  const bPayload = bEvt.message.fillable;
  assert(bPayload.fields.find(f => f.fieldId === 'fld_pickup').canCurrentUserEdit === true, 'Bob CAN edit Pickup Location');
  assert(bPayload.fields.find(f => f.fieldId === 'fld_budget').canCurrentUserEdit === true, 'Bob CAN edit Total Budget');
  assert(bPayload.fields.find(f => f.fieldId === 'fld_depart').canCurrentUserEdit === false, 'Bob CANNOT edit Departure Time');

  // Charlie: can edit Departure (yes), Budget (yes), Pickup (NO)
  const cPayload = cEvt.message.fillable;
  assert(cPayload.fields.find(f => f.fieldId === 'fld_depart').canCurrentUserEdit === true, 'Charlie CAN edit Departure Time');
  assert(cPayload.fields.find(f => f.fieldId === 'fld_budget').canCurrentUserEdit === true, 'Charlie CAN edit Total Budget');
  assert(cPayload.fields.find(f => f.fieldId === 'fld_pickup').canCurrentUserEdit === false, 'Charlie CANNOT edit Pickup Location');

  // 4. Bob enters Pickup Location: "Pune Station"
  console.log('[Step 4] Bob enters: Pickup Location: "Pune Station"...');
  bob.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_pickup',
    value: 'Pune Station',
    expectedFieldVersion: 0,
    clientMutationId: 'mut_bob_pickup'
  });

  const aPickupUpd = await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_pickup');
  const cPickupUpd = await charlie.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_pickup');
  assert(aPickupUpd.fillable.fields.find(f => f.fieldId === 'fld_pickup').currentValue === 'Pune Station', 'Alice sees Bob update in real time');
  assert(cPickupUpd.fillable.fields.find(f => f.fieldId === 'fld_pickup').currentValue === 'Pune Station', 'Charlie sees Bob update in real time');

  // 5. Charlie enters Departure Time: "7:30 AM"
  console.log('[Step 5] Charlie enters: Departure Time: "7:30 AM"...');
  charlie.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_depart',
    value: '7:30 AM',
    expectedFieldVersion: 0,
    clientMutationId: 'mut_charlie_depart'
  });

  const aDepartUpd = await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_depart');
  const bDepartUpd = await bob.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_depart');
  assert(aDepartUpd.fillable.fields.find(f => f.fieldId === 'fld_depart').currentValue === '7:30 AM', 'Alice sees Charlie update in real time');
  assert(bDepartUpd.fillable.fields.find(f => f.fieldId === 'fld_depart').currentValue === '7:30 AM', 'Bob sees Charlie update in real time');

  // 6. Bob enters Total Budget: 1500
  console.log('[Step 6] Bob enters Total Budget: 1500...');
  bob.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_budget',
    value: 1500,
    expectedFieldVersion: 0,
    clientMutationId: 'mut_bob_budget'
  });
  await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_budget');

  // 7. Alice enters Participant Count: 4
  console.log('[Step 7] Alice enters Participant Count: 4...');
  alice.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_count',
    value: 4,
    expectedFieldVersion: 0,
    clientMutationId: 'mut_alice_count'
  });
  const finalFieldUpd = await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fieldId === 'fld_count');
  assert(finalFieldUpd.status === 'ready', 'All 4 fields complete -> message status is READY');
  assert(finalFieldUpd.fillable.progress.percentage === 100, 'Completion progress is 100%');

  // Verify conversation message count: exactly 1 message
  alice.send({ type: 'fetch_history', conversationId: convId });
  const hist = await alice.waitFor(o => o.type === 'history' && o.conversationId === convId);
  assert(hist.messages.length === 1, 'Nobody sent separate chat messages (timeline message count remains 1)');
  assert(hist.messages[0].id === messageId, 'Original message retains identical ID and position');

  // 8. Alice finalizes the message
  console.log('[Step 8] Alice finalizes the message...');
  alice.send({ type: 'finalize_fillable_message', messageId });

  const aFin = await alice.waitFor(o => o.type === 'fillable_message_finalized');
  const bFin = await bob.waitFor(o => o.type === 'fillable_message_finalized');
  const cFin = await charlie.waitFor(o => o.type === 'fillable_message_finalized');

  assert(aFin.fillable.status === 'finalized', 'Alice sees message status FINALIZED');
  assert(bFin.fillable.status === 'finalized', 'Bob sees message status FINALIZED');
  assert(cFin.fillable.status === 'finalized', 'Charlie sees message status FINALIZED');

  // Card is now read-only: all 3 users have canCurrentUserEdit = false
  assert(bFin.fillable.fields.every(f => f.canCurrentUserEdit === false), 'Bob view is locked/read-only');
  assert(cFin.fillable.fields.every(f => f.canCurrentUserEdit === false), 'Charlie view is locked/read-only');

  // Attempting an edit after finalization is rejected
  bob.send({
    type: 'update_fillable_field',
    messageId,
    fieldId: 'fld_pickup',
    value: 'Late Change',
    expectedFieldVersion: 1
  });
  const postErr = await bob.waitFor(o => o.type === 'fillable_message_error');
  assert(postErr.error.includes('finalized'), 'Post-finalization edit rejected');

  alice.close();
  bob.close();
  charlie.close();
  stopServer();

  console.log('\n========================================================');
  console.log(` DEMONSTRATION SCENARIO COMPLETE & VERIFIED! (${passed} assertions)`);
  console.log('========================================================\n');
}

runDemoScenario().catch(err => {
  console.error('DEMO SCENARIO FAILED:', err);
  stopServer();
  process.exit(1);
});
