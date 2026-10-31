# Socket Chat Application — Dashboard Design Document

**Project:** Multi-Client TCP Chat System — Web/Desktop Dashboard Frontend
**Prepared for:** Chat Bot Dashboard build-out
**Version:** 1.0
**Date:** August 27, 2026

---

## 1. Purpose & Scope

This document defines the design for a full **chat dashboard UI** (per the supplied mockup) that sits on top of the existing **C++ Winsock multi-client TCP chat server/client**. It covers:

- A review of what the current backend (`server.cpp`, `client.cpp`) already supports
- The UI/UX design derived from the provided mockup
- The gaps between the current backend and what the dashboard needs
- A proposed architecture, protocol, and data model to close those gaps
- Technology recommendations and a phased roadmap

The goal is a single reference document a developer (or team) can build directly from.

---

## 2. Current State — Existing Backend Review

The uploaded `server.cpp` / `client.cpp` implement a working **console-based, single-room TCP chat system** on Windows (Winsock2). Key characteristics:

| Aspect | Current Behavior |
|---|---|
| Transport | Raw TCP sockets (`SOCK_STREAM`), Winsock2, `TCP_NODELAY` enabled |
| Concurrency | One OS thread per client (`CreateThread`), guarded by a single `CRITICAL_SECTION` over the `clients` map |
| Protocol | Plain-text, line-delimited (`\n` in, `\r\n` out) — human-readable, telnet-compatible |
| Rooms | **Single global room** — every message is broadcast to *all* connected clients |
| Identity | Client sends a username as the first line after connecting; no password/auth, no uniqueness check |
| Persistence | Server-side append-only log file (`chat_log.txt`) with timestamps; **no history replay** to newly joined clients |
| Presence | No concept of "last seen," online/offline status, or typing indicators |
| Message types | Plain chat text only — no attachments, read receipts, reactions, or system metadata beyond join/leave notices |
| Client UI | Console `std::cin` / `std::cout` loop with a background receiver thread |

**In short:** this is a solid, well-structured single-room broadcast chat (good RAII/OOP hygiene, thread-safe broadcast), but it has **no concept of Direct / Group / Public conversations, contacts, notifications, or search** — all of which the target dashboard requires. Section 5 defines what needs to be added.

---

## 3. Target UI — Design Breakdown (from mockup)

The mockup is a 3-column admin-dashboard-style chat layout. Breaking it into components:

### 3.1 Top Navigation Bar
- App branding ("Chat Bot") + primary nav (Dashboard, Apps, Widgets, Forms, Tables, Charts, Pages, Emails — inherited from the admin template, only **Dashboard** is in scope for v1)
- Global search box
- Utility icons (fullscreen, notifications bell, messages, user/profile menu)

### 3.2 Left Panel — Chat List
- Tabs: **Direct | Group | Public**
- Search-within-chats input
- Scrollable list of conversations, each row showing:
  - Avatar
  - Contact/group name
  - Last message preview (truncated)
  - Timestamp of last message
  - (Implied) unread badge / active-conversation highlight

### 3.3 Center Panel — Active Conversation
- Header: avatar, contact name, "last seen" / online status, call / video / more-options icons
- Message thread:
  - Incoming messages: left-aligned, neutral bubble, sender avatar + name
  - Outgoing messages: right-aligned, accent-colored (blue) bubble
  - Per-message timestamp
- Composer bar: attachment icons (image/file/emoji/mic), text input ("Say something…"), send button

### 3.4 Right Panel — Notifications & Suggestions
- **Notifications** feed: avatar, actor name, action text, relative time ("23 hours ago")
- **Suggestions** list: avatar, name, mutual-connection count, **Add** button (friend/contact suggestions)

### 3.5 Visual Style
- Dark theme, navy/charcoal background (`#0f1420`–`#1a2035` range), accent blue for primary actions and outgoing bubbles, soft rounded cards, subtle borders/shadows for panel separation, small circular avatars throughout.

---

## 4. Gap Analysis — What Must Be Added

