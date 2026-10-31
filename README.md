# Socket Chat Application

**Vishwakarma Institute of Technology (VIT Pune)**  
**Course Project: Object Oriented Programming in C++ (AY 2026-27)**  
**Faculty Guide:** Prof. Suvarna Patil  
**Team Members:** Amey Kulkarni, Aryan Kulkarni, Nachiket Kulkarni, Prathamesh

---

A **real-time multi-user socket chat platform** featuring **Membership-Bound Adaptive Message Recovery (Patent Claims 1–4)**, **Live Collaborative Fill-in Messages (LCFM)**, and complete C++ Object-Oriented Programming (OOP) syllabus mapping (Units 1 to 6).

```
React Dashboard (port 5173)
       ↕  WebSocket (JSON)
Node.js Bridge (port 3001)
       ↕  TCP (newline-delimited JSON)
C++ Winsock2 / Node.js Chat Server (port 8080)
       ↕
   SQLite Store & OOP Message Pipeline
```

---

## Key Features

1. **Membership-Bound Adaptive Message Recovery**:
   - Resumes chat automatically on refresh/reconnection.
   - Evaluates client generation and group membership epoch before replay.
   - Prevents stale or revoked member replay attack vectors.
2. **Live Collaborative Fill-in Messages (LCFM - Model A)**:
   - Living chat bubble editable directly via WhatsApp-style context menu (right-click).
   - Dynamic, unconstrained field entry on the fly.
   - **Creator-Only Attribution Privacy**: The author views exact editor provenance, while participants collaborate cleanly.
3. **Comprehensive C++ OOP Architecture (`backend/oop_concepts.hpp` & `.cpp`)**:
   - Units 1–6 (Encapsulation, Polymorphism, Constructors, File Streams, Exceptions, Generics, and SOLID principles).

---

## Quick Start (One Command)

```powershell
# From the project root:
.\start.ps1
```

This launches all services and opens **http://localhost:5173** (or network IP) in your browser.

To stop: `.\stop.ps1` or close the server windows.

---

## Manual Start (Step-by-Step)

### Step 1 — Start the TCP Chat Server

```powershell
cd backend
node server.js 8080
```

> **C++ backend** (`server_enhanced.exe` / `oop_concepts.cpp`) implements the native C++ Winsock2 socket layer with SQLite.
> Both backends implement the identical JSON/TCP protocol.

### Step 2 — Start the WebSocket Bridge

```powershell
cd bridge
node server.js
```

| Env Var    | Default     | Description                     |
|------------|-------------|---------------------------------|
| `WS_PORT`  | `3001`      | WebSocket server port            |
| `TCP_HOST` | `127.0.0.1` | TCP chat server host             |
| `TCP_PORT` | `8080`      | TCP chat server port             |

### Step 3 — Start the React Dashboard

```powershell
cd dashboard
npm install     # first time only
npm run dev     # development mode (hot-reload)
# OR
npm run build   # production bundle -> dashboard/dist/
```

Open **http://localhost:5173**

---

## Project Structure

```
socket-chat-application/
├── backend/
│   ├── oop_concepts.hpp       ← C++ OOP Comprehensive Header (Units 1 to 6)
│   ├── oop_concepts.cpp       ← C++ Implementation & Syllabus Driver
│   ├── server.js              ← Node.js TCP server (primary runtime)
│   ├── server_enhanced.cpp    ← C++ TCP server (Winsock2 + SQLite)
│   ├── database.cpp/.hpp      ← C++ SQLite persistence & audit layer
│   ├── client.cpp             ← Console client
│   └── tests/                 ← Automated regression suites
├── bridge/
│   ├── server.js              ← WebSocket ↔ TCP bridge
│   └── package.json
├── dashboard/
│   ├── src/
│   │   ├── App.tsx            ← React UI with persistence & auto-auth
│   │   ├── websocket.ts       ← WS service (auto-reconnect, ping/pong)
│   │   ├── types.ts           ← TypeScript interfaces
│   │   └── components/        ← Living bubbles & modal dialogs
│   └── package.json
├── docs/
│   └── VIT_PUNE_OOP_COURSE_PROJECT_REPORT.md ← Complete Academic Project Report
├── patent/
│   ├── vit_patent_proposal_recovery.md       ← Patent Proposal 1 (Recovery)
│   └── vit_patent_proposal_lcfm.md           ← Patent Proposal 2 (LCFM)
├── start.ps1                  ← One-click startup (Windows)
├── stop.ps1                   ← Stop all services
└── README.md
```

---

## Institutional Course & Patent Details

- **Academic Report**: See [`docs/VIT_PUNE_OOP_COURSE_PROJECT_REPORT.md`](docs/VIT_PUNE_OOP_COURSE_PROJECT_REPORT.md)
- **Adaptive Recovery Patent Specification**: See [`patent/vit_patent_proposal_recovery.md`](patent/vit_patent_proposal_recovery.md)
- **LCFM Living Bubbles Patent Specification**: See [`patent/vit_patent_proposal_lcfm.md`](patent/vit_patent_proposal_lcfm.md)
