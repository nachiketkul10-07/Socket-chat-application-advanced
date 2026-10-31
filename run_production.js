// run_production.js - Production Runner for Cloud & Container Deployments
// Spawns the TCP Chat Backend and the WebSocket+HTTP Production Bridge
const { spawn } = require('child_process');
const path = require('path');

const root = __dirname;
const TCP_PORT = process.env.TCP_PORT || '8080';
const PORT = process.env.PORT || process.env.WS_PORT || '3001';

console.log('========================================================');
console.log('   Starting Socket Chat Application (Production Mode)   ');
console.log('========================================================');
console.log(`[Config] Public Web & WebSocket Port: ${PORT}`);
console.log(`[Config] Internal TCP Socket Port:     ${TCP_PORT}`);

// 1. Launch TCP Chat Server (Node.js + SQLite persistence)
const backend = spawn(process.execPath, ['server.js', TCP_PORT], {
  cwd: path.join(root, 'backend'),
  env: {
    ...process.env,
    PORT: TCP_PORT,
    DB_PATH: process.env.DB_PATH || path.join(root, 'chat.db')
  },
  stdio: ['ignore', 'inherit', 'inherit']
});

// 2. Launch WebSocket Bridge & HTTP Static Web Server
const bridge = spawn(process.execPath, ['server.js'], {
  cwd: path.join(root, 'bridge'),
  env: {
    ...process.env,
    PORT: PORT,
    WS_PORT: PORT,
    TCP_HOST: '127.0.0.1',
    TCP_PORT: TCP_PORT
  },
  stdio: ['ignore', 'inherit', 'inherit']
});

console.log(`[Backend] PID: ${backend.pid} running on 127.0.0.1:${TCP_PORT}`);
console.log(`[Bridge]  PID: ${bridge.pid} serving Web UI + WSS on port ${PORT}`);
console.log('========================================================');

function cleanup() {
  console.log('[Runner] Shutting down services cleanly...');
  try { backend.kill(); } catch (e) {}
  try { bridge.kill(); } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
backend.on('exit', (code) => {
  console.error(`[Backend] Process exited with code ${code}`);
  if (code !== 0) process.exit(code || 1);
});
bridge.on('exit', (code) => {
  console.error(`[Bridge] Process exited with code ${code}`);
  if (code !== 0) process.exit(code || 1);
});

