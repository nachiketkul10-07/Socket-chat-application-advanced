const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = 8123;
const DB = path.join(process.env.TEMP, 'bench_chat.db');
let serverProc;

function startServer(env) {
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..', 'backend'),
      env: { ...process.env, PORT: String(PORT), DB_PATH: DB, AUTH_POLICY: 'current_membership', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    serverProc.stdout.on('data', d => { out += d.toString(); if (out.includes('Server listening')) resolve(); });
    serverProc.stderr.on('data', d => { console.error('SRVERR', d.toString()); });
    setTimeout(() => reject(new Error('timeout ' + out)), 8000);
  });
}
function stopServer() { if (serverProc) { serverProc.kill(); serverProc = null; } try { fs.unlinkSync(DB); } catch(e){} }

function connect() {
  const s = net.createConnection(PORT, '127.0.0.1');
  let buf = '';
  const queue = []; const waiters = [];
  s.on('data', d => { buf += d.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i+1); if (!line) continue; const o = JSON.parse(line); const idx = waiters.findIndex(w => w.pred(o)); if (idx >= 0) { const w = waiters.splice(idx,1)[0]; w.resolve(o); } else queue.push(o); } });
  function send(o) { s.write(JSON.stringify(o)+'\n'); }
  function waitFor(pred, timeout=30000) { const qi = queue.findIndex(pred); if (qi >= 0) { const o = queue.splice(qi,1)[0]; return Promise.resolve(o); } return new Promise((resolve,reject) => { const timer = setTimeout(() => { const i = waiters.indexOf(w); if (i>=0) waiters.splice(i,1); reject(new Error('timeout')); }, timeout); const w = { pred, resolve: (o) => { clearTimeout(timer); resolve(o); } }; waiters.push(w); }); }
  function close() { s.end(); }
  return { s, send, waitFor, close };
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function auth(conn, username) { conn.send({ type: 'auth', username }); return conn.waitFor(o => o.type === 'auth_ok'); }

async function runRecovery(N, baseBatch, maxBatch) {
  await startServer({ RECOVERY_BASE_BATCH: String(baseBatch), RECOVERY_MAX_BATCH: String(maxBatch) });

  const alice = connect(); const bob = connect();
  await sleep(200);
  await auth(alice, 'alice'); await auth(bob, 'bob');
  alice.send({ type: 'create_group', title: 'G', members: ['bob'] });
  const gc = await alice.waitFor(o => o.type === 'group_created');
  const convId = gc.conversationId;
  await sleep(200);
  // send N messages
  const t0 = Date.now();
  for (let i = 1; i <= N; i++) {
    alice.send({ type: 'message', conversationId: convId, content: 'm' + i });
  }
  // wait for last message to be persisted: poll count via history
  await sleep(500);
  // bob recovers all
  const start = Date.now();
  let totalReceived = 0;
  let planId = null;
  let nextFrom = 1;
  let hasMore = true;
  let batches = 0;
  while (hasMore) {
    bob.send({ type: 'recover', conversationId: convId, fromSeq: nextFrom });
    const b = await bob.waitFor(o => o.type === 'recovery_batch');
    planId = b.planId;
    totalReceived += b.messages.length;
    hasMore = b.hasMore;
    nextFrom = b.nextSeq;
    batches++;
    // ack
    const last = b.messages.length ? b.messages[b.messages.length-1].seq : nextFrom-1;
    bob.send({ type: 'recover_ack', planId, conversationId: convId, ackedSeq: last });
    await bob.waitFor(o => o.type === 'recover_ack_ok');
  }
  const elapsed = Date.now() - start;
  bob.send({ type: 'recover_complete', planId, conversationId: convId });
  await bob.waitFor(o => o.type === 'recover_complete');
  alice.close(); bob.close();
  await sleep(300);
  stopServer();
  return { N, batchSize: baseBatch, maxBatch, batches, totalReceived, elapsedMs: elapsed, throughputMsgPerSec: Math.round((totalReceived / elapsed) * 1000) };
}

async function main() {
  const results = [];
  for (const bs of [25, 50, 100]) {
    console.log('Running N=1000 bs=' + bs);
    const r = await runRecovery(1000, bs, bs);
    console.log(JSON.stringify(r));
    results.push({ ...r, mode: 'fixed' });
    await sleep(500);
  }
  console.log('Running adaptive');
  const rA = await runRecovery(1000, 25, 100);
  console.log(JSON.stringify(rA));
  results.push({ ...rA, mode: 'adaptive' });
  fs.writeFileSync(path.join(__dirname, '..', 'patent', 'benchmark_results.json'), JSON.stringify(results, null, 2));
  console.log('RESULTS', JSON.stringify(results));
  process.exit(0);
}

main().catch(e => { console.error(e); stopServer(); process.exit(1); });
