/**
 * scripts/dev.js
 * 
 * DEVELOPMENT RUNNER
 * 
 * Runs backend API (port 5000) and frontend Vite dev server (port 3000) concurrently.
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('======================================================');
console.log('Starting MiniExchange Full-Stack Development Services...');
console.log('======================================================');

const isWin = process.platform === 'win32';
const nodeCmd = process.execPath;
const viteBin = path.resolve(__dirname, '../client/node_modules/vite/bin/vite.js');

// 1. Start Backend Server
const serverProcess = spawn(nodeCmd, ['src/server.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
  stdio: 'pipe'
});

serverProcess.stdout.on('data', (data) => {
  process.stdout.write(`[BACKEND] ${data}`);
});
serverProcess.stderr.on('data', (data) => {
  process.stderr.write(`[BACKEND ERR] ${data}`);
});

// 2. Start Frontend Vite Dev Server directly via Node binary
const clientProcess = spawn(nodeCmd, [viteBin], {
  cwd: path.resolve(__dirname, '../client'),
  env: process.env,
  stdio: 'pipe'
});

clientProcess.stdout.on('data', (data) => {
  process.stdout.write(`[CLIENT] ${data}`);
});
clientProcess.stderr.on('data', (data) => {
  process.stderr.write(`[CLIENT ERR] ${data}`);
});

// Clean shutdown handler
function shutdown() {
  console.log('\nShutting down dev processes...');
  serverProcess.kill('SIGINT');
  clientProcess.kill('SIGINT');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
