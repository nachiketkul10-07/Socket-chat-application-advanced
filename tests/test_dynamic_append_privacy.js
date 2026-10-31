// tests/test_dynamic_append_privacy.js
// Verifies dynamic field appending and creator-only attribution privacy
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = 8390;
const DB = path.join(process.env.TEMP || 'C:\\\\tmp', 'test_privacy_' + Date.now() + '.db');
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
    setTimeout(() => reject(new Error('server start timeout')), 7000);
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
  s.on('error', () => {});
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

  function close() { s.destroy(); }

  return { s, send, waitFor, close };
}

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
}

async function run() {
  console.log('Testing Dynamic Append & Creator-Only Attribution Privacy...');
  await startServer();

  const alice = connect();
  const bob = connect();
  const charlie = connect();

  const aId = await auth(alice, 'Alice_' + Date.now());
  const bId = await auth(bob, 'Bob_' + Date.now());
  const cId = await auth(charlie, 'Charlie_' + Date.now());

  // Create group
  alice.send({
    type: 'create_group',
    name: 'Privacy Group',
    memberIds: [bId, cId]
  });
  const grp = await alice.waitFor(o => o.type === 'group_created');
  const convId = grp.conversation.id;

  // Alice creates empty collaborative message
  alice.send({
    type: 'create_fillable_message',
    conversationId: convId,
    introText: 'Please share your details below',
    fields: []
  });

  const aCreated = await alice.waitFor(o => o.type === 'fillable_message_created');
  const messageId = aCreated.message.id;
  assert(aCreated.message.fillable.fields.length === 0, 'Message created with 0 pre-defined fields');

  // Bob appends PRN
  bob.send({
    type: 'append_fillable_detail',
    messageId,
    label: 'PRN',
    value: '1251076777',
    clientMutationId: 'mut_bob_prn'
  });

  const aBobUpdate = await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fillable.fields.length === 1);
  const cBobUpdate = await charlie.waitFor(o => o.type === 'fillable_message_updated' && o.fillable.fields.length === 1);
  const bBobUpdate = await bob.waitFor(o => o.type === 'fillable_message_updated' && o.fillable.fields.length === 1);

  // 1. Creator (Alice) sees that Bob edited it!
  assert(aBobUpdate.fillable.isCreator === true, 'Alice is identified as Creator');
  assert(aBobUpdate.fillable.fields[0].lastEditorUsername.startsWith('Bob_'), 'Alice (Creator) CAN see Bob added PRN');
  assert(aBobUpdate.fillable.fields[0].currentValue === '1251076777', 'Field value matches for Alice');

  // 2. Charlie (Other Participant) sees the detail, but NOT who added it!
  assert(cBobUpdate.fillable.isCreator === false, 'Charlie is NOT Creator');
  assert(cBobUpdate.fillable.fields[0].currentValue === '1251076777', 'Charlie CAN see the PRN value');
  assert(cBobUpdate.fillable.fields[0].lastEditorUsername === null, 'Charlie CANNOT see who added Bob PRN (username is null)');
  assert(cBobUpdate.fillable.fields[0].lastEditorId === null, 'Charlie CANNOT see who added Bob PRN (id is null)');

  // 3. Bob (Author) sees it is his own contribution
  assert(bBobUpdate.fillable.fields[0].isOwnContribution === true, 'Bob recognizes his own contribution');
  assert(bBobUpdate.fillable.fields[0].lastEditorUsername === 'You', 'Bob sees (You)');

  // Charlie appends Pickup Location
  charlie.send({
    type: 'append_fillable_detail',
    messageId,
    label: 'Pickup',
    value: 'Swargate',
    clientMutationId: 'mut_char_pickup'
  });

  const aCharlieUpdate = await alice.waitFor(o => o.type === 'fillable_message_updated' && o.fillable.fields.length === 2);
  const bCharlieUpdate = await bob.waitFor(o => o.type === 'fillable_message_updated' && o.fillable.fields.length === 2);

  // Alice sees Charlie on field 2
  assert(aCharlieUpdate.fillable.fields[1].lastEditorUsername.startsWith('Charlie_'), 'Alice (Creator) sees Charlie on field 2');

  // Bob CANNOT see Charlie on field 2
  assert(bCharlieUpdate.fillable.fields[1].lastEditorUsername === null, 'Bob CANNOT see Charlie on field 2');
  assert(bCharlieUpdate.fillable.fields[1].currentValue === 'Swargate', 'Bob sees Swargate value');

  alice.close();
  bob.close();
  charlie.close();
  stopServer();

  console.log(`\nDYNAMIC APPEND & PRIVACY TEST PASSED! (${passed} assertions)\n`);
}

run().catch(err => {
  console.error('TEST FAILED:', err);
  stopServer();
  process.exit(1);
});
