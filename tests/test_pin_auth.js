// tests/test_pin_auth.js
// Automated verification of PIN-based User Profile Protection
const net = require('net');
const assert = require('assert');

const TCP_PORT = 8080;
const TCP_HOST = '127.0.0.1';

function createClient() {
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
      send(obj) {
        socket.write(JSON.stringify(obj) + '\n');
      },
      waitFor(predicate, timeout = 4000) {
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
        try { socket.destroy(); } catch (e) {}
      }
    };

    socket.on('connect', () => resolve(client));
    socket.on('error', reject);
  });
}

async function run() {
  console.log('========================================================');
  console.log('--- Testing PIN Authentication & Profile Security ---');
  console.log('========================================================');

  const ts = Date.now();
  const aliceUsername = `Alice_PinSec_${ts}`;
  const alicePin = '4321';
  const wrongPin = '9999';

  // [Step 1] Alice registers with Username and secret PIN
  console.log(`[Step 1] Registering user "${aliceUsername}" with PIN "${alicePin}"...`);
  const client1 = await createClient();
  client1.send({
    type: 'auth',
    username: aliceUsername,
    pin: alicePin
  });

  const auth1 = await client1.waitFor(m => m.type === 'auth_success' || m.type === 'auth_ok');
  assert(auth1, 'Alice registration with PIN must succeed');
  console.log(`✓ Alice successfully registered and authenticated!`);
  client1.close();

  // [Step 2] Attacker attempts to log into Alice profile with WRONG PIN
  console.log(`[Step 2] Attacker attempts login as "${aliceUsername}" with WRONG PIN "${wrongPin}"...`);
  const attacker1 = await createClient();
  attacker1.send({
    type: 'auth',
    username: aliceUsername,
    pin: wrongPin
  });

  const fail1 = await attacker1.waitFor(m => m.type === 'auth_failed');
  assert.strictEqual(fail1.code, 'invalid_pin', 'Expected invalid_pin error code');
  console.log(`✓ Access correctly REJECTED with message: "${fail1.error}"`);
  attacker1.close();

  // [Step 3] Attacker attempts to log into Alice profile with NO PIN
  console.log(`[Step 3] Attacker attempts login as "${aliceUsername}" with NO PIN...`);
  const attacker2 = await createClient();
  attacker2.send({
    type: 'auth',
    username: aliceUsername
  });

  const fail2 = await attacker2.waitFor(m => m.type === 'auth_failed');
  assert.strictEqual(fail2.code, 'pin_required', 'Expected pin_required error code');
  console.log(`✓ Access correctly REJECTED with message: "${fail2.error}"`);
  attacker2.close();

  // [Step 4] Alice logs in with the CORRECT PIN
  console.log(`[Step 4] Alice logs in with the CORRECT PIN "${alicePin}"...`);
  const client2 = await createClient();
  client2.send({
    type: 'auth',
    username: aliceUsername,
    pin: alicePin
  });

  const auth2 = await client2.waitFor(m => m.type === 'auth_success' || m.type === 'auth_ok');
  assert(auth2, 'Alice login with correct PIN must succeed');
  console.log(`✓ Alice successfully unlocked profile with correct PIN!`);
  client2.close();

  // [Step 5] Second user Bob registers with his own PIN
  const bobUsername = `Bob_PinSec_${ts}`;
  const bobPin = '8888';
  console.log(`[Step 5] Registering Bob as "${bobUsername}" with PIN "${bobPin}"...`);
  const bobClient = await createClient();
  bobClient.send({
    type: 'auth',
    username: bobUsername,
    pin: bobPin
  });

  const bobAuth = await bobClient.waitFor(m => m.type === 'auth_success');
  assert(bobAuth, 'Bob registration must succeed');
  console.log(`✓ Bob successfully registered!`);
  bobClient.close();

  // [Step 6] Cross-user attempt: Attacker uses Alice's PIN against Bob's profile
  console.log(`[Step 6] Attacker attempts login to Bob's profile using Alice's PIN...`);
  const crossAttacker = await createClient();
  crossAttacker.send({
    type: 'auth',
    username: bobUsername,
    pin: alicePin
  });

  const crossFail = await crossAttacker.waitFor(m => m.type === 'auth_failed');
  assert.strictEqual(crossFail.code, 'invalid_pin');
  console.log(`✓ Cross-user login attempt blocked as expected!`);
  crossAttacker.close();

  console.log('========================================================');
  console.log('>>> ALL PIN SECURITY & PROFILE LOCK TESTS PASSED! <<<');
  console.log('========================================================');
  process.exit(0);
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});

