// tests/test_live_multiclient_ws.js
// Tests end-to-end WebSocket real-time delivery without refresh between two clients
const WebSocket = require('../bridge/node_modules/ws');
const assert = require('assert');

const WS_URL = 'ws://127.0.0.1:3001';

function createWsClient(username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const listeners = [];

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', username }));
    });

    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());
        for (const l of [...listeners]) {
          l(msg);
        }
      } catch (e) {}
    });

    const client = {
      ws,
      username,
      userId: null,
      send(obj) {
        ws.send(JSON.stringify(obj));
      },
      waitFor(predicate, timeout = 5000) {
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            const idx = listeners.indexOf(handler);
            if (idx >= 0) listeners.splice(idx, 1);
            rej(new Error(`Timeout waiting for predicate (${timeout}ms)`));
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
        ws.close();
      }
    };

    client.waitFor(m => m.type === 'auth_success').then(auth => {
      client.userId = auth.user.id;
      resolve(client);
    }).catch(reject);

    ws.on('error', reject);
  });
}

async function run() {
  console.log('--- Testing Multi-Client Real-Time WebSocket Delivery ---');

  const clientA = await createWsClient('TesterA_' + Date.now());
  console.log('✓ Client A connected and authenticated:', clientA.username);

  const clientB = await createWsClient('TesterB_' + Date.now());
  console.log('✓ Client B connected and authenticated:', clientB.username);

  // 1. Text Message Real-Time Delivery
  console.log('[Step 1] Client A sends message in public_general...');
  clientA.send({
    type: 'message',
    conversationId: 'public_general',
    text: 'Real-time test message 123'
  });

  const msgOnB = await clientB.waitFor(m => m.type === 'message' && m.text === 'Real-time test message 123');
  assert.ok(msgOnB, 'Client B should receive message instantly without refresh');
  console.log('✓ Client B received message in real-time! Message ID:', msgOnB.id);

  // 2. Typing Indicator Real-Time Delivery
  console.log('[Step 2] Client B starts typing...');
  clientB.send({
    type: 'typing',
    conversationId: 'public_general',
    isTyping: true
  });

  const typingOnA = await clientA.waitFor(m => m.type === 'typing' && m.username === clientB.username);
  assert.strictEqual(typingOnA.isTyping, true);
  console.log('✓ Client A received typing indicator in real-time from:', typingOnA.username);

  // 3. Collaborative Living Message Real-Time Delivery
  console.log('[Step 3] Client A creates Live Collaborative Message...');
  clientA.send({
    type: 'create_fillable_message',
    conversationId: 'public_general',
    introText: 'Collaborative Sign-up Sheet',
    templateSegments: [{ type: 'text', content: 'Sign-up:' }],
    fields: [
      {
        fieldId: 'field_1',
        label: 'Name',
        fieldType: 'text',
        placeholder: 'Your name',
        required: true,
        assignmentMode: 'all'
      }
    ],
    finalizationSettings: {}
  });

  const collabMsgOnB = await clientB.waitFor(m => m.type === 'message' && m.kind === 'collaborative_fillin');
  assert.ok(collabMsgOnB.fillable, 'Client B should receive collaborative fillable payload');
  const collabId = collabMsgOnB.id;
  console.log('✓ Client B received Live Collaborative Message in real-time! ID:', collabId);

  // 4. Client B Appends Detail Real-Time
  console.log('[Step 4] Client B appends a detail...');
  await new Promise(r => setTimeout(r, 100));
  clientB.send({
    type: 'append_fillable_detail',
    messageId: collabId,
    label: 'Location',
    value: 'Pune Campus',
    clientMutationId: 'mut_' + Date.now()
  });

  const updateOnA = await clientA.waitFor(m => m.type === 'fillable_message_updated' && m.messageId === collabId);
  assert.ok(updateOnA.fillable, 'Client A should receive fillable_message_updated payload');
  console.log('✓ Client A received fillable_message_updated in real-time!');

  // 5. Client A Deletes for Everyone Real-Time
  console.log('[Step 5] Client A deletes message for everyone...');
  clientA.send({
    type: 'delete_message',
    messageId: msgOnB.id,
    conversationId: 'public_general',
    deleteMode: 'for_everyone'
  });

  const delOnB = await clientB.waitFor(m => m.type === 'message_deleted' && m.messageId === msgOnB.id && m.deleteMode === 'for_everyone');
  assert.ok(delOnB, 'Client B should receive message_deleted event in real-time');
  console.log('✓ Client B received message_deleted in real-time!');

  clientA.close();
  clientB.close();
  console.log('\n>>> MULTI-CLIENT REAL-TIME WEBSOCKET SUITE PASSED! <<<');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