| Dashboard Feature | Backend Support Today | Work Required |
|---|---|---|
| Direct / Group / Public tabs | Only one global room | Add **room/channel model**: server must track multiple rooms and route messages per-room, plus 1:1 direct-message routing by user ID |
| Chat list with last-message previews | No conversation registry, no per-room state | Server must persist "last message per conversation" per user (or client derives it from history) |
| Contact list / "Suggestions" | No user directory | Server needs a **registered users table** (even if in-memory) and a simple relationship/contact concept |
| Notifications feed | Only join/leave broadcasts to the whole room | Introduce structured **event messages** (join, leave, mention, added-as-contact, group-invite) separate from chat text |
| Online / last-seen status | None | Track connect/disconnect timestamps per user; broadcast presence-change events |
| Message history on load | Log file exists but isn't replayed | Add a "fetch history" request/response for a given conversation, or persist to a lightweight DB (SQLite) |
| Structured client-UI integration | Protocol is plain text lines, fine for a terminal, awkward for a GUI to parse reliably | Move to a **structured message protocol** (JSON lines or WebSocket + JSON) — see Section 6 |
| Attachments/emoji (icons shown) | Not supported | Out of scope for v1 unless required; stub UI only, disabled |

**Bottom line:** the console app is a good backbone (threading, broadcast, logging) but the dashboard needs the server to become **room-aware, user-aware, and structured-message-based** instead of a single anonymous broadcast pipe.

---

## 5. Proposed Architecture

```
┌───────────────────────────┐        JSON/WebSocket        ┌────────────────────────────┐
│   Dashboard Frontend       │ ───────────────────────────▶ │   Gateway / Bridge Layer     │
│  (Web app: React + Vite)   │ ◀─────────────────────────── │  (Node.js or C++ WS server)  │
└───────────────────────────┘                               └────────────┬───────────────┘
                                                                          │ TCP (existing
                                                                          │ line protocol,
                                                                          │ extended)
                                                              ┌───────────▼───────────────┐
                                                              │   ChatServer (C++/Winsock) │
                                                              │  - Room/user registry      │
                                                              │  - Broadcast + routing     │
                                                              │  - Logger (existing)       │
                                                              └────────────────────────────┘
```

Two viable paths — pick one based on team skillset:

**Option A — Extend the C++ server to speak WebSocket directly** (e.g., via a lightweight WS library such as `uWebSockets` or a hand-rolled RFC 6455 handshake), so the browser dashboard talks to it with no bridge process. Cleaner long-term, more C++ work up front.

**Option B — Keep the C++ TCP server as-is (plus the protocol extensions in Section 6) and add a thin Node.js/Python bridge** that exposes a WebSocket to the browser and a TCP socket to the existing server. Faster to stand up, keeps the existing `server.cpp` mostly untouched, easy to prototype the dashboard against.

*Recommendation:* **Option B for v1** (fastest path to a working dashboard demo), with a note to reassess Option A once the protocol stabilizes.

---

## 6. Protocol Design

Replace/extend the current free-text line protocol with **newline-delimited JSON** so the GUI can parse it deterministically. Backward-compatible: the delimiter (`\n`) stays the same, only the payload becomes structured.

### 6.1 Client → Server messages

```json
{"type": "auth", "username": "Theron Trump"}
{"type": "message", "conversationId": "dm-2", "text": "I would suggest you discuss this further with the advertising team."}
{"type": "join_room", "conversationId": "grp-launch"}
{"type": "fetch_history", "conversationId": "dm-2", "before": null, "limit": 50}
{"type": "typing", "conversationId": "dm-2"}
```

### 6.2 Server → Client messages

```json
{"type": "message", "conversationId": "dm-2", "from": "Sarah Kortney", "text": "...", "ts": "2026-08-27T16:58:44Z"}
{"type": "presence", "userId": "u-14", "status": "online", "lastSeen": null}
{"type": "notification", "kind": "contact_request", "from": "Austin", "ts": "..."}
{"type": "conversation_list", "conversations": [ /* see data model */ ]}
{"type": "history", "conversationId": "dm-2", "messages": [ /* ... */ ]}
{"type": "error", "message": "username taken"}
```

### 6.3 Conversation Types
- `direct` — 1:1, `conversationId` derived from sorted user-id pair
- `group` — many-to-many, explicit membership list
- `public` — the original global broadcast room ("General"), open to all connected users by default

---

## 7. Data Model

**User**
```
id, username, avatarUrl, status (online|offline), lastSeenAt
```

