const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = 8099;
const DB = path.join(process.env.TEMP || 'C:\\\\tmp', 'test_chat_' + Date.now() + '.db');
let serverProc;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..', 'backend'),
      env: { ...process.env, PORT: String(PORT), DB_PATH: DB, AUTH_POLICY: 'current_membership' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    serverProc.stdout.on('data', d => { out += d.toString(); if (out.includes('Server listening')) resolve(); });
    serverProc.stderr.on('data', d => { console.error('SRVERR', d.toString()); });
    setTimeout(() => reject(new Error('server start timeout: ' + out)), 8000);
  });
}
function stopServer() {
  if (serverProc) { serverProc.kill(); serverProc = null; }
  try { fs.unlinkSync(DB); } catch (e) {}
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
      const o = JSON.parse(line);
      const idx = waiters.findIndex(w => w.pred(o));
      if (idx >= 0) { const w = waiters.splice(idx, 1)[0]; w.resolve(o); }
      else queue.push(o);
    }
  });
  function send(o) { s.write(JSON.stringify(o) + '\n'); }
  function waitFor(pred, timeout = 5000) {
    const qi = queue.findIndex(pred);
    if (qi >= 0) { const o = queue.splice(qi, 1)[0]; return Promise.resolve(o); }
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
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error('FAIL:', msg); throw new Error(msg); }
  else { passed++; }
}
async function auth(conn, username) {
  conn.send({ type: 'auth', username });
  const ok = await conn.waitFor(o => o.type === 'auth_ok');
  return ok;
}
async function main() {
  await startServer();
  console.log('Server started');
  const alice = connect();
  const bob = connect();
  await sleep(200);
  await auth(alice, 'alice');
  await auth(bob, 'bob');
  alice.send({ type: 'create_group', title: 'G1', members: ['bob'] });
  const gc = await alice.waitFor(o => o.type === 'group_created');
  const convId = gc.conversationId;
  await sleep(200);
  for (let i = 1; i <= 5; i++) {
    alice.send({ type: 'message', conversationId: convId, content: 'msg' + i });
    await sleep(50);
  }
  await sleep(300);
  bob.send({ type: 'recover', conversationId: convId, fromSeq: 1 });
  const batch = await bob.waitFor(o => o.type === 'recovery_batch');
  assert(batch.messages.length >= 5, 'expected >=5 messages, got ' + batch.messages.length);
  assert(batch.planId, 'planId present');
  const lastSeq = batch.messages[batch.messages.length - 1].seq;
  bob.send({ type: 'recover_ack', planId: batch.planId, conversationId: convId, ackedSeq: lastSeq });
  await bob.waitFor(o => o.type === 'recover_ack_ok');
  bob.send({ type: 'recover_complete', planId: batch.planId, conversationId: convId });
  await bob.waitFor(o => o.type === 'recover_complete');
  bob.send({ type: 'get_cursor', conversationId: convId });
  const cur = await bob.waitFor(o => o.type === 'cursor');
  assert(cur.cursor === 5, 'cursor should be 5, got ' + cur.cursor);
  console.log('Scenario1 PASS');

  const carol = connect();
  await sleep(200);
  await auth(carol, 'carol');
  alice.send({ type: 'add_member', conversationId: convId, username: 'carol' });
  await alice.waitFor(o => o.type === 'member_added');
  await sleep(300);
  carol.send({ type: 'recover', conversationId: convId, fromSeq: 1 });
  const b2 = await carol.waitFor(o => o.type === 'recovery_batch');
  carol.send({ type: 'recover_ack', planId: b2.planId, conversationId: convId, ackedSeq: b2.messages[b2.messages.length-1].seq, missingRanges: [{startSeq:2, endSeq:3}] });
  await carol.waitFor(o => o.type === 'recover_ack_ok');
  console.log('Scenario2 PASS');

  const dave = connect();
  await sleep(200);
  await auth(dave, 'dave');
  alice.send({ type: 'add_member', conversationId: convId, username: 'dave' });
  await alice.waitFor(o => o.type === 'member_added');
  await sleep(200);
  dave.send({ type: 'recover', conversationId: convId, fromSeq: 1 });
  const b3 = await dave.waitFor(o => o.type === 'recovery_batch');
  alice.send({ type: 'remove_member', conversationId: convId, username: 'dave' });
  await alice.waitFor(o => o.type === 'member_removed');
  await sleep(200);
  dave.send({ type: 'recover_ack', planId: b3.planId, conversationId: convId, ackedSeq: b3.messages[0].seq });
  let got = await dave.waitFor(o => o.type === 'recover_invalidate' || o.type === 'recover_ack_ok' || o.type === 'error', 3000).catch(e => ({type:'timeout'}));
  console.log('Scenario3 got:', got.type, got.reason || '');
  assert(got.type === 'recover_invalidate' || got.type === 'error', 'expected invalidation/error, got ' + got.type);
  console.log('Scenario3 PASS');

  // Scenario 4: incremental recovery with cursor
  const eve = connect();
  await sleep(200);
  await auth(eve, 'eve');
  alice.send({ type: 'add_member', conversationId: convId, username: 'eve' });
  await alice.waitFor(o => o.type === 'member_added');
  await sleep(200);
  // eve recovers first 2 only
  eve.send({ type: 'recover', conversationId: convId, fromSeq: 1, toSeq: 2 });
  const b4 = await eve.waitFor(o => o.type === 'recovery_batch');
  assert(b4.messages.length === 2, 'expected 2 messages, got ' + b4.messages.length);
  eve.send({ type: 'recover_ack', planId: b4.planId, conversationId: convId, ackedSeq: 2 });
  await eve.waitFor(o => o.type === 'recover_ack_ok');
  eve.send({ type: 'recover_complete', planId: b4.planId, conversationId: convId });
  await eve.waitFor(o => o.type === 'recover_complete');
  // second recovery from cursor
  eve.send({ type: 'recover', conversationId: convId, fromSeq: 3 });
  const b5 = await eve.waitFor(o => o.type === 'recovery_batch');
  assert(b5.messages.length >= 3, 'expected >=3 messages, got ' + b5.messages.length);
  console.log('Scenario4 PASS');

  console.log('ALL SCENARIOS DONE. passed assertions:', passed);
  alice.close(); bob.close(); carol.close(); dave.close(); eve.close();
  await sleep(500);
  stopServer();
  process.exit(failed > 0 ? 1 : 0);
}
main().catch(e => { console.error('TEST ERROR:', e.message); stopServer(); process.exit(1); });

