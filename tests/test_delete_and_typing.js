// tests/test_delete_and_typing.js
// Automated verification of "Delete for Me", "Delete for Everyone", and Live Typing Indicators
const net = require('net');
const assert = require('assert');

const TCP_PORT = 8080;
const TCP_HOST = '127.0.0.1';

function createClient(username) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: TCP_HOST, port: TCP_PORT });
    let buffer = '';
    const listeners = [];

    socket.on('data', data => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line.trim());
          for (const l of [...listeners]) {
            l(msg);
          }
        } catch (e) {}
      }
    });

    const client = {
      socket,
      username,
      userId: null,
      send(obj) {
        socket.write(JSON.stringify(obj) + '\n');
      },
      waitFor(predicate, timeout = 5000) {
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            const idx = listeners.indexOf(handler);
            if (idx >= 0) listeners.splice(idx, 1);
            rej(new Error(`Timeout waiting for message matching predicate (${timeout}ms)`));
          }, timeout);

          function handler(msg) {
            if (predicate(msg)) {
              clearTimeout(timer);
              const idx = listeners.indexOf(handler);
              if (idx >= 0) listeners.splice(idx, 1);
              res(msg);
            }
          }
          listeners.push(handler);
        });
      },
      close() {
        socket.destroy();
      }
    };

    socket.on('connect', async () => {
      client.send({ type: 'auth', username });
      const authOk = await client.waitFor(m => m.type === 'auth_ok' || m.type === 'auth_success');
      client.userId = authOk.userId || authOk.user.id;
      resolve(client);
    });

    socket.on('error', reject);
  });
}

async function run() {
  console.log('--- Testing Delete Message & Live Typing Indicator ---');

  const userAlice = await createClient('Alice_Del_' + Date.now());
  const userBob = await createClient('Bob_Del_' + Date.now());

  // 1. Test Live Typing Indicator
  console.log('[Test 1] Testing live typing broadcast...');
  userAlice.send({
    type: 'typing',
    conversationId: 'public_general',
    isTyping: true
  });

  const typingEvt = await userBob.waitFor(m => m.type === 'typing' && m.conversationId === 'public_general' && m.username === userAlice.username);
  assert.strictEqual(typingEvt.isTyping, true, 'Bob should receive typing: true from Alice');
  console.log('✓ Bob received Alice typing indicator with username:', typingEvt.username);

  // 2. Alice sends a test message to public_general
  console.log('[Test 2] Alice sends a message...');
  userAlice.send({
    type: 'message',
    conversationId: 'public_general',
    text: 'Secret note to delete'
  });

  const aliceMsg = await userBob.waitFor(m => m.type === 'message' && m.text === 'Secret note to delete');
  const messageId = aliceMsg.id;
  assert.ok(messageId, 'Message ID should exist');
  console.log('✓ Message created with ID:', messageId);

  // 3. Test "Delete for Me" by Bob
  console.log('[Test 3] Testing "Delete for Me" by Bob...');
  userBob.send({
    type: 'delete_message',
    messageId,
    conversationId: 'public_general',
    deleteMode: 'for_me'
  });

  const bobDelAck = await userBob.waitFor(m => m.type === 'message_deleted' && m.deleteMode === 'for_me');
  assert.strictEqual(bobDelAck.messageId, messageId);
  console.log('✓ Bob received delete_for_me ack');

  // Verify Bob does not see message in history, but Alice does
  userBob.send({ type: 'fetch_history', conversationId: 'public_general', limit: 20 });
  const bobHistory = await userBob.waitFor(m => m.type === 'history' && m.conversationId === 'public_general');
  const bobHasIt = bobHistory.messages.some(m => m.id === messageId);
  assert.strictEqual(bobHasIt, false, 'Bob history must NOT contain deleted-for-me message');
  console.log('✓ Message successfully excluded from Bob history');

  userAlice.send({ type: 'fetch_history', conversationId: 'public_general', limit: 20 });
  const aliceHistory = await userAlice.waitFor(m => m.type === 'history' && m.conversationId === 'public_general');
  const aliceHasIt = aliceHistory.messages.some(m => m.id === messageId);
  assert.strictEqual(aliceHasIt, true, 'Alice history MUST still contain message after Bob deleted for me');
  console.log('✓ Alice history still retains message');

  // 4. Test "Delete for Everyone" by Alice (sender)
  console.log('[Test 4] Testing "Delete for Everyone" by Alice (original sender)...');
  userAlice.send({
    type: 'delete_message',
    messageId,
    conversationId: 'public_general',
    deleteMode: 'for_everyone'
  });

  const delEveryoneEvt = await userAlice.waitFor(m => m.type === 'message_deleted' && m.deleteMode === 'for_everyone');
  assert.strictEqual(delEveryoneEvt.messageId, messageId);
  console.log('✓ Alice received delete_for_everyone broadcast');

  // Alice checks history to verify text is updated to deleted banner
  userAlice.send({ type: 'fetch_history', conversationId: 'public_general', limit: 20 });
  const aliceHistoryAfter = await userAlice.waitFor(m => m.type === 'history' && m.conversationId === 'public_general');
  const deletedMsg = aliceHistoryAfter.messages.find(m => m.id === messageId);
  assert.ok(deletedMsg, 'Message record should exist');
  assert.strictEqual(deletedMsg.text, '🚫 This message was deleted', 'Text should be updated to deleted notice');
  assert.strictEqual(deletedMsg.kind, 'deleted', 'Kind should be deleted');
  console.log('✓ Message marked deleted for everyone in database:', deletedMsg.text);

  userAlice.close();
  userBob.close();
  console.log('\n>>> ALL DELETE & TYPING TESTS PASSED SUCCESSFULLY! <<<');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