**Conversation**
```
id, type (direct|group|public), name (for group/public),
memberIds[], lastMessage {text, from, ts}, unreadCount(per requesting user)
```

**Message**
```
id, conversationId, fromUserId, text, ts, deliveredTo[] (optional, later)
```

**Notification**
```
id, targetUserId, kind (join|mention|contact_request|group_invite), actorUserId, ts, read(bool)
```

**Suggestion (contact)**
```
userId, mutualCount, status (none|requested|added)
```

These map directly onto the three dashboard panels: `Conversation[]` → left panel, `Message[]` for the active `conversationId` → center panel, `Notification[]` + `Suggestion[]` → right panel.

---

## 8. Technology Recommendations

| Layer | Recommendation | Why |
|---|---|---|
| Frontend framework | React (Vite) + Tailwind CSS | Matches the card/panel-heavy dark admin aesthetic in the mockup; fast to iterate |
| Realtime transport (browser) | Native `WebSocket` API | No extra client dependency needed |
| Bridge (Option B) | Node.js (`ws` package) | Minimal glue code to relay TCP ⇄ WebSocket, easy JSON handling |
| Backend core | Keep existing C++/Winsock `ChatServer`, extended per Section 6 | Reuses proven threading/broadcast/logging code |
| Persistence | Start with in-memory + the existing log file; move to SQLite once history-replay and multi-room state are needed | Keeps v1 simple, gives a clear upgrade path |

---

## 9. Feature-to-Component Mapping (for implementation tickets)

1. **Top nav** — static shell, search box wired to conversation/user search later
2. **Chat list tabs (Direct/Group/Public)** — filter `Conversation[]` by `type`
3. **Chat list search** — client-side filter on name/last message; server-side search later
4. **Conversation header** — bind to selected conversation's counterpart user (for `direct`) or group metadata
5. **Message thread** — render `Message[]` for `activeConversationId`; auto-scroll to latest; left/right alignment by `fromUserId === currentUser.id`
6. **Composer** — send `type: "message"` on Enter/click; disable attachment icons in v1 (stub, tooltip "coming soon")
7. **Notifications panel** — subscribe to `type: "notification"` events; relative-time formatting
8. **Suggestions panel** — populate from a `suggested_contacts` request; `Add` button sends a `contact_request`

---

## 10. Non-Functional Requirements

- **Concurrency:** server must remain thread-safe as rooms multiply (existing `CRITICAL_SECTION` pattern extends to a `rooms` map plus the current `clients` map)
- **Resilience:** dashboard must auto-reconnect the WebSocket and re-request conversation state on drop
- **Latency:** `TCP_NODELAY` already set server-side — keep it; keep JSON payloads small (avoid re-sending full history on every message)
- **Security (flagged for later, not in current scope):** no auth/encryption exists today (plain TCP, no TLS, no password). Before any real deployment, add TLS (or `wss://` at the bridge) and basic credential checks — call this out explicitly as **technical debt**, since the current server accepts any username with no verification.

---

## 11. Phased Roadmap

**Phase 1 — Protocol & Backend**
- Extend `server.cpp`: JSON message envelope, room registry, direct-message routing, presence tracking
- Add bridge (Node.js WS↔TCP relay)

**Phase 2 — Dashboard Shell**
- Static React layout matching the mockup (3-panel, dark theme, tabs)
- Wire WebSocket connection + `auth` handshake

**Phase 3 — Core Chat Functionality**
- Live send/receive for `direct` and `public`
- Conversation list with last-message preview, unread badges

**Phase 4 — Groups, Notifications, Suggestions**
- Group creation/membership
- Notification event types + right-panel feed
- Contact suggestions + add-contact flow

**Phase 5 — Polish & Hardening**
- Message history persistence (SQLite) + pagination
- Reconnect/error handling, typing indicators, presence ("last seen")
- Security hardening (TLS, basic auth) before any external exposure

---

## 12. Open Decisions (need sign-off before Phase 1 starts)

1. Confirm **Option A vs. Option B** (native WebSocket in C++ vs. Node.js bridge)
2. Confirm whether persistence should launch with SQLite in Phase 1 or stay in-memory until Phase 5
3. Confirm scope of "Public" room — single global room (matches current server) vs. multiple public channels
4. Confirm whether attachments/emoji in the composer are true v1 requirements or later-phase stubs
