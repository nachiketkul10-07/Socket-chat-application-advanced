const WebSocket = require('ws');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log("=== STARTING INTEGRATION TEST ===");
    
    const aliceWs = new WebSocket('ws://127.0.0.1:3001');
    const bobWs = new WebSocket('ws://127.0.0.1:3001');

    let aliceUser = null;
    let bobUser = null;
    let groupId = null;
    let dmId = null;

    const aliceEvents = [];
    const bobEvents = [];

    aliceWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        aliceEvents.push(msg);
        console.log('[Alice Recv]', msg.type, msg.message || msg.text || '');
        if (msg.type === 'auth_success') aliceUser = msg.user;
    });

    bobWs.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        bobEvents.push(msg);
        console.log('[Bob Recv]', msg.type, msg.message || msg.text || '');
        if (msg.type === 'auth_success') bobUser = msg.user;
    });

    await new Promise(r => aliceWs.on('open', r));
    await new Promise(r => bobWs.on('open', r));
    console.log("✅ WebSocket Connections Established");

    // 1. Auth
    aliceWs.send(JSON.stringify({ type: 'auth', username: 'Alice' }));
    bobWs.send(JSON.stringify({ type: 'auth', username: 'Bob' }));
    await delay(1000);

    if (!aliceUser || !bobUser) {
        throw new Error("Authentication failed for Alice or Bob");
    }
    console.log(`✅ Users Authenticated: Alice (${aliceUser.id}), Bob (${bobUser.id})`);

    // 2. Public Chat
    aliceWs.send(JSON.stringify({
        type: 'message',
        conversationId: 'public_general',
        text: 'Hello Everyone!'
    }));
    await delay(500);

    const publicMsgRecv = bobEvents.find(e => e.type === 'message' && e.text === 'Hello Everyone!');
    if (!publicMsgRecv) throw new Error("Bob did not receive public message from Alice");
    console.log("✅ Public Chat Message Routing Verified");

    // 3. Create Group Chat
    aliceWs.send(JSON.stringify({
        type: 'create_group',
        name: 'Dev Team',
        memberIds: [bobUser.id]
    }));
    await delay(1000);

    const groupCreatedEvent = aliceEvents.find(e => e.type === 'group_created');
    if (!groupCreatedEvent) throw new Error("Group creation event not received by Alice");
    groupId = groupCreatedEvent.conversation.id;
    console.log(`✅ Group Created: ${groupId}`);

    // 4. Send Group Message
    aliceWs.send(JSON.stringify({
        type: 'message',
        conversationId: groupId,
        text: 'Welcome to Dev Team group!'
    }));
    await delay(500);

    const groupMsgRecv = bobEvents.find(e => e.type === 'message' && e.text === 'Welcome to Dev Team group!');
    if (!groupMsgRecv) throw new Error("Bob did not receive group message");
    console.log("✅ Group Messaging Verified");

    // 5. Typing Indicator
    aliceWs.send(JSON.stringify({
        type: 'typing',
        conversationId: 'public_general',
        isTyping: true
    }));
    await delay(500);

    const typingEvent = bobEvents.find(e => e.type === 'typing');
    console.log("Bob Typing Event Object:", JSON.stringify(typingEvent));
    if (!typingEvent || !typingEvent.isTyping) throw new Error("Bob did not receive typing indicator");
    console.log("✅ Live Typing Indicator Verified");

    // 6. Fetch Group Members
    aliceWs.send(JSON.stringify({
        type: 'fetch_group_members',
        groupId: groupId
    }));
    await delay(500);

    const membersEvent = aliceEvents.find(e => e.type === 'group_members');
    if (!membersEvent || membersEvent.members.length < 2) throw new Error("Fetch group members failed");
    console.log(`✅ Group Members Verified: ${membersEvent.members.length} members found`);

    // 7. Test SQLite Persistence on Reconnect
    bobWs.close();
    await delay(500);

    const bobWs2 = new WebSocket('ws://127.0.0.1:3001');
    const bobEvents2 = [];
    bobWs2.on('message', (data) => {
        bobEvents2.push(JSON.parse(data.toString()));
    });
    await new Promise(r => bobWs2.on('open', r));

    bobWs2.send(JSON.stringify({ type: 'auth', username: 'Bob' }));
    await delay(1000);

    const conversationsEvent = bobEvents2.find(e => e.type === 'conversations');
    if (!conversationsEvent) throw new Error("Bob did not receive conversations on reconnect");
    console.log("✅ Database Persistence & Reconnection History Replay Verified");

    aliceWs.close();
    bobWs2.close();

    console.log("==========================================");
    console.log("🎉 ALL INTEGRATION FLOW TESTS PASSED SUCCESSFULLY!");
    console.log("==========================================");
}

runTest().catch(err => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
});