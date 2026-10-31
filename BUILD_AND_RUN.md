# Build and Run Instructions

## Overview

This chat application consists of three components that must be started in order:

1. **C++ TCP Server** (Port 8080)
2. **Node.js WebSocket Bridge** (Port 3001)
3. **React Dashboard** (Port 5173)

---

## Prerequisites

### Required Software

- **C++ Compiler**: MinGW-w64 with g++ (for Windows)
- **Node.js**: Version 16 or higher
- **npm**: Comes with Node.js

### Installation Check

```powershell
# Check if g++ is available
g++ --version

# Check Node.js
node --version

# Check npm
npm --version
```

---

## Step 1: Build and Start the C++ Server

### Terminal 1 - C++ Server

```powershell
cd backend

# Compile the server
g++ -std=c++11 server.cpp -o server.exe -lws2_32

# Run the server
.\server.exe 8080
```

**Expected Output:**
```
[2026-08-27 12:00:00] Server started on port 8080
```

### Troubleshooting C++ Server

**Problem**: `g++: command not found`
- **Solution**: Install MinGW-w64 from https://www.mingw-w64.org/
- Add MinGW bin directory to PATH

**Problem**: `ws2_32.lib not found`
- **Solution**: Ensure you're using MinGW-w64 (not MinGW32)
- The `-lws2_32` flag links the Windows Sockets library

**Problem**: Port 8080 already in use
- **Solution**: Change the port number: `.\server.exe 8081`
- Also update the bridge configuration

---

## Step 2: Start the WebSocket Bridge

### Terminal 2 - Bridge Server

```powershell
cd bridge

# Install dependencies (first time only)
npm install

# Start the bridge
node server.js
```

**Expected Output:**
```
[Bridge] WebSocket server listening on port 3001
[Bridge] Will connect to TCP server at 127.0.0.1:8080
[Bridge] Server ready
```

### Troubleshooting Bridge

**Problem**: `Cannot find module 'ws'`
- **Solution**: Run `npm install` in the bridge directory

**Problem**: `ECONNREFUSED` connecting to TCP server
- **Solution**: Ensure the C++ server (Step 1) is running first

**Problem**: Port 3001 already in use
- **Solution**: Edit `bridge/server.js` and change `WS_PORT` to another port
- Also update the dashboard WebSocket URL

---

## Step 3: Start the React Dashboard

### Terminal 3 - Dashboard

```powershell
cd dashboard

# Install dependencies (first time only)
npm install

# Start the development server
npm run dev
```

**Expected Output:**
```
  VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Troubleshooting Dashboard

**Problem**: npm install fails
- **Solution**: Delete `node_modules` and `package-lock.json`, then run `npm install` again

**Problem**: TypeScript errors
- **Solution**: Ensure all source files are present in `dashboard/src/`

**Problem**: Port 5173 already in use
- **Solution**: Vite will automatically use the next available port
- Or specify a port: `npm run dev -- --port 3000`

---

## Step 4: Use the Application

1. Open your browser to **http://localhost:5173**

2. You'll see the login screen

3. Enter a username (e.g., "Alice") and click **Connect**

4. You should see:
   - Top navigation with "Chat Bot" and your username
   - Left panel with tabs: Direct | Group | Public
   - Center panel with "Select a conversation"
   - Right panel with Notifications and Suggestions

5. Click on **Public** tab → you should see "General" conversation

6. Click on "General" to open it

7. Type a message and press Enter or click Send

---

## Testing with Multiple Users

### Option 1: Multiple Browser Tabs

1. Open http://localhost:5173 in one tab (User: Alice)
2. Open http://localhost:5173 in another tab (User: Bob)
3. Both users can chat in the Public/General room

### Option 2: Console Client

```powershell
cd backend

# Compile the console client
g++ -std=c++11 client.cpp -o client.exe -lws2_32

