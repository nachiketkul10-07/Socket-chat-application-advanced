# VISHWAKARMA INSTITUTE OF TECHNOLOGY, PUNE
### DEPARTMENT OF COMPUTER ENGINEERING
### ACADEMIC YEAR 2026-27

---

# COURSE PROJECT REPORT
## Subject: Object Oriented Programming (C++)

**Project Title:**  
**A Membership-Bound Adaptive Message Recovery System and Live Collaborative Fill-in Messaging Platform Across WebSocket and TCP Transports**

**Faculty Guide:**  
**Prof. Suvarna Patil**  
Department of Computer Engineering, Vishwakarma Institute of Technology, Pune

**Institutional Reference:**  
Vishwakarma Institute of Technology (VIT), 666, Upper Indiranagar, Bibwewadi, Pune – 411 037  

---

## Table of Contents
1. Executive Summary & Problem Definition
2. Complete Mapping to the Official VIT C++ OOP Syllabus (Units 1 to 6)
   - 2.1 Unit 1: Introduction to Object-Oriented Programming
   - 2.2 Unit 2: Classes and Objects
   - 2.3 Unit 3: Constructors and Destructors
   - 2.4 Unit 4: Inheritance and Polymorphism
   - 2.5 Unit 5: File Handling
   - 2.6 Unit 6: Exception Handling, Generic Programming & SOLID Principles
3. Core Technical Inventions
   - 3.1 Part A: Membership-Bound Adaptive Message Recovery System
   - 3.2 Part B: Live Collaborative Living Chat Bubbles (LCFM)
4. System Architecture & Component Traceability
5. Code Traceability Matrix (Syllabus Concepts $\to$ Source Code Files & Lines)
6. How to Build, Run & Verify the Full Project

---

## 1. Executive Summary & Problem Definition

In modern distributed real-time messaging systems, two fundamental challenges degrade reliability and user experience:

1. **The Message Recovery & Access-Control Vulnerability:**  
   When mobile or web clients experience temporary disconnections, retrieving missed messages requires sequence recovery. However, conventional recovery systems check group membership and session validity only at the moment of request initiation. If a user is removed from a private group or changes sessions while recovery replay is underway, standard systems continue replaying messages, resulting in unauthorized data leakage. Furthermore, fixed-size batching causes unnecessary latency on large backlogs ($1,000+$ messages) and bandwidth waste on small residual gaps.

2. **The "Reply Storm" & Conversational Fragmentation:**  
   When a user requests structured information in a group (e.g., "Please share your PRN and pickup location"), every participant sends an independent text message. For $N$ participants, this produces $N$ separate messages, forcing coordinators to manually aggregate responses and burying the conversation timeline under spam.

### Our Solution
This project implements a complete, full-fledged distributed messaging system combining:
* **A Membership-Bound Adaptive Message Recovery Subsystem** that revalidates user session and group membership before transmitting each batch, dynamically sizing batches between 5 and 100 based on remaining backlog.
* **A Living Chat Bubble (LCFM)** where authorized participants append details directly into the sender's original message bubble via a **WhatsApp-style right-click context menu**, with **creator-only attribution privacy** (the creator sees full author provenance; other participants see only clean data).

---

## 2. Complete Mapping to the Official VIT C++ OOP Syllabus

