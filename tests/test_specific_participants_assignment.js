const WebSocket = require('../bridge/node_modules/ws');

function createClient(username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:3001');
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', username }));
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth_success') {
          resolve({ ws, user: msg.user });
        }
      } catch (e) {}
    });
    ws.on('error', reject);
  });
}

async function runTest() {
  console.log('--- Testing Specific Participants Append Permissions ---');
  const now = Date.now();
  const alice = await createClient('Alice_' + now);
  const bob = await createClient('Bob_' + now);
  const charlie = await createClient('Charlie_' + now);

  console.log('✓ All 3 clients authenticated.');

  // Step 1: Alice creates a message assigning ONLY Bob
  const messageId = await new Promise((resolve) => {
    alice.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'message' && msg.kind === 'collaborative_fillin' && msg.fromUserId === alice.user.id) {
        resolve(msg.id);
      }
    });

    alice.ws.send(JSON.stringify({
      type: 'create_fillable_message',
      conversationId: 'public_general',
      introText: 'Collaborative task for Bob only',
      fields: [],
      templateSegments: {
        mode: 'freeform',
        appendAssignmentMode: 'custom',
        appendAssignedUserIds: [bob.user.id]
      },
      finalizationSettings: {
        allowReopen: true,
        lockOnCompletion: true
      }
    }));
  });

  console.log('✓ Alice created collaborative message with ID:', messageId);

  // Step 2: Bob (assigned) appends a detail
  const bobAppendOk = await new Promise((resolve) => {
    bob.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'fillable_message_updated' && msg.messageId === messageId) {
        resolve(true);
      }
    });

    bob.ws.send(JSON.stringify({
      type: 'append_fillable_detail',
      messageId,
      label: 'Detail',
      value: 'Bob contribution'
    }));
  });

  console.log('✓ Bob (assigned) successfully appended detail!');

  // Step 3: Charlie (not assigned) attempts to append
  const charlieRejected = await new Promise((resolve) => {
    charlie.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'fillable_message_error' && msg.messageId === messageId) {
        resolve(msg.error);
      }
    });

    charlie.ws.send(JSON.stringify({
      type: 'append_fillable_detail',
      messageId,
      label: 'Detail',
      value: 'Charlie illegal contribution'
    }));
  });

  console.log('✓ Charlie was rejected as expected:', charlieRejected);

  alice.ws.close();
  bob.ws.close();
  charlie.ws.close();
  console.log('\n>>> SPECIFIC PARTICIPANTS PERMISSION TEST PASSED! <<<');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
