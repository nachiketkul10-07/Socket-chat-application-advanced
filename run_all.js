// run_all.js - Unified full-stack runner for Socket Chat Application
const { spawn } = require('child_process');
const path = require('path');

const root = __dirname;

console.log('========================================================');
console.log('  Starting Socket Chat Application Full-Stack Services  ');
console.log('========================================================');

const backend = spawn(process.execPath, ['server.js', '8080'], {
  cwd: path.join(root, 'backend'),
  stdio: ['ignore', 'inherit', 'inherit']
});

const bridge = spawn(process.execPath, ['server.js'], {
  cwd: path.join(root, 'bridge'),
  stdio: ['ignore', 'inherit', 'inherit']
});

const viteBin = path.join(root, 'dashboard', 'node_modules', 'vite', 'bin', 'vite.js');
const dashboard = spawn(process.execPath, [viteBin, '--host', '0.0.0.0'], {
  cwd: path.join(root, 'dashboard'),
  stdio: ['ignore', 'inherit', 'inherit']
});

console.log(`[Backend]   PID: ${backend.pid} on port 8080`);
console.log(`[Bridge]    PID: ${bridge.pid} on port 3001`);
console.log(`[Dashboard] PID: ${dashboard.pid} on port 5173`);
console.log('');
console.log('  Web UI: http://localhost:5173');
console.log('========================================================');

function cleanup() {
  console.log('Stopping all services...');
  try { backend.kill(); } catch (e) {}
  try { bridge.kill(); } catch (e) {}
  try { dashboard.kill(); } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
backend.on('exit', code => console.log(`[Backend] exited with code ${code}`));
bridge.on('exit', code => console.log(`[Bridge] exited with code ${code}`));
dashboard.on('exit', code => console.log(`[Dashboard] exited with code ${code}`));