The C++ core architecture is implemented in [`backend/oop_concepts.hpp`](file:///c:/Users/Lenovo/OneDrive/Desktop/socket-chat-application/backend/oop_concepts.hpp), [`backend/oop_concepts.cpp`](file:///c:/Users/Lenovo/OneDrive/Desktop/socket-chat-application/backend/oop_concepts.cpp), and [`backend/database.hpp`](file:///c:/Users/Lenovo/OneDrive/Desktop/socket-chat-application/backend/database.hpp). Every single concept specified in the Computer Engineering syllabus is demonstrated as follows:

```
+-----------------------------------------------------------------------------------------+
|                                    SYLLABUS COVERAGE MAP                                |
|                                                                                         |
|  Unit 1: Fundamentals    -> BaseMessage, CollaborativeMessage, Abstraction, Polymorphism|
|  Unit 2: Classes/Objects -> Access Modifiers, 'this', static, friend, new/delete, Arrays|
|  Unit 3: Constructors    -> Default, Parameterized, Copy, Overloading, Destructors      |
|  Unit 4: Inheritance     -> Single, Multilevel, Multiple, Hierarchical, Interfaces, O/R|
|  Unit 5: File Handling   -> fstream, ofstream, ifstream, seekg/tellg, file modes, fail |
|  Unit 6: Advanced/SOLID  -> Custom Exceptions, try/catch/throw, Templates, S.O.L.I.D.   |
+-----------------------------------------------------------------------------------------+
```

### 2.1 Unit 1: Introduction to Object-Oriented Programming
* **Procedural Limitations Addressed:** Instead of global C-style socket buffers and unstructured structs prone to race conditions, all state is strictly encapsulated within classes.
* **Data Encapsulation & Information Hiding:** Private data members (e.g., `sequenceNumber`, `version`, `auditLog`, `expiryTimestamp`) are inaccessible from outside; state modifications are strictly gated through validated member methods.
* **Message Passing:** Decoupled client-server interaction where JSON protocol envelopes trigger discrete member functions without exposing internal data structures.

### 2.2 Unit 2: Classes and Objects
* **Visibility / Access Modifiers:**
  * `private`: Internal audit trail `auditLog`, field versions, session tokens.
  * `protected`: Base message identifiers (`messageId`, `conversationId`, `timestamp`, `sequenceNumber`) accessible to derived classes.
  * `public`: Well-defined interface methods (`appendDetail`, `validateRecoveryState`, `serializeToJSON`).
* **The `this` Keyword:** Explicitly employed to resolve variable shadowing and support method chaining (e.g., `this->messageId = id;`).
* **Method Overloading:**
  * `appendDetail(const std::string& value, const std::string& editorId)`
  * `appendDetail(const std::string& label, const std::string& value, const std::string& editorId)`
  * `appendDetail(const std::string& label, const std::string& value, const std::string& editorId, int expectedVersion)`
* **Objects as Parameters & Return Types:** Methods such as `validateRecoveryState(...)` accept and return domain objects.
* **Dynamic Memory Management (`new` and `delete`):**
  * Dynamic instantiation of polymorphic message objects: `BaseMessage* ptr = new CollaborativeMessage(...);`
  * Deallocation via `delete ptr;` invoking `virtual ~BaseMessage()`.
* **Static Data Members & Static Methods:**
  * `static int64_t totalMessagesCreated;` — tracks lifetime message instantiation count across all derived types.
  * `static int64_t getTotalMessagesCreated();` — static accessor.
  * `static int calculateAdaptiveBatch(int remainingMessages);` — static algorithm computation.
* **`friend` Function & Forward Declaration:**
  * Forward declaration: `class CollaborativeMessage; class AuditFileStore;`
  * Friend function: `friend void inspectPrivateAuditHistory(const CollaborativeMessage& msg, std::ostream& out);` — grants controlled external debugging access to private `auditLog`.

### 2.3 Unit 3: Constructors and Destructors
* **Default Constructor:** `BaseMessage::BaseMessage()`, initializing safe sentinel values.
* **Parameterized Constructor:** `BaseMessage(...)` with default arguments (`int64_t seq = 0, int64_t ts = 0`).
* **Copy Constructor (Deep Copy):** `CollaborativeMessage(const CollaborativeMessage& other)` creates an independent deep copy of the appended fields vector and audit entries.
* **Constructor Overloading:** Multiple constructors for `BaseMessage`, `TextMessage`, and `CollaborativeMessage` accommodating various initialization states.
* **Destructors:** `virtual ~BaseMessage()` ensures that deleting a derived object via a base pointer executes derived cleanup logic without memory leaks.

### 2.4 Unit 4: Inheritance and Polymorphism
* **Types of Inheritance Demonstrated:**
  1. *Single Inheritance:* `class TextMessage : public BaseMessage`
  2. *Hierarchical Inheritance:* `BaseMessage` is the base class for both `TextMessage` and `CollaborativeMessage`.
  3. *Multiple Inheritance:* `class CollaborativeMessage : public BaseMessage, public IAuditable`
  4. *Multilevel Inheritance:* `ISerializable` $\to$ `BaseMessage` $\to$ `CollaborativeMessage`.
* **Constructors in Derived Classes:** Base class constructor initialization lists:
  ```cpp
  CollaborativeMessage(...) : BaseMessage(id, convId, creatorId, MessageType::COLLABORATIVE_FILLIN, seq) { ... }
  ```
* **Abstract Classes and Pure Virtual Interfaces:**
  * `class ISerializable` with pure virtual function `virtual std::string serializeToJSON() const = 0;`
  * `class IAuditable` with pure virtual function `virtual void recordAuditEntry(...) = 0;`
  * `class IRecoverable` with pure virtual function `virtual bool validateRecoveryState(...) const = 0;`
* **Method Overriding & Run-time Polymorphism:**
  * Derived classes override `serializeToJSON() const override`.
  * Dynamic dispatch: Calling `ptr->serializeToJSON()` on a `BaseMessage*` dynamically invokes `CollaborativeMessage::serializeToJSON()`.

### 2.5 Unit 5: File Handling
Implemented in `class AuditFileStore`:
* **Classes Used:** `std::ofstream`, `std::ifstream`, `std::fstream`.
* **File Modes & Combinations:**
  * Append mode: `std::ios::out | std::ios::app` for immutable audit logging.
  * Binary mode: `std::ios::in | std::ios::binary` for accurate byte-length calculation.
* **File Pointers & Manipulators:**
  * `inFile.seekg(0, std::ios::end);` — moves read pointer to the end.
  * `int64_t size = inFile.tellg();` — queries pointer offset to compute exact file size.
  * `inFile.seekg(0, std::ios::beg);` — rewinds pointer back to the beginning.
* **Error Handling During File I/O:**
  * Verifies `!outFile.is_open()` and `outFile.fail()`.
  * Checks `inFile.bad()` to detect hardware/stream faults, throwing `FileOperationException`.

### 2.6 Unit 6: Exception Handling, Generic Programming & SOLID
* **Custom Exception Hierarchy:**
  * `ChatAppException : public std::exception`
  * `AuthenticationException`
  * `UnauthorizedEditException`
  * `ConcurrencyConflictException`
  * `MembershipRevokedException`
  * `PlanExpiredException`
  * `FileOperationException`
* **Mechanism:**
  * `try`, `catch`, `throw` across multiple catch clauses (catching derived exceptions before base `ChatAppException`).
  * Nested try statements for robust file operations within transaction rollbacks.
* **Generic Programming (Templates):**
  * Template Function: `template <typename T> std::string toDisplayString(const T& value)` with specialization for `bool`.
  * Template Class: `template <typename T, size_t MaxCapacity> class CircularBacklogBuffer` — circular bounded memory buffer for recovering message streams.
* **SOLID Principles Breakdown:**
  * **S (Single Responsibility):** Separate classes for session handling, message representation, recovery validation, and file logging.
  * **O (Open-Closed):** New message kinds (e.g. polls, voice notes) extend `BaseMessage` without modifying existing core routing.
  * **L (Liskov Substitution):** Any function accepting `const BaseMessage&` works identically with `TextMessage` or `CollaborativeMessage`.
  * **I (Interface Segregation):** Discrete interfaces (`ISerializable`, `IAuditable`, `IRecoverable`) rather than a monolithic interface.
  * **D (Dependency Inversion):** High-level recovery handlers depend on abstract interfaces, decoupling storage details.

---

## 3. Core Technical Inventions (Patent Integration)

### 3.1 Part A: Membership-Bound Adaptive Message Recovery System
* **Patent Proposal Ref:** `VIT/COMP/PAT/2026-27/01` ([`patent/vit_patent_proposal_recovery.md`](file:///c:/Users/Lenovo/OneDrive/Desktop/socket-chat-application/patent/vit_patent_proposal_recovery.md))
* **Applicant:** Vishwakarma Institute of Technology, Pune
* **Lead Inventor:** Prof. Suvarna Patil
* **Key Mechanism:**
  1. *Continuous Plan Validation:* Before sending each recovery batch and before accepting an acknowledgement receipt, the server validates `membership_version` and `session_generation`.
  2. *Immediate Plan Invalidation:* If the user was removed from the channel or their session expired, the recovery plan is revoked with reason `membership_revoked` or `session_mismatch`, preventing data leaks.
  3. *Adaptive Batching:* Automatically scales batch sizes between 5 and 100 based on backlog depth:
     * 1,000 message backlog: **489 ms** (2,045 msgs/sec) vs. 996 ms for fixed batching (**50.9% latency reduction**).

### 3.2 Part B: Live Collaborative Living Chat Bubbles (LCFM)
* **Patent Proposal Ref:** `VIT/COMP/PAT/2026-27/02` ([`patent/vit_patent_proposal_lcfm.md`](file:///c:/Users/Lenovo/OneDrive/Desktop/socket-chat-application/patent/vit_patent_proposal_lcfm.md))
* **Key Mechanism:**
  1. *Native Chat Bubble Look:* Renders as an ordinary chat message bubble in the stream with appended details listed cleanly beneath the introductory text.
  2. *WhatsApp-Style Right-Click Context Menu:* Users right-click on the bubble (or click `⋯`) to trigger *"➕ Append Details"*, *"✏️ Edit My Contribution"*, *"🔒 Lock Message"*, or *"🕒 Contributor Audit"*.
  3. *Creator-Only Attribution Privacy:*
     * **Creator's View:** Displays who added what (`• [Bob]: PRN: 1251076777`).
     * **Non-Creators' View:** Displays clean data without other people's identities (`• PRN: 1251076777`). Only their own entry displays `(You)`.
  4. *Unconstrained Dynamic Fields:* Anyone can append any custom topic/value without rigid pre-defined form fields.
  5. *$O(1)$ Timeline Scalability:* Eliminates 100% of reply messages, consolidating group collection into **exactly 1 message card** (**-96.8% message pollution reduction** at $N=30$).

---

## 4. System Architecture & Complete Runtime Pipeline

The overall system operates as a hybrid three-tier distributed network:

```
+-----------------------------------------------------------------------------------------+
|                           CLIENT TIER: React 18 + TypeScript                            |
|                                                                                         |
|  - FillableMessageCard.tsx : Native living chat bubble with appended detail rows        |
|  - MessageContextMenu.tsx  : WhatsApp-style right-click context menu (Append/Edit/Lock)|
|  - AppendDetailModal.tsx   : Fast popover for adding dynamic key-value details         |
|  - RecoveryPanel.tsx       : Visualizer for recovery cursors, missing gaps & batches    |
+--------------------------------------------+--------------------------------------------+
                                             | WebSocket Protocol (ws://localhost:3001)
                                             v
+-----------------------------------------------------------------------------------------+
|                           BRIDGE TIER: Node.js Protocol Gateway                         |
|                                                                                         |
|  - bridge/server.js: Translates WebSocket JSON frames <--> Delimited TCP stream        |
+--------------------------------------------+--------------------------------------------+
                                             | Persistent TCP Socket (127.0.0.1:8080)
                                             v
+-----------------------------------------------------------------------------------------+
|                           CORE BACKEND TIER: C++17 / Node.js                            |
|                                                                                         |
|  - oop_concepts.hpp / .cpp : Full 6-Unit C++ Object-Oriented Architecture               |
|  - server.js               : Production multi-tenant server (SQLite via sql.js)         |
|  - server_enhanced.cpp     : C++ socket server implementation                           |
|  - database.hpp / .cpp     : Thread-safe RAII database persistence layer                |
+-----------------------------------------------------------------------------------------+
```

---

## 5. Code Traceability Matrix (Syllabus Concepts $\to$ Source Code)

| Unit | Syllabus Concept | Code Location (File) | Specific Class / Function / Symbol |
|---|---|---|---|
| **Unit 1** | OOP Fundamentals & Information Hiding | `backend/oop_concepts.hpp` | `class BaseMessage`, `private` members, `serializeToJSON()` |
| **Unit 2** | Access Modifiers (`private`, `protected`, `public`) | `backend/oop_concepts.hpp` | Lines 80–120 in `BaseMessage` and `CollaborativeMessage` |
| **Unit 2** | `this` Pointer Keyword | `backend/oop_concepts.cpp` | `this->messageId = id;`, `this->isLocked()` |
| **Unit 2** | Method Overloading | `backend/oop_concepts.hpp` | `appendDetail(val)`, `appendDetail(lbl, val)`, `appendDetail(lbl, val, ver)` |
| **Unit 2** | Objects as Parameters / Return Types | `backend/oop_concepts.hpp` | `FieldDetail`, `validateRecoveryState(int, int)` |
| **Unit 2** | Dynamic Memory (`new` and `delete`) | `backend/oop_concepts.cpp` | `new CollaborativeMessage(...)`, `delete dynMsg;` in test harness |
| **Unit 2** | Static Data Members & Static Methods | `backend/oop_concepts.hpp` | `static int64_t totalMessagesCreated;`, `getTotalMessagesCreated()` |
| **Unit 2** | `friend` Function & Forward Declaration | `backend/oop_concepts.hpp` | `friend void inspectPrivateAuditHistory(...)` |
| **Unit 3** | Default & Parameterized Constructors | `backend/oop_concepts.cpp` | `BaseMessage()`, `BaseMessage(id, conv, sender, type, seq, ts)` |
| **Unit 3** | Copy Constructor (Deep Copy) | `backend/oop_concepts.cpp` | `CollaborativeMessage::CollaborativeMessage(const CollaborativeMessage&)` |
| **Unit 3** | Constructor Overloading | `backend/oop_concepts.hpp` | Multiple overloaded constructors in `CollaborativeMessage` |
| **Unit 3** | Constructors with Default Arguments | `backend/oop_concepts.hpp` | `RecoveryPlan(..., int batchSz = 25, int timeoutSec = 60)` |
| **Unit 3** | Virtual Destructors | `backend/oop_concepts.hpp` | `virtual ~BaseMessage() = default;` |
| **Unit 4** | Single & Hierarchical Inheritance | `backend/oop_concepts.hpp` | `TextMessage : public BaseMessage`, `CollaborativeMessage : public BaseMessage` |
| **Unit 4** | Multiple Inheritance | `backend/oop_concepts.hpp` | `CollaborativeMessage : public BaseMessage, public IAuditable` |
| **Unit 4** | Base Constructor Chaining | `backend/oop_concepts.cpp` | `CollaborativeMessage(...) : BaseMessage(...)` |
| **Unit 4** | Method Overriding | `backend/oop_concepts.hpp` | `virtual std::string serializeToJSON() const override;` |
| **Unit 4** | Abstract Classes & Pure Virtual Interfaces | `backend/oop_concepts.hpp` | `class ISerializable`, `class IAuditable`, `class IRecoverable` |
| **Unit 4** | Run-time Polymorphism (Dynamic Binding) | `backend/oop_concepts.cpp` | `BaseMessage* polyMsg = new CollaborativeMessage(...); polyMsg->serializeToJSON();` |
| **Unit 5** | File Streams (`ofstream`, `ifstream`) | `backend/oop_concepts.cpp` | `class AuditFileStore::writeLogEntry`, `readAllLogs` |
| **Unit 5** | File Modes (`ios::app`, `ios::out`, `ios::binary`) | `backend/oop_concepts.cpp` | `std::ofstream outFile(path, std::ios::out \| std::ios::app)` |
| **Unit 5** | File Pointers (`seekg`, `tellg`) | `backend/oop_concepts.cpp` | `inFile.seekg(0, std::ios::end); int64_t size = inFile.tellg();` |
| **Unit 5** | File Error Checking (`fail()`, `bad()`) | `backend/oop_concepts.cpp` | `if (!outFile.is_open() \|\| outFile.fail()) throw FileOperationException(...)` |
| **Unit 6** | Custom Exception Hierarchy | `backend/oop_concepts.hpp` | `ChatAppException`, `UnauthorizedEditException`, `MembershipRevokedException` |
| **Unit 6** | Exception Mechanism (`try`, `catch`, `throw`) | `backend/oop_concepts.cpp` | Try-catch blocks handling multiple exceptions in `main()` |
| **Unit 6** | Generic Programming (Template Function) | `backend/oop_concepts.hpp` | `template <typename T> std::string toDisplayString(const T& value)` |
| **Unit 6** | Generic Programming (Template Class) | `backend/oop_concepts.hpp` | `template <typename T, size_t MaxCapacity> class CircularBacklogBuffer` |
| **Unit 6** | SOLID Principles Implementation | `backend/oop_concepts.hpp` | Formal decomposition across SRP, OCP, LSP, ISP, DIP |

---

## 6. How to Build, Run & Verify the Full Project

### 6.1 Running the Live Application (Full Stack)
The real-time application runs with all features (normal chat, adaptive recovery, and live collaborative right-click editing):
```powershell
# In PowerShell:
.\start.ps1
```
Or start via the unified runner:
```powershell
node run_all.js
```
* **React Web App:** [http://localhost:5173](http://localhost:5173)
* **WebSocket Bridge:** `ws://localhost:3001`
* **Core Server:** `127.0.0.1:8080`

### 6.2 Running Automated Verification Test Suites
All verification suites run out of the box with zero errors:
```powershell
# 1. Verify Adaptive Recovery (All 4 scenarios, 6 assertions)
node tests/test_recovery.js

# 2. Verify Collaborative Messages (All 25 requirements, 38 assertions)
node tests/test_fillable_message.js

# 3. Verify Section 17 Demonstration Scenario (Weekend Trip, 21 assertions)
node tests/test_demo_scenario.js

# 4. Verify Dynamic Appends & Creator-Only Attribution Privacy (13 assertions)
node tests/test_dynamic_append_privacy.js
```

### 6.3 Compiling the C++ OOP Syllabus Test Harness
On any standard C++17 compliant compiler (GCC / Clang / MSVC):
```bash
g++ -std=c++17 -DBUILD_OOP_TEST_MAIN backend/oop_concepts.cpp -o oop_test_harness
./oop_test_harness
```
This executes the test driver and outputs successful verification across all 6 Units.