# Run the client
.\client.exe 127.0.0.1 8080
```

Enter a username when prompted, then type messages.

**Note**: The console client uses plain text protocol. The bridge translates between JSON (dashboard) and plain text (console client).

---

## Current System Behavior

### What Works

✅ WebSocket connection from dashboard to bridge
✅ TCP connection from bridge to C++ server
✅ User authentication (username only)
✅ Message sending and receiving
✅ Public conversation (single global room)
✅ Real-time updates
✅ Console client compatibility

### Current Limitations

The existing C++ server has these limitations:

❌ No conversation types (everything is broadcast to all users)
❌ No message persistence/history
❌ No user presence tracking
❌ No notifications system
❌ No direct messages
❌ No group conversations
❌ No authentication beyond username

**Why these don't work yet**: The current `server.cpp` is the original simple broadcast server. It doesn't understand the JSON protocol commands like `fetch_conversations`, `fetch_history`, etc.

### What the Dashboard Expects

The dashboard is built to work with an enhanced server that supports:
- JSON protocol
- Multiple conversation types
- Message persistence
- User management
- Presence tracking
- Notifications

---

## Next Steps for Full Functionality

To enable all dashboard features, the C++ server needs to be enhanced:

### Option A: Enhance the C++ Server

Replace `backend/server.cpp` with a version that:
1. Parses incoming JSON messages
2. Routes messages to specific conversations
3. Stores messages in SQLite
4. Tracks user presence
5. Sends structured JSON responses

### Option B: Create a Node.js Backend

Create a complete backend in Node.js that:
1. Handles WebSocket connections directly
2. Implements all protocol commands
3. Uses SQLite for persistence
4. Provides full conversation routing

### Option C: Use Current Setup for Testing

The current setup works for basic public chat:
1. All messages broadcast to all users
2. Real-time communication works
3. Multiple users can connect
4. Good for testing the dashboard UI

---

## Monitoring and Debugging

### Check All Components Are Running

You should have 3 terminal windows:

**Terminal 1** (C++ Server):
```
[2026-08-27 12:00:00] Server started on port 8080
[2026-08-27 12:00:15] New connection from 127.0.0.1
[2026-08-27 12:00:16] User authenticated: Alice
```

**Terminal 2** (Bridge):
```
[Bridge] WebSocket server listening on port 3001
[Bridge] New WebSocket connection
[Bridge] Connected to TCP server
[Bridge] Auth request for user: Alice
```

**Terminal 3** (Dashboard):
```
  VITE v5.0.8  ready in 500 ms
  ➜  Local:   http://localhost:5173/
```

### Browser Console

Open Developer Tools (F12) → Console tab

You should see:
```
[WebSocket] Connected to server
[App] Handling message: welcome
[App] Handling message: auth_success
[App] Authenticated as: Alice
```

### Common Issues

**Dashboard shows "Failed to connect to server"**
- Check that the bridge is running
- Check browser console for WebSocket errors
- Verify the WebSocket URL in `dashboard/src/websocket.ts`

**Messages not appearing**
- Check all 3 terminals for errors
- Verify the C++ server shows the message
- Check bridge logs for message translation
- Check browser console

**Cannot send messages**
- Ensure you're authenticated
- Check that a conversation is selected
- Verify the message input isn't empty

---

## Stopping the Application

Press **Ctrl+C** in each terminal:

1. Stop the Dashboard (Terminal 3)
2. Stop the Bridge (Terminal 2)
3. Stop the C++ Server (Terminal 1)

---

## Production Deployment Considerations

⚠️ **This is a development setup. Before production:**

1. Add authentication with passwords
2. Implement TLS/SSL (WSS for WebSocket)
3. Add input validation and sanitization
4. Implement rate limiting
5. Add comprehensive error handling
6. Use environment variables for configuration
7. Build the React app (`npm run build`)
8. Use a process manager (PM2) for Node.js
9. Implement database migrations
10. Add logging and monitoring

---

## Getting Help

### Check Logs

- **C++ Server**: Writes to `backend/chat_log.txt`
- **Bridge**: Console output
- **Dashboard**: Browser console (F12)

### Verify Setup

```powershell
# Check file structure
Get-ChildItem -Recurse -File | Select-Object FullName

# Check running processes
netstat -ano | findstr "8080 3001 5173"
```

### Reset Everything

```powershell
# Stop all terminals (Ctrl+C)

# Clean dashboard
cd dashboard
Remove-Item -Recurse -Force node_modules
npm install

# Clean bridge
cd ..\bridge
Remove-Item -Recurse -Force node_modules
npm install

# Rebuild C++ server
cd ..\backend
Remove-Item -Force server.exe
g++ -std=c++11 server.cpp -o server.exe -lws2_32
```

---

## Quick Start Script

Save this as `start.ps1`:

```powershell
# Start C++ Server
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; .\server.exe 8080"

Start-Sleep -Seconds 2

# Start Bridge
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd bridge; node server.js"

Start-Sleep -Seconds 2

# Start Dashboard
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd dashboard; npm run dev"

Write-Host "All services started! Open http://localhost:5173 in your browser."
```

Run: `.\start.ps1`

---

**Last Updated**: 2026-08-27
**Version**: 1.0 (Basic functionality)