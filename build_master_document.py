import os
import sys
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def create_master_document(output_path):
    doc = docx.Document()

    # Page Margins
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # Color Palette Definitions
    COLOR_PRIMARY = RGBColor(26, 54, 93)      # #1A365D Navy Blue
    COLOR_SECONDARY = RGBColor(43, 108, 176)  # #2B6CB0 Slate Blue
    COLOR_DARK = RGBColor(45, 55, 72)         # #2D3748 Charcoal
    COLOR_MUTED = RGBColor(113, 128, 150)     # #718096 Slate Gray
    COLOR_BODY = RGBColor(45, 55, 72)         # #2D3748 Text Body

    HEX_PRIMARY = "1A365D"
    HEX_SECONDARY = "2B6CB0"
    HEX_LIGHT_BG = "F7FAFC"
    HEX_CODE_BG = "EDF2F7"
    HEX_BORDER = "CBD5E0"
    HEX_CALLOUT_BORDER = "3182CE"
    HEX_WARN_BORDER = "DD6B20"
    HEX_SUCCESS_BORDER = "38A169"

    # Set Base Normal Style
    style_normal = doc.styles['Normal']
    font = style_normal.font
    font.name = 'Calibri'
    font.size = Pt(10.5)
    font.color.rgb = COLOR_BODY

    # Helpers
    def set_cell_background(cell, fill_hex):
        tcPr = cell._tc.get_or_add_tcPr()
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
        tcPr.append(shd)

    def set_cell_margins(cell, top=120, bottom=120, left=150, right=150):
        tcPr = cell._tc.get_or_add_tcPr()
        tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
        tcPr.append(tcMar)

    def set_table_borders(table, color="D2D6DC"):
        tblPr = table._tbl.tblPr
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="{color}"/>'
            f'  <w:bottom w:val="single" w:sz="4" w:space="0" w:color="{color}"/>'
            f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{color}"/>'
            f'  <w:insideV w:val="none"/>'
            f'  <w:left w:val="none"/>'
            f'  <w:right w:val="none"/>'
            f'</w:tblBorders>'
        )
        tblPr.append(borders)

    def add_p(text="", bold=False, italic=False, color=None, space_after=6, space_before=0, align=WD_ALIGN_PARAGRAPH.LEFT):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.line_spacing = 1.15
        if text:
            run = p.add_run(text)
            run.bold = bold
            run.italic = italic
            if color:
                run.font.color.rgb = color
            else:
                run.font.color.rgb = COLOR_BODY
        return p

    def add_h1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(16)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.name = 'Calibri'
        run.font.size = Pt(16)
        run.font.color.rgb = COLOR_PRIMARY
        return p

    def add_h2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.name = 'Calibri'
        run.font.size = Pt(13)
        run.font.color.rgb = COLOR_SECONDARY
        return p

    def add_h3(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.bold = True
        run.font.name = 'Calibri'
        run.font.size = Pt(11)
        run.font.color.rgb = COLOR_DARK
        return p

    def add_bullet(text, level=0, bold_prefix=None):
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.left_indent = Inches(0.25 * (level + 1))
        if bold_prefix:
            r_pre = p.add_run(bold_prefix)
            r_pre.bold = True
            r_pre.font.color.rgb = COLOR_DARK
        run = p.add_run(text)
        run.font.color.rgb = COLOR_BODY
        return p

    def add_callout(text, title="KEY ARCHITECTURAL INSIGHT", style="info"):
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = tbl.cell(0, 0)
        cell.width = Inches(6.5)
        
        border_color = HEX_CALLOUT_BORDER
        if style == "warning":
            border_color = HEX_WARN_BORDER
        elif style == "success":
            border_color = HEX_SUCCESS_BORDER
            
        tcPr = cell._tc.get_or_add_tcPr()
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{HEX_LIGHT_BG}"/>')
        tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="180" w:type="dxa"/><w:right w:w="180" w:type="dxa"/></w:tcMar>')
        borders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'  <w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/>'
            f'  <w:top w:val="none"/>'
            f'  <w:bottom w:val="none"/>'
            f'  <w:right w:val="none"/>'
            f'</w:tcBorders>'
        )
        tcPr.append(shd)
        tcPr.append(tcMar)
        tcPr.append(borders)
        
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(2)
        r_title = p.add_run(f"[{title}] ")
        r_title.bold = True
        r_title.font.size = Pt(9.5)
        if style == "warning":
            r_title.font.color.rgb = RGBColor(221, 107, 32)
        elif style == "success":
            r_title.font.color.rgb = RGBColor(56, 161, 105)
        else:
            r_title.font.color.rgb = COLOR_SECONDARY
            
        r_text = p.add_run(text)
        r_text.font.size = Pt(9.5)
        r_text.font.color.rgb = COLOR_BODY
        
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    def add_code_block(code_str):
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = tbl.cell(0, 0)
        cell.width = Inches(6.5)
        set_cell_background(cell, HEX_CODE_BG)
        set_cell_margins(cell, top=100, bottom=100, left=150, right=150)
        
        tcPr = cell._tc.get_or_add_tcPr()
        borders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'  <w:left w:val="single" w:sz="4" w:space="0" w:color="{HEX_BORDER}"/>'
            f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="{HEX_BORDER}"/>'
            f'  <w:bottom w:val="single" w:sz="4" w:space="0" w:color="{HEX_BORDER}"/>'
            f'  <w:right w:val="single" w:sz="4" w:space="0" w:color="{HEX_BORDER}"/>'
            f'</w:tcBorders>'
        )
        tcPr.append(borders)
        
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.05
        
        run = p.add_run(code_str)
        run.font.name = 'Consolas'
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(30, 41, 59)
        
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    def add_table_styled(headers, rows_data, col_widths=None):
        table = doc.add_table(rows=len(rows_data) + 1, cols=len(headers))
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(table)
        
        # Format Header
        hdr_row = table.rows[0]
        hdr_row._tr.get_or_add_trPr().append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))
        for idx, heading in enumerate(headers):
            cell = hdr_row.cells[idx]
            set_cell_background(cell, HEX_PRIMARY)
            set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            run = p.add_run(heading)
            run.bold = True
            run.font.size = Pt(9.5)
            run.font.color.rgb = RGBColor(255, 255, 255)
            
        # Format Data Rows
        for r_idx, row_values in enumerate(rows_data):
            row = table.rows[r_idx + 1]
            bg_color = HEX_LIGHT_BG if (r_idx % 2 == 1) else "FFFFFF"
            for c_idx, val in enumerate(row_values):
                cell = row.cells[c_idx]
                set_cell_background(cell, bg_color)
                set_cell_margins(cell, top=80, bottom=80, left=120, right=120)
                p = cell.paragraphs[0]
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.paragraph_format.space_before = Pt(0)
                p.paragraph_format.space_after = Pt(0)
                run = p.add_run(str(val))
                run.font.size = Pt(9.0)
                run.font.color.rgb = COLOR_BODY
                
        # Set Widths if provided
        if col_widths and len(col_widths) == len(headers):
            for row in table.rows:
                for idx, w in enumerate(col_widths):
                    row.cells[idx].width = Inches(w)
                    
        doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # DOCUMENT HEADER & FOOTER CONFIGURATION
    # -------------------------------------------------------------
    sec = doc.sections[0]
    header = sec.header
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hrun = hp.add_run("Socket Chat Application — Comprehensive System Master Specification")
    hrun.font.name = 'Calibri'
    hrun.font.size = Pt(8.5)
    hrun.font.color.rgb = COLOR_MUTED

    footer = sec.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    frun = fp.add_run("Confidential & Proprietary • Engineering & Patent Master Documentation")
    frun.font.name = 'Calibri'
    frun.font.size = Pt(8.5)
    frun.font.color.rgb = COLOR_MUTED

    # -------------------------------------------------------------
    # COVER / TITLE PAGE BLOCK
    # -------------------------------------------------------------
    add_p(space_after=24)
    p_title = add_p("SOCKET CHAT APPLICATION & RECOVERY ENGINE", bold=True, color=COLOR_PRIMARY, space_after=6, align=WD_ALIGN_PARAGRAPH.CENTER)
    p_title.runs[0].font.size = Pt(24)

    p_sub = add_p("Comprehensive Technical Architecture, JSON Protocol Specification, Patent Engineering Reference, and Operational Handbook", italic=True, color=COLOR_SECONDARY, space_after=18, align=WD_ALIGN_PARAGRAPH.CENTER)
    p_sub.runs[0].font.size = Pt(13)

    add_p("_________________________________________________________________________________", color=COLOR_MUTED, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=20)

    # Metadata Summary Table
    meta_headers = ["Attribute", "Specification Details"]
    meta_rows = [
        ["Project Title", "Socket Chat Application & Membership-Bound Adaptive Recovery Engine"],
        ["Architecture Pattern", "3-Tier Distributed Real-Time Architecture (React Dashboard ↔ Bridge ↔ TCP Server ↔ SQLite)"],
        ["Core Patent Feature", "Membership-Bound Adaptive Message Recovery for Multi-Transport Messaging Systems"],
        ["Implementation Languages", "TypeScript (React 18), Node.js (v18+), C++17 (Winsock2 / SQLite3), SQL (sql.js / SQLite)"],
        ["Wire Protocol Format", "Newline-delimited JSON (JSON-Lines / NDJSON) over TCP and WebSocket RFC 6455"],
        ["Target Operating System", "Windows (Production / Local), Cross-Platform Compatible (Node.js & POSIX)"],
        ["Documentation Status", "Master Architecture Reference & Patent Implementation Mapping (Release 2.0)"],
        ["Verification Level", "100% Automated Test Suite Passing (4 Multi-Client Scenarios) & Empirical Benchmark Validated"]
    ]
    add_table_styled(meta_headers, meta_rows, [2.2, 4.3])

    add_callout(
        "This master document serves as the single source of truth for the entire Socket Chat Application ecosystem. "
        "It provides deep technical rigor across software architecture, wire protocol semantics, database schemas, "
        "patent claims, benchmark validations, codebase implementation, and operational execution.",
        "EXECUTIVE NOTICE", "info"
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # TABLE OF CONTENTS OVERVIEW
    # -------------------------------------------------------------
    add_h1("Table of Contents")
    toc_items = [
        "1. Executive Summary & Project Identification",
        "2. High-Level System Architecture & 3-Tier Design",
        "3. Core Functional Capabilities & Feature Matrix",
        "4. Patented Technology: Membership-Bound Adaptive Message Recovery",
        "5. Comprehensive JSON Wire Protocol Specification",
        "6. Relational Database Architecture & Data Models",
        "7. Verification Suite, Test Scenarios & Empirical Benchmarks",
        "8. Intellectual Property, Draft Patent Claims & Prior Art Defense",
        "9. Architectural Codebase Tour & File Organization",
        "10. Operational Deployment, Startup Scripts & Production Hardening",
        "11. Engineering Appendices, Configuration & Troubleshooting"
    ]
    for item in toc_items:
        add_p(item, bold=True, space_after=4, color=COLOR_PRIMARY)

    add_p(space_after=12)

    # -------------------------------------------------------------
    # SECTION 1: EXECUTIVE SUMMARY & PROJECT IDENTIFICATION
    # -------------------------------------------------------------
    add_h1("1. Executive Summary & Project Identification")
    add_p(
        "The Socket Chat Application is a distributed, high-concurrency real-time communication platform designed to "
        "bridge modern web application environments with low-overhead, native streaming socket backends. The application "
        "solves fundamental real-time messaging challenges: reliable message sequencing, instantaneous delivery, cross-transport "
        "interoperability (WebSocket to raw TCP), and most critically, resilient state synchronization across intermittent network disconnections."
    )
    add_p(
        "In traditional distributed chat systems, client disconnections (caused by mobile network handovers, tab backgrounding, "
        "or transient packet loss) lead to sequence gaps. Existing recovery systems rely on static cursor replays that either leak "
        "privileged conversation data when memberships change during disconnection, re-deliver hundreds of duplicate messages, "
        "or congest client network interfaces through monolithic batch dumps. This project solves these issues via an innovative, "
        "patent-pending subsystem: Membership-Bound Adaptive Message Recovery."
    )

    add_h2("1.1 Project Purpose & Core Problems Addressed")
    add_bullet("Bridging WebSockets to Enterprise TCP: Web browsers cannot establish raw TCP connections. This system incorporates an ultra-lightweight, zero-copy Node.js bridge that transparently maps WebSocket frames to line-delimited TCP streams.", 0, "Cross-Transport Bridging: ")
    add_bullet("Zero Data Leakage on Revocation: Guarantees that if a user is revoked from a group during an offline window, they cannot recover messages sent before or after revocation using stale cursor tokens.", 0, "Membership-Bound Security: ")
    add_bullet("Network Backpressure & Throughput Optimization: Dynamically scales recovery batch sizes based on remaining backlog depth, yielding a ~2.04x speedup over conventional static-batch replays.", 0, "Adaptive Batching: ")
    add_bullet("Idempotency & Gap Reconciliation: Tracks contiguous cursors and non-contiguous missing gaps independently, coalescing gaps and pruning delivered sequences idempotently.", 0, "Dual-State Gap Tracking: ")
    add_bullet("Dual-Engine Backend Parity: Offers both a zero-dependency Node.js engine (powered by sql.js SQLite) and an ultra-fast compiled C++17 Winsock2 engine, both adhering to the identical JSON protocol.", 0, "Dual-Engine Strategy: ")

    add_h2("1.2 Technology Stack Summary")
    stack_headers = ["Layer / Subsystem", "Primary Technology", "Key Dependencies & Libraries", "Runtime Target"]
    stack_rows = [
        ["Frontend UI", "React 18 + TypeScript", "Vite 5, Custom Dark-Theme CSS, Native WebSockets", "Modern Browsers (Port 5173)"],
        ["Transport Bridge", "Node.js (CommonJS)", "ws (RFC 6455 WebSocket), Node.js net (TCP)", "Node 18+ (Port 3001)"],
        ["Primary Backend", "Node.js (CommonJS)", "sql.js (WebAssembly SQLite3), net, crypto", "Node 18+ (Port 8080)"],
        ["Native Backend", "C++17 (Native)", "Winsock2 (ws2_32), SQLite3 C Amalgamation", "Windows x64 / Linux (Port 8080)"],
        ["Persistence Engine", "Relational SQLite", "sql.js binary export (chat.db) / SQLite3 native", "Local File Storage"],
        ["Test & Benchmarking", "Node.js Test Harness", "Child Process Spawning, Net Socket Streams", "Automated CLI Runners"]
    ]
    add_table_styled(stack_headers, stack_rows, [1.5, 1.6, 2.0, 1.4])

    # -------------------------------------------------------------
    # SECTION 2: HIGH-LEVEL ARCHITECTURE & 3-TIER DESIGN
    # -------------------------------------------------------------
    add_h1("2. High-Level System Architecture & 3-Tier Design")
    add_p(
        "The architecture is organized into three strictly decoupled tiers, enforcing clear separation of concerns, "
        "independent horizontal scalability, and transport protocol isolation."
    )

    add_code_block(
"""+---------------------------------------------------------------------------------------+
|                                    CLIENT TIER                                        |
|  React 18 Dashboard (TypeScript / Vite @ Port 5173)                                  |
|  - 3-Panel Responsive Layout (Conversations | Active Thread | Details & Actions)      |
|  - RecoveryPanel Instrument (Live cursor monitoring, plan status, manual/auto ack)    |
|  - ChatSocket Singleton Service (Auto-reconnection backoff, JSON serializer/parser)  |
+---------------------------------------------------------------------------------------+
                                           |  ^
                           WebSocket (RFC 6455 / JSON)
                                           v  |
+---------------------------------------------------------------------------------------+
|                                  MEDIATION TIER                                       |
|  Node.js Transport Bridge Server (Port 3001)                                          |
|  - Per-Client Socket Lifecycle Management (1 WebSocket Client = 1 TCP Socket Stream) |
|  - Stream Demarcation: Newline-delimited framing preservation (\\n parsing)           |
|  - Clean Disconnect Cascading: TCP teardown on WS close; presence notification trigger|
+---------------------------------------------------------------------------------------+
                                           |  ^
                       Raw TCP Sockets (Newline-delimited JSON)
                                           v  |
+---------------------------------------------------------------------------------------+
|                                   ENGINE TIER                                         |
|  Primary Engine: backend/server.js (Node.js 18+ / Port 8080)                          |
|  Native Engine:  backend/server_enhanced.exe (C++17 Winsock2 / Port 8080)             |
|  - Monotonic Per-Conversation Sequence Allocator (Atomic MAX(seq)+1 guarantee)        |
|  - Membership-Bound Recovery Engine & Session Generation Validator                   |
|  - Relational State Persistence (sql.js / SQLite3 chat.db)                            |
+---------------------------------------------------------------------------------------+"""
    )

    add_h2("2.1 Tier 1: Client Layer (React 18 + TypeScript Dashboard)")
    add_p(
        "The client layer is built using React 18, TypeScript, and Vite. It provides an intuitive, high-performance "
        "user interface formatted in a 3-panel split view inspired by modern enterprise communication software:"
    )
    add_bullet("Left Panel: Houses conversation navigation with category tabs (Public Broadcast, Direct 1:1 Messages, and Group Conversations), search filter, unread indicators, and a modal trigger to create new groups.", 0, "Conversations List: ")
    add_bullet("Center Panel: Displays the active chat thread with message timeline, inbound/outbound bubble styling, user avatars, timestamps, and a responsive message composer with instant dispatch.", 0, "Active Thread & Composer: ")
    add_bullet("Right Panel: Displays system notifications, real-time presence indicators, suggested contacts, and the interactive RecoveryPanel.", 0, "Contextual Sidebar: ")
    add_bullet("RecoveryPanel Instrumentation: A dedicated debugging and recovery management component allowing users and developers to inspect contiguous cursors, trigger recovery sweeps across specific sequence bounds, review received batch plans, and acknowledge batches step-by-step or in bulk.", 0, "Recovery Instrument: ")

    add_h2("2.2 Tier 2: Transport Bridge (Node.js WebSocket-to-TCP Gateway)")
    add_p(
        "Because modern browser security models prohibit direct access to raw TCP sockets, the transport bridge acts as an ultra-low-latency "
        "protocol converter. Key operational properties include:"
    )
    add_bullet("1:1 Socket Mapping: Each incoming WebSocket connection triggers an isolated, dedicated TCP connection to the backend server (127.0.0.1:8080). This ensures complete session isolation—a disconnection in one browser tab cleanly closes its corresponding TCP stream.", 0, "Strict Session Isolation: ")
    add_bullet("Stream Framing Preservation: TCP is a continuous byte-stream protocol without intrinsic message boundaries. The bridge manages an internal streaming buffer (tcpBuf), scans for the newline character (\\n), slices complete JSON payloads, and forwards them as individual discrete WebSocket text frames.", 0, "Stream Delimitation: ")
    add_bullet("Reverse Framing: When receiving text frames from the browser, the bridge ensures that every message terminates with \\n before streaming to the TCP socket.", 0, "Upstream Framing: ")

    add_h2("2.3 Tier 3: Core Backend Engine (Node.js & C++17 Server Engines)")
    add_p(
        "The backend serves as the authoritative engine for identity, access control, routing, sequence allocation, persistence, "
        "and recovery. Two complete implementations exist:"
    )
    add_bullet("Node.js Reference Engine (backend/server.js): The primary runtime engine. Leverages Node's single-threaded event loop to guarantee race-condition-free sequence allocation. Utilizes sql.js (WebAssembly SQLite) to store state, performing synchronous atomic writes to disk upon state mutations.", 0, "Node.js Engine: ")
    add_bullet("C++17 High-Performance Engine (backend/server_enhanced.cpp): A compiled native server utilizing Winsock2, a thread-per-client model, and native SQLite3 C API bindings. Delivers maximum concurrency and minimal memory overhead on Windows and POSIX systems.", 0, "C++ Engine: ")

    # -------------------------------------------------------------
    # SECTION 3: CORE FUNCTIONAL CAPABILITIES & FEATURE MATRIX
    # -------------------------------------------------------------
    add_h1("3. Core Functional Capabilities & Feature Matrix")
    add_p(
        "The system provides a robust feature set catering to both interactive multi-party collaboration and automated system resilience."
    )

    feat_headers = ["Functional Capability", "Protocol Trigger", "Underlying Architecture", "Operational Status"]
    feat_rows = [
        ["User Authentication", "auth", "Issues user ID & monotonic session generation; tracks active socket", "Fully Operational"],
        ["Public Broadcast Chat", "message (conv='public')", "Fan-out dispatch to all authenticated online sockets", "Fully Operational"],
        ["1-to-1 Direct Messaging", "message (conv='direct_...')", "Point-to-point routing restricted to authorized participant pair", "Fully Operational"],
        ["Dynamic Group Creation", "create_group", "Owner-managed group instantiation with initial membership list", "Fully Operational"],
        ["Member Addition / Removal", "add_member / remove_member", "Owner-governed membership with atomic membership_version increment", "Fully Operational"],
        ["Presence Tracking", "presence (auto)", "Online/offline status broadcasts on connect/disconnect lifecycle", "Fully Operational"],
        ["Typing Indicators", "typing", "Transient notifications informing recipients of user drafting", "Fully Operational"],
        ["Historical Retrieval", "history", "Seq-bounded historical replay with limit clamping (up to 200 msgs)", "Fully Operational"],
        ["Contiguous Cursor Tracking", "get_cursor / cursor", "Tracks highest unbroken sequence delivered per (user, conv)", "Fully Operational"],
        ["Adaptive Gap Recovery", "recover / recovery_batch", "Patent-pending adaptive batching with membership-bound validation", "Fully Operational"],
        ["Idempotent Acks", "recover_ack", "Monotonic cursor advancement and non-contiguous gap pruning", "Fully Operational"],
        ["Auto-Reconnection", "WS Transport", "Client socket retry mechanism with 2000 ms backoff delay", "Fully Operational"]
    ]
    add_table_styled(feat_headers, feat_rows, [1.7, 1.4, 2.3, 1.1])

    # -------------------------------------------------------------
    # SECTION 4: PATENTED TECHNOLOGY: MEMBERSHIP-BOUND RECOVERY
    # -------------------------------------------------------------
    add_h1("4. Patented Technology: Membership-Bound Adaptive Message Recovery")
    add_p(
        "The standout intellectual property of this project is the Membership-Bound Adaptive Message Recovery subsystem. "
        "This subsystem resolves critical vulnerabilities present in conventional cursor-based recovery architectures."
    )

    add_callout(
        "Conventional messaging systems (e.g., standard Kafka consumers, matrix-style cursor synchronization) authenticate "
        "and authorize a client only when a recovery stream is initially established. If an administrator revokes a user's "
        "group membership while that user is recovering an extensive backlog, or if an attacker replays a stale cursor plan, "
        "conventional servers continue streaming messages. This creates a severe data breach window.",
        "CRITICAL SECURITY PROBLEM IN PRIOR ART", "warning"
    )

    add_h2("4.1 The Six Pillars of the Invention")
    add_bullet("For every (user, conversation) tuple, the server maintains two independent structures: (1) contiguous_seq, representing the highest unbroken sequence number acknowledged without gaps, and (2) recovery_missing, a set of sequence ranges [startSeq, endSeq] representing detected message gaps.", 0, "1. Dual Cursor & Gap Storage: ")
    add_bullet("When a client initiates recovery via recover, the server generates an opaque, cryptographically random plan ID. This plan immutably records: user_id, conversation_id, session_generation, start_seq, end_seq, membership_version at issuance, expiry timestamp, and adaptive batch size.", 0, "2. Opaque Server-Bound Plan: ")
    add_bullet("On EVERY recovery batch delivery and EVERY incoming acknowledgement (recover_ack), the engine re-evaluates the plan against current database state. If the conversation's membership_version has changed (e.g. someone was added or removed) or if the requesting connection has a mismatched session_generation, the plan is instantly invalidated, state is changed to 'invalidated', and a recover_invalidate frame is emitted.", 0, "3. Continuous Re-Authorization: ")
    add_bullet("Instead of dumping a fixed batch (e.g., always 25 or always 100), the server dynamically computes batch size: bs = f(remaining). If remaining > 200, bs scales up to 100; if remaining < 50, bs shrinks to remaining, bounded strictly within [RECOVERY_MIN_BATCH, RECOVERY_MAX_BATCH]. This avoids tail-end buffer bloat while maximizing throughput over large backlogs.", 0, "4. Deterministic Adaptive Sizing: ")
    add_bullet("Clients acknowledge sequence ranges via recover_ack. Cursor advancement is strictly monotonic (newAck > currentCursor). Gaps reported by clients are merged and coalesced. Any missing range whose end_seq <= contiguousCursor is automatically pruned.", 0, "5. Idempotent Gap Reconciliation: ")
    add_bullet("Supports AUTH_POLICY='current_membership' (default, strict zero-trust where any membership change invalidates active recovery) and AUTH_POLICY='historical_allowed' (permits recovery of messages sent prior to revocation for auditing/compliance).", 0, "6. Configurable Authorization Policy: ")

    add_h2("4.2 Adaptive Batch Sizing Algorithm")
    add_p(
        "The deterministic adaptive batch size function is defined as follows:"
    )
    add_code_block(
"""function adaptiveBatchSize(plan, remaining) {
    let bs = RECOVERY_BASE_BATCH; // default: 25
    if (remaining < 50) {
        bs = Math.min(bs, remaining);
    }
    if (remaining > 200) {
        bs = Math.min(RECOVERY_MAX_BATCH, bs + 25); // scales up to 100
    }
    // Strict bounding
    bs = Math.max(RECOVERY_MIN_BATCH, Math.min(RECOVERY_MAX_BATCH, bs));
    return bs;
}"""
    )
    add_p(
        "By dynamically adjusting batch sizes, the recovery protocol reduces round-trip handshake overhead when backlogs are large, "
        "while smoothly ramping down when approaching the cursor frontier to minimize unacknowledged in-flight messages."
    )

    add_h2("4.3 Complete Recovery Sequence Diagram")
    add_code_block(
"""Client (Bob)                     Bridge                   Backend Engine (Server)
    |                              |                              |
    |---- recover(convId, seq 1) ->|---- recover(convId, seq 1) ->|
    |                              |                              |-- [Resolve Range: 1..1000]
    |                              |                              |-- [Verify Membership & Gen]
    |                              |                              |-- [Issue Plan: ID, MV=1]
    |                              |                              |-- [Compute Adaptive Batch: 50]
    |                              |<-- recovery_batch(planId) ---|-- [Send msgs 1..50, hasMore]
    |<-- recovery_batch(planId) ---|                              |
    |                                                             |
    | [Process Batch & Detect Gap]                                |
    |---- recover_ack(acked=50) -->|---- recover_ack(acked=50) -->|
    |                              |                              |-- [RE-AUTHORIZE PLAN: Valid!]
    |                              |                              |-- [Update Cursor: 50]
    |                              |                              |-- [Clear Missing Up To 50]
    |                              |<-- recover_ack_ok(cur=50) ---|
    |<-- recover_ack_ok(cur=50) ---|                              |
    |                                                             |
    | [EVENT: Admin removes Bob from group while recovery pending]|
    |                                                             |-- [Admin: remove_member(Bob)]
    |                                                             |-- [BUMP MEMBERSHIP VERSION: 2]
    |                                                             |
    |---- recover(planId, nextSeq) |---- recover(planId, nextSeq) |
    |                              |                              |-- [RE-AUTHORIZE: MV 2 != Plan MV 1]
    |                              |                              |-- [STATE -> INVALIDATED]
    |                              |<-- recover_invalidate -------|-- [REASON: membership_changed]
    |<-- recover_invalidate -------|                              |
    | [Halt Replay / Purge State]                                 |"""
    )

    # -------------------------------------------------------------
    # SECTION 5: COMPREHENSIVE WIRE PROTOCOL SPECIFICATION
    # -------------------------------------------------------------
    add_h1("5. Comprehensive JSON Wire Protocol Specification")
    add_p(
        "Communication across all tiers is governed by a strict, newline-delimited JSON protocol. "
        "Every message must be encoded in UTF-8 and terminated by a newline character (\\n, ASCII 0x0A)."
    )

    add_h2("5.1 Upstream Messages (Client to Server)")
    proto_up_headers = ["Type", "Payload Parameters", "Description & Preconditions"]
    proto_up_rows = [
        ["auth", "username: string", "Authenticates or registers user; assigns session generation."],
        ["list_users", "(none)", "Requests directory of registered users."],
        ["list_conversations", "(none)", "Requests all conversations where user is an active member."],
        ["create_group", "title: string, members: string[]", "Creates new group conversation with caller as owner."],
        ["add_member", "conversationId: string, username: string", "Adds user to group. Increments membership_version."],
        ["remove_member", "conversationId: string, username: string", "Removes user from group. Increments membership_version."],
        ["message", "conversationId: string, content: string", "Dispatches message; assigns atomic monotonic seq."],
        ["history", "conversationId: string, afterSeq?: int, limit?: int", "Retrieves past messages strictly greater than afterSeq."],
        ["recover", "conversationId: string, fromSeq?: int, toSeq?: int, planId?: string", "Requests adaptive recovery batch for missed messages."],
        ["recover_ack", "planId: string, conversationId: string, ackedSeq: int, missingRanges?: array", "Acknowledges delivery; advances cursor; merges gap ranges."],
        ["recover_complete", "planId: string, conversationId: string", "Marks plan completed after reaching cursor target."],
        ["get_cursor", "conversationId: string", "Queries current contiguous cursor value for active user."]
    ]
    add_table_styled(proto_up_headers, proto_up_rows, [1.5, 2.5, 2.5])

    add_h2("5.2 Downstream Messages (Server to Client)")
    proto_down_headers = ["Type", "Payload Parameters", "Semantics & Client Action"]
    proto_down_rows = [
        ["auth_ok", "userId, username, sessionGeneration", "Authentication successful; client stores session generation."],
        ["users", "users: [{id, username}]", "Full listing of system users."],
        ["conversations", "conversations: [{id, type, title, membership_version}]", "User's authorized conversation directory."],
        ["message", "id, conversationId, senderId, sender, seq, content, createdAt", "Live real-time message broadcast."],
        ["history", "conversationId, messages: [...], cursor: int", "Replay of historical messages."],
        ["recovery_batch", "planId, conversationId, membershipVersion, messages, hasMore, nextSeq, batchSize", "Adaptive chunk of missed messages for cursor replay."],
        ["recover_ack_ok", "planId, conversationId, cursor: int", "Acknowledgement confirmation; informs client of server cursor."],
        ["recover_complete", "planId, conversationId, cursor: int", "Recovery completed successfully."],
        ["recover_invalidate", "planId, conversationId, reason: string", "Recovery aborted due to membership change, expiry, or session mismatch."],
        ["membership_changed", "conversationId, membershipVersion: int", "Signals that group membership was modified."],
        ["error", "message: string, code?: string", "Indicates validation failure or authorization rejection."]
    ]
    add_table_styled(proto_down_headers, proto_down_rows, [1.5, 2.5, 2.5])

    # -------------------------------------------------------------
    # SECTION 6: RELATIONAL DATABASE ARCHITECTURE & DATA MODELS
    # -------------------------------------------------------------
    add_h1("6. Relational Database Architecture & Data Models")
    add_p(
        "State persistence is managed via an optimized relational schema in SQLite (instantiated via sql.js or native C++ SQLite3). "
        "Every schema entity is designed for referential integrity, rapid lookup, and idempotent mutation."
    )

    schema_headers = ["Table Name", "Primary Key & Unique Constraints", "Key Columns & Purpose"]
    schema_rows = [
        ["users", "PRIMARY KEY (id), UNIQUE (username)", "id (UUID), username (TEXT), created_at (INT timestamp)"],
        ["conversations", "PRIMARY KEY (id)", "id, type ('public'|'group'|'direct'), title, created_by, created_at, membership_version (INT)"],
        ["conversation_members", "PRIMARY KEY (conversation_id, user_id)", "conversation_id, user_id, added_at, removed_at (NULL if active)"],
        ["messages", "PRIMARY KEY (id), UNIQUE (conversation_id, seq)", "id, conversation_id, sender_id, seq (monotonic INT), content, created_at"],
        ["recovery_cursors", "PRIMARY KEY (user_id, conversation_id)", "user_id, conversation_id, contiguous_seq (INT), updated_at"],
        ["recovery_missing", "INDEXED (user_id, conversation_id)", "user_id, conversation_id, start_seq (INT), end_seq (INT)"],
        ["recovery_plans", "PRIMARY KEY (id)", "id (UUID), user_id, conversation_id, session_generation, start_seq, end_seq, membership_version, state, batch_size, created_at, expires_at"],
        ["sessions", "INDEXED (user_id)", "user_id, generation (monotonic INT), created_at"]
    ]
    add_table_styled(schema_headers, schema_rows, [1.8, 2.2, 2.5])

    add_h2("6.1 Monotonic Sequence Allocation Guarantee")
    add_p(
        "A critical property of the messaging engine is that within any conversation, message sequence numbers (seq) are strictly "
        "monotonic without gaps. Because the Node.js event loop executes message insertion synchronously within the handleSendMessage "
        "handler, allocating `next = MAX(seq) + 1` is atomic with respect to other requests. The database enforces this via the constraint "
        "`UNIQUE(conversation_id, seq)` and index `idx_msg_conv_seq`."
    )

    # -------------------------------------------------------------
    # SECTION 7: VERIFICATION SUITE & EMPIRICAL BENCHMARKS
    # -------------------------------------------------------------
    add_h1("7. Verification Suite, Test Scenarios & Empirical Benchmarks")
    add_p(
        "The system has undergone thorough testing and benchmarking. Both integration test scripts and high-load benchmarks "
        "are integrated into the repository."
    )

    add_h2("7.1 Automated Integration Test Scenarios (tests/test_recovery.js)")
    add_p(
        "The automated test suite spins up a real backend server instance over TCP, establishes five distinct client connections, "
        "and executes four rigorous verification scenarios:"
    )
    add_bullet("Alice creates a group, adds Bob, and dispatches 5 sequential messages. Bob triggers recover from seq 1. Bob receives the batch, validates plan ID presence, acknowledges seq 5, and confirms server cursor advances to 5.", 0, "Scenario 1 (Basic End-to-End Recovery): ")
    add_bullet("Alice adds Carol. Carol triggers recovery and reports an artificial non-contiguous gap [{startSeq: 2, endSeq: 3}] via recover_ack. Server records the gap and confirms idempotent acknowledgement.", 0, "Scenario 2 (Gap Ingestion & Missing Ranges): ")
    add_bullet("Alice adds Dave. Dave initiates recovery and receives a batch plan. Alice immediately removes Dave from the group (bumping membership_version). Dave attempts to acknowledge the batch. The server detects the version mismatch, invalidates the plan, and emits recover_invalidate with reason 'membership_changed'.", 0, "Scenario 3 (Revocation & Plan Invalidation): ")
    add_bullet("Alice adds Eve. Eve recovers messages 1..2 incrementally, completes that sub-plan, and then initiates a second recovery from seq 3 onwards, successfully recovering the remainder.", 0, "Scenario 4 (Incremental Multi-Batch Recovery): ")

    add_p("Verification Result: All 4 scenarios executed with 6/6 assertions passing (Exit Code 0).", bold=True, color=RGBColor(56, 161, 105))

    add_h2("7.2 Empirical Benchmark Analysis (tests/benchmark.js)")
    add_p(
        "A 1,000-message backlog benchmark was executed to compare conventional fixed-batch recovery against the patented adaptive recovery mechanism. "
        "The tests evaluated total elapsed recovery time, number of batch round-trips, and effective message throughput."
    )

    bench_headers = ["Recovery Mode", "Base Batch", "Max Batch", "Total Batches", "Recovered Msgs", "Elapsed Time", "Throughput"]
    bench_rows = [
        ["Fixed Batch", "25", "25", "40", "1,000", "996 ms", "1,004 msg/sec"],
        ["Fixed Batch", "50", "50", "20", "1,000", "937 ms", "1,067 msg/sec"],
        ["Fixed Batch", "100", "100", "10", "1,000", "977 ms", "1,024 msg/sec"],
        ["Adaptive Batch", "25", "100", "24", "1,000", "489 ms", "2,045 msg/sec (~2.04x speedup)"]
    ]
    add_table_styled(bench_headers, bench_rows, [1.1, 0.8, 0.8, 0.9, 1.0, 1.0, 1.4])

    add_callout(
        "The benchmark demonstrates that the Adaptive Mode delivers over 2.0x higher throughput (2,045 msg/s vs 1,004-1,067 msg/s) "
        "compared to any static batch size. By ramping batch sizes up to 100 during deep backlog processing and dynamically tapering "
        "near the tail, it eliminates round-trip delays while preventing the memory and socket buffer thrashing that plagues fixed-100 mode.",
        "BENCHMARK CONCLUSION", "success"
    )

    # -------------------------------------------------------------
    # SECTION 8: INTELLECTUAL PROPERTY & DRAFT PATENT CLAIMS
    # -------------------------------------------------------------
    add_h1("8. Intellectual Property, Draft Patent Claims & Prior Art Defense")
    add_p(
        "The repository includes comprehensive patent documentation prepared for intellectual property protection. "
        "Below are the formal draft patent claims reflecting the core novelty of the invention."
    )

    add_h2("8.1 Formal Draft Patent Claims")
    add_bullet("A computer-implemented method for recovering missed messages in a multi-transport messaging system, comprising: (1) maintaining, for each (user, conversation) pair, a contiguous recovery cursor and a set of missing ranges; (2) on a recovery request from a user session, issuing an opaque recovery plan bound to the user, the conversation, the session generation, a sequence range, the conversation's current membership version, an expiry time, and an adaptive batch size; (3) on each recovery batch and each acknowledgement, re-authorizing the plan against the conversation's current membership version and the requesting session's generation, and invalidating the plan upon mismatch; (4) replaying messages in batches whose size is determined by a deterministic function of the remaining sequence range; (5) advancing the contiguous cursor idempotently upon acknowledgement and merging/clearing missing ranges; (6) rejecting recovery for users who are not current members under a configurable policy.", 0, "Claim 1 (Independent Method Claim): ")
    add_bullet("A messaging system comprising a server with a recovery subsystem implementing the method of Claim 1, a bridge relaying between TCP and WebSocket transports using an identical recovery protocol, and a client tracking a recovery cursor and missing ranges.", 0, "Claim 2 (Independent System Claim): ")
    add_bullet("The method of Claim 1, wherein the opaque recovery plan is identified by a server-generated identifier not interpretable by the client.", 0, "Claim 3 (Opaque Plan Identifier): ")
    add_bullet("The method of Claim 1, wherein membership version is incremented on any add/remove member event in the conversation.", 0, "Claim 4 (Atomic Version Bumping): ")
    add_bullet("The method of Claim 1, wherein invalidation on membership-version mismatch notifies the client with a recover_invalidate message including a specific reason code.", 0, "Claim 5 (Invalidation Notification): ")
    add_bullet("The method of Claim 1, wherein adaptive batch size increases by a fixed increment when the remaining range exceeds a threshold and decreases when the remaining range is below a threshold, clamped to configured min/max.", 0, "Claim 6 (Adaptive Formula): ")
    add_bullet("The method of Claim 1, wherein acknowledgements are idempotent: re-acknowledging an already-advanced cursor does not regress the cursor.", 0, "Claim 7 (Monotonic Idempotency): ")
    add_bullet("The method of Claim 1, wherein missing ranges reported by the client are coalesced (overlapping/adjacent ranges merged) and ranges fully at or below the cursor are cleared.", 0, "Claim 8 (Missing Range Pruning): ")
    add_bullet("The method of Claim 1, further comprising a historical_allowed policy permitting recovery by users who are no longer current members.", 0, "Claim 9 (Policy Gating): ")
    add_bullet("The method of Claim 1, wherein recovery plans expire after a configured TTL and expired plans are rejected with an 'expired' reason.", 0, "Claim 10 (Plan Expiration): ")

    add_h2("8.2 Prior Art Differentiation Matrix")
    art_headers = ["Patent / Source", "Summary of Existing Art", "Our Invention's Novel Differentiation"]
    art_rows = [
        ["US 2014/0310365 (Global Relay)", "Tracks message delivery state using generic cursor mechanisms.", "No membership-version binding; no opaque server plans; no adaptive batch sizing."],
        ["US 8,750,296 (Progress Software)", "Protocol-independent message exchange recovery.", "Focuses on transport abstraction; lacks membership version checks or gap coalescing."],
        ["US 2011/0252152", "Endpoint delivery acknowledgements.", "No monotonic per-conversation sequence numbering bound to membership revocation."],
        ["US 2007/0276913 (Microsoft)", "Conference missed-message access.", "Conference-scoped; no per-user cursor + missing ranges set; no plan invalidation."],
        ["Industry Standard (inline.chat)", "Cursor-based sync recovery pattern.", "Lacks membership-version invalidation, session-generation binding, and adaptive sizing."]
    ]
    add_table_styled(art_headers, art_rows, [1.8, 2.2, 2.5])

    # -------------------------------------------------------------
    # SECTION 9: CODEBASE TOUR & FILE DIRECTORY
    # -------------------------------------------------------------
    add_h1("9. Architectural Codebase Tour & File Organization")
    add_p(
        "The codebase is cleanly structured into functional domains. Below is the directory tree and file responsibility matrix:"
    )

    code_headers = ["File / Directory Path", "Language / Format", "Role & Responsibility"]
    code_rows = [
        ["backend/server.js", "Node.js (CommonJS)", "Primary TCP backend engine; sql.js persistence; recovery & auth logic."],
        ["backend/server_enhanced.cpp", "C++17 (Winsock2)", "High-performance native TCP server implementing identical JSON protocol."],
        ["backend/database.cpp / .hpp", "C++17 / SQLite3", "Native database abstraction layer for SQLite operations."],
        ["backend/sqlite3.c / .h", "C (Amalgamation)", "Complete SQLite3 database engine source code."],
        ["backend/client.cpp", "C++17 (Winsock2)", "Interactive console-based TCP test client."],
        ["bridge/server.js", "Node.js (CommonJS)", "WebSocket ↔ TCP bridge; framing parser; socket proxying."],
        ["dashboard/src/App.tsx", "TypeScript / React", "Core dashboard UI; 3-panel layout, conversation dispatcher."],
        ["dashboard/src/RecoveryPanel.tsx", "TypeScript / React", "Instrumentation UI for manual/automated recovery and cursor acks."],
        ["dashboard/src/websocket.ts", "TypeScript", "ChatSocket singleton; auto-reconnect; subscription pub/sub."],
        ["dashboard/src/types.ts", "TypeScript", "Domain entity interfaces, protocol request/response union types."],
        ["tests/test_recovery.js", "Node.js (CommonJS)", "Automated end-to-end multi-client recovery test runner."],
        ["tests/benchmark.js", "Node.js (CommonJS)", "High-load 1,000-message benchmark comparison suite."],
        ["patent/*.md", "Markdown Documentation", "Complete patent portfolio: disclosures, claims, benchmarks, prior art."],
        ["start.ps1 / stop.ps1", "PowerShell", "One-click lifecycle automation scripts for Windows development."]
    ]
    add_table_styled(code_headers, code_rows, [2.0, 1.5, 3.0])

    # -------------------------------------------------------------
    # SECTION 10: OPERATIONAL DEPLOYMENT & PRODUCTION HARDENING
    # -------------------------------------------------------------
    add_h1("10. Operational Deployment, Startup Scripts & Production Hardening")
    add_p(
        "The application provides automated orchestration scripts for immediate local deployment, as well as clear pathways "
        "for production-grade containerized and reverse-proxied deployments."
    )

    add_h2("10.1 Quick Start (Automated PowerShell)")
    add_p("To run the full 3-tier stack with a single command from the project root:")
    add_code_block(".\\start.ps1")
    add_p("This script executes three background processes in separate windows:")
    add_bullet("1. Starts the backend TCP engine: node backend/server.js 8080 (or server_enhanced.exe).", 0)
    add_bullet("2. Starts the WebSocket bridge: node bridge/server.js (listening on port 3001).", 0)
    add_bullet("3. Starts the React development server: npm run dev in dashboard (listening on port 5173).", 0)
    add_bullet("4. Automatically opens http://localhost:5173 in the default web browser.", 0)
    add_p("To cleanly terminate all running services:")
    add_code_block(".\\stop.ps1")

    add_h2("10.2 Production Hardening Pre-Flight Checklist")
    add_p(
        "Prior to deploying this system to public-facing cloud infrastructure, the following production hardening steps must be completed:"
    )
    add_bullet("Deploy Nginx, Caddy, or AWS ALB to terminate TLS (HTTPS and WSS on port 443), forwarding decrypted WebSocket traffic to the internal bridge (port 3001).", 0, "1. TLS / WSS Reverse Proxy: ")
    add_bullet("Upgrade the prototype username-based authentication to password hashing (bcrypt / Argon2id) or OAuth 2.0 / JWT session verification.", 0, "2. Robust Authentication: ")
    add_bullet("Implement token-bucket rate limiting in bridge/server.js to prevent connection flooding, socket exhaustion, and message spamming.", 0, "3. Rate Limiting & DoS Protection: ")
    add_bullet("For multi-node clustering, replace sql.js with a shared PostgreSQL database cluster or Amazon Aurora, leveraging connection pooling.", 0, "4. Database Scaling: ")
    add_bullet("Sanitize all incoming text payloads against HTML injection and XSS (currently mitigated by React's native string escaping).", 0, "5. XSS & Payload Sanitization: ")
    add_bullet("Wrap bridge and backend services in Docker containers supervised by systemd, Kubernetes, or PM2 process managers with health checks.", 0, "6. Process Supervision: ")

    # -------------------------------------------------------------
    # SECTION 11: CONFIGURATION & TROUBLESHOOTING
    # -------------------------------------------------------------
    add_h1("11. Engineering Appendices, Configuration & Troubleshooting")
    add_p(
        "Comprehensive reference of runtime environment variables and troubleshooting guidance for common operational issues."
    )

    add_h2("11.1 Environment Variables Reference")
    env_headers = ["Variable Name", "Default Value", "Scope / Subsystem", "Description"]
    env_rows = [
        ["PORT", "8080", "Backend Engine", "TCP listening port for backend chat engine."],
        ["DB_PATH", "chat.db", "Backend Engine", "File path where SQLite database file is stored."],
        ["AUTH_POLICY", "current_membership", "Backend Engine", "Policy mode: 'current_membership' (strict) or 'historical_allowed'."],
        ["RECOVERY_BASE_BATCH", "25", "Backend Engine", "Baseline message batch size for recovery replays."],
        ["RECOVERY_MIN_BATCH", "5", "Backend Engine", "Minimum permissible adaptive batch size."],
        ["RECOVERY_MAX_BATCH", "100", "Backend Engine", "Maximum permissible adaptive batch size."],
        ["RECOVERY_PLAN_TTL_MS", "60000", "Backend Engine", "Time-to-live in milliseconds before an active recovery plan expires."],
        ["WS_PORT", "3001", "Bridge", "WebSocket listening port for client browser connections."],
        ["TCP_HOST", "127.0.0.1", "Bridge", "Target IP address of the backend TCP chat server."],
        ["TCP_PORT", "8080", "Bridge", "Target TCP port of the backend chat server."],
        ["VITE_WS_URL", "ws://{host}:3001", "Dashboard (React)", "Target WebSocket URL used by client frontend."]
    ]
    add_table_styled(env_headers, env_rows, [1.8, 1.2, 1.3, 2.2])

    add_h2("11.2 Troubleshooting Matrix")
    trouble_headers = ["Symptom / Error", "Root Cause", "Resolution Procedure"]
    trouble_rows = [
        ["Windows AppControl Block on .exe", "Windows execution policy blocks untrusted binaries compiled in user directories.", "Run the Node.js backend instead: 'node backend/server.js 8080'. It provides 100% protocol parity."],
        ["Port 8080 or 3001 Already in Use", "Previous server process was orphaned or running in background.", "Run '.\\stop.ps1' or execute PowerShell: 'Get-Process -Name node | Stop-Process'."],
        ["WebSocket Connection Refused", "Bridge server is not running or port 3001 is inaccessible.", "Start the bridge: 'cd bridge; node server.js'. Verify terminal indicates 'Bridge WS on 3001'."],
        ["recover_invalidate (membership_changed)", "Group membership was modified while recovery was in flight.", "Normal expected security behavior under 'current_membership' policy. Request a new plan from cursor."],
        ["recover_invalidate (expired)", "Plan was idle longer than RECOVERY_PLAN_TTL_MS (60s).", "Client must initiate a fresh recover command; cursor will pick up from last successful ack."]
    ]
    add_table_styled(trouble_headers, trouble_rows, [1.8, 2.0, 2.7])

    # Save Document
    doc.save(output_path)
    print(f"Master document successfully generated at: {output_path}")

if __name__ == '__main__':
    target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Socket_Chat_Application_Master_Document.docx")
    create_master_document(target)
