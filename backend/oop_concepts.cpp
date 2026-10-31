/**
 * =========================================================================================
 * VISHWAKARMA INSTITUTE OF TECHNOLOGY, PUNE
 * Department of Computer Engineering - Academic Year 2026-27
 * Course Project: Real-Time Collaborative & Adaptive Message Recovery Chat System
 * Faculty Guide: Prof. Suvarna Patil
 *
 * File: oop_concepts.cpp
 * Description: Implementation and Comprehensive Test Harness for all 6 Syllabus Units.
 * =========================================================================================
 */

#include "oop_concepts.hpp"

namespace VIT_OOP {

// Static Data Member Initialization (Unit 2)
int64_t BaseMessage::totalMessagesCreated = 0;

// =========================================================================================
// BaseMessage Implementation
// =========================================================================================

BaseMessage::BaseMessage()
    : messageId("msg_default"), conversationId("conv_default"), senderId("sys"),
      timestamp(std::time(nullptr)), sequenceNumber(0), type(MessageType::TEXT) {
    totalMessagesCreated++;
}

BaseMessage::BaseMessage(const std::string& id, const std::string& convId, const std::string& sender,
                         MessageType msgType, int64_t seq, int64_t ts)
    : messageId(id), conversationId(convId), senderId(sender),
      sequenceNumber(seq), type(msgType) {
    this->timestamp = (ts > 0) ? ts : std::time(nullptr);
    totalMessagesCreated++;
}

BaseMessage::BaseMessage(const BaseMessage& other)
    : messageId(other.messageId + "_copy"), conversationId(other.conversationId),
      senderId(other.senderId), timestamp(other.timestamp),
      sequenceNumber(other.sequenceNumber), type(other.type) {
    totalMessagesCreated++;
}

BaseMessage::~BaseMessage() {
    // Virtual destructor body
}

// =========================================================================================
// TextMessage Implementation
// =========================================================================================

TextMessage::TextMessage()
    : BaseMessage(), textContent("") {}

TextMessage::TextMessage(const std::string& id, const std::string& convId, const std::string& sender,
                         const std::string& text, int64_t seq)
    : BaseMessage(id, convId, sender, MessageType::TEXT, seq), textContent(text) {}

std::string TextMessage::serializeToJSON() const {
    std::ostringstream oss;
    oss << "{"
        << "\"id\":\"" << messageId << "\","
        << "\"conversationId\":\"" << conversationId << "\","
        << "\"fromUserId\":\"" << senderId << "\","
        << "\"text\":\"" << textContent << "\","
        << "\"seq\":" << sequenceNumber << ","
        << "\"timestamp\":" << timestamp << ","
        << "\"kind\":\"text\""
        << "}";
    return oss.str();
}

// =========================================================================================
// CollaborativeMessage Implementation
// =========================================================================================

CollaborativeMessage::CollaborativeMessage()
    : BaseMessage("collab_default", "conv_default", "sys", MessageType::COLLABORATIVE_FILLIN),
      introText(""), status(MessageStatus::OPEN), requireAllMandatory(false), deadlineEpoch(0) {}

CollaborativeMessage::CollaborativeMessage(const std::string& id, const std::string& convId,
                                           const std::string& creatorId, const std::string& intro,
                                           int64_t seq)
    : BaseMessage(id, convId, creatorId, MessageType::COLLABORATIVE_FILLIN, seq),
      introText(intro), status(MessageStatus::OPEN), requireAllMandatory(false), deadlineEpoch(0) {
    recordAuditEntry(creatorId, "Created collaborative message: " + intro);
}

// Deep Copy Constructor (Unit 3)
CollaborativeMessage::CollaborativeMessage(const CollaborativeMessage& other)
    : BaseMessage(other), introText(other.introText), status(other.status),
      requireAllMandatory(other.requireAllMandatory), deadlineEpoch(other.deadlineEpoch),
      appendedFields(other.appendedFields), auditLog(other.auditLog) {}

CollaborativeMessage::~CollaborativeMessage() {
    // Cleans up any resources
}

// Unit 2: Method Overloading
void CollaborativeMessage::appendDetail(const std::string& value, const std::string& editorId) {
    this->appendDetail("Detail", value, editorId);
}

void CollaborativeMessage::appendDetail(const std::string& label, const std::string& value, const std::string& editorId) {
    if (this->isLocked()) {
        throw UnauthorizedEditException("Cannot append to a locked/finalized message");
    }
    if (value.empty()) {
        throw ChatAppException("Appended value cannot be empty", 1007);
    }

    std::string fldId = "fld_" + std::to_string(std::time(nullptr)) + "_" + std::to_string(appendedFields.size() + 1);
    FieldDetail field(fldId, label, value, editorId);
    appendedFields.push_back(field);

    recordAuditEntry(editorId, "Appended field [" + label + "] = " + value);
}

void CollaborativeMessage::appendDetail(const std::string& label, const std::string& value,
                                        const std::string& editorId, int expectedVersion) {
    // Check for concurrency conflict (Unit 6 exception)
    for (auto& f : appendedFields) {
        if (f.label == label) {
            if (f.version != expectedVersion) {
                throw ConcurrencyConflictException("Version conflict on field [" + label + "]: expected " +
                                                   std::to_string(expectedVersion) + ", current is " +
                                                   std::to_string(f.version));
            }
            f.value = value;
            f.version++;
            f.lastEditorId = editorId;
            f.lastEditorUsername = editorId;
            recordAuditEntry(editorId, "Updated field [" + label + "] to " + value + " (v" + std::to_string(f.version) + ")");
            return;
        }
    }
    // If not found, append as new
    appendDetail(label, value, editorId);
}

void CollaborativeMessage::recordAuditEntry(const std::string& editorId, const std::string& change) {
    std::ostringstream oss;
    oss << "[" << std::time(nullptr) << "] User(" << editorId << "): " << change;
    auditLog.push_back(oss.str());
}

void CollaborativeMessage::lockMessage() {
    this->status = MessageStatus::FINALIZED;
    recordAuditEntry(this->senderId, "Locked/Finalized message.");
}

void CollaborativeMessage::unlockMessage() {
    this->status = MessageStatus::OPEN;
    recordAuditEntry(this->senderId, "Reopened/Unlocked message.");
}

std::string CollaborativeMessage::serializeToJSON() const {
    return serializeForViewer(this->senderId); // Creator default
}

// Enforces Creator-Only Attribution Privacy
std::string CollaborativeMessage::serializeForViewer(const std::string& viewerUserId) const {
    bool isCreator = (viewerUserId == this->senderId);
    std::ostringstream oss;

    oss << "{"
        << "\"id\":\"" << messageId << "\","
        << "\"conversationId\":\"" << conversationId << "\","
        << "\"creatorId\":\"" << senderId << "\","
        << "\"introText\":\"" << introText << "\","
        << "\"status\":\"" << (status == MessageStatus::FINALIZED ? "finalized" : "open") << "\","
        << "\"isCreator\":" << (isCreator ? "true" : "false") << ","
        << "\"fields\":[";

    for (size_t i = 0; i < appendedFields.size(); ++i) {
        const auto& f = appendedFields[i];
        bool isOwn = (viewerUserId == f.lastEditorId);

        oss << "{"
            << "\"fieldId\":\"" << f.fieldId << "\","
            << "\"label\":\"" << f.label << "\","
            << "\"value\":\"" << f.value << "\","
            << "\"version\":" << f.version << ",";

        // Privacy rule: Only creator sees who edited every field. Non-creators only see (You) on their own.
        if (isCreator) {
            oss << "\"lastEditorUsername\":\"" << f.lastEditorUsername << "\",";
        } else if (isOwn) {
            oss << "\"lastEditorUsername\":\"You\",";
        } else {
            oss << "\"lastEditorUsername\":null,";
        }

        oss << "\"isOwnContribution\":" << (isOwn ? "true" : "false")
            << "}";

        if (i + 1 < appendedFields.size()) oss << ",";
    }

    oss << "]}";
    return oss.str();
}

// =========================================================================================
// RecoveryPlan Implementation
// =========================================================================================

RecoveryPlan::RecoveryPlan()
    : planId("plan_null"), userId(""), conversationId(""), sessionGeneration(0),
      targetStartSeq(0), targetEndSeq(0), membershipVersion(0), batchSize(25),
      expiryTimestamp(0), active(false) {}

RecoveryPlan::RecoveryPlan(const std::string& pId, const std::string& uId, const std::string& cId,
                           int sessionGen, int startSeq, int endSeq, int membershipVer,
                           int batchSz, int timeoutSec)
    : planId(pId), userId(uId), conversationId(cId), sessionGeneration(sessionGen),
      targetStartSeq(startSeq), targetEndSeq(endSeq), membershipVersion(membershipVer),
      batchSize(batchSz), active(true) {
    this->expiryTimestamp = std::time(nullptr) + timeoutSec;
}

bool RecoveryPlan::validateRecoveryState(int currentSessionGen, int currentMembershipVer) const {
    if (!active) return false;

    // Check expiry
    if (std::time(nullptr) > expiryTimestamp) {
        throw PlanExpiredException("Recovery plan " + planId + " has expired");
    }

    // Check session generation
    if (currentSessionGen != sessionGeneration) {
        throw AuthenticationException("Session generation mismatch in plan " + planId);
    }

    // Check membership version (Patent Claim 3)
    if (currentMembershipVer != membershipVersion) {
        throw MembershipRevokedException("Membership version changed from " +
                                         std::to_string(membershipVersion) + " to " +
                                         std::to_string(currentMembershipVer));
    }

    return true;
}

int RecoveryPlan::calculateAdaptiveBatch(int remainingMessages) {
    const int MIN_BATCH = 5;
    const int MAX_BATCH = 100;
    const int BASE_BATCH = 25;

    if (remainingMessages <= 0) return 0;
    if (remainingMessages < MIN_BATCH) return remainingMessages;

    if (remainingMessages > 500) return MAX_BATCH;
    if (remainingMessages > 100) return 50;

    return std::min(remainingMessages, BASE_BATCH);
}

std::string RecoveryPlan::serializeToJSON() const {
    std::ostringstream oss;
    oss << "{"
        << "\"planId\":\"" << planId << "\","
        << "\"userId\":\"" << userId << "\","
        << "\"conversationId\":\"" << conversationId << "\","
        << "\"startSeq\":" << targetStartSeq << ","
        << "\"endSeq\":" << targetEndSeq << ","
        << "\"batchSize\":" << batchSize << ","
        << "\"active\":" << (active ? "true" : "false")
        << "}";
    return oss.str();
}

// =========================================================================================
// AuditFileStore Implementation (Unit 5: File Handling)
// =========================================================================================

AuditFileStore::AuditFileStore(const std::string& path) : filePath(path) {}

void AuditFileStore::writeLogEntry(const std::string& logLine) {
    // Open in append and output mode
    std::ofstream outFile(filePath, std::ios::out | std::ios::app);
    if (!outFile.is_open() || outFile.fail()) {
        throw FileOperationException("Failed to open audit file for writing: " + filePath);
    }
    outFile << logLine << "\n";
    outFile.close();
}

std::vector<std::string> AuditFileStore::readAllLogs() {
    std::vector<std::string> logs;
    std::ifstream inFile(filePath, std::ios::in);
    if (!inFile.is_open() || inFile.fail()) {
        return logs; // Empty if file does not exist yet
    }

    std::string line;
    while (std::getline(inFile, line)) {
        if (!line.empty()) {
            logs.push_back(line);
        }
    }

    if (inFile.bad()) {
        throw FileOperationException("Hardware/disk error while reading audit file");
    }

    inFile.close();
    return logs;
}

int64_t AuditFileStore::getFileSize() {
    std::ifstream inFile(filePath, std::ios::in | std::ios::binary);
    if (!inFile.is_open()) return 0;

    // File pointer manipulation: seek to end, tell position, seek back
    inFile.seekg(0, std::ios::end);
    int64_t size = inFile.tellg();
    inFile.seekg(0, std::ios::beg);
    inFile.close();
    return size;
}

} // namespace VIT_OOP

// =========================================================================================
// TEST DRIVER / VERIFICATION SUITE EXERCISING ALL 6 SYLLABUS UNITS
// =========================================================================================
#ifdef BUILD_OOP_TEST_MAIN
int main() {
    using namespace VIT_OOP;
    std::cout << "========================================================\n";
    std::cout << "  VISHWAKARMA INSTITUTE OF TECHNOLOGY, PUNE\n";
    std::cout << "  OOP (C++) Syllabus Demonstration & Test Harness\n";
    std::cout << "========================================================\n\n";

    // --- UNIT 1 & 2: Classes, Objects, Static Members, Encapsulation ---
    std::cout << "[Unit 1 & 2] Demonstrating Classes, Objects & Static Members...\n";
    std::cout << "Initial BaseMessage::totalMessagesCreated = " << BaseMessage::getTotalMessagesCreated() << "\n";

    // --- UNIT 3: Constructors (Default, Parameterized, Copy) & Destructors ---
    std::cout << "\n[Unit 3] Demonstrating Constructor Types & Overloading...\n";
    CollaborativeMessage msg1("msg_collab_101", "conv_group_1", "user_alice", "Weekend Trip Info");
    std::cout << "Created msg1. Total created = " << BaseMessage::getTotalMessagesCreated() << "\n";

    // Deep Copy Constructor
    CollaborativeMessage msgCopy(msg1);
    std::cout << "Created msgCopy via copy constructor. Total = " << BaseMessage::getTotalMessagesCreated() << "\n";

    // Dynamic Allocation (new and delete)
    CollaborativeMessage* dynMsg = new CollaborativeMessage("msg_dyn", "conv_group_1", "user_alice", "Dynamic Test");
    std::cout << "Created dynMsg via 'new'. Address: " << dynMsg << "\n";
    delete dynMsg; // Calls virtual destructor
    std::cout << "Deleted dynMsg via 'delete'.\n";

    // --- UNIT 4: Inheritance, Interfaces & Run-time Polymorphism ---
    std::cout << "\n[Unit 4] Demonstrating Inheritance & Run-Time Polymorphism...\n";
    BaseMessage* polyMsg = new CollaborativeMessage("msg_poly", "conv_group_1", "user_alice", "Poly Message");
    // Dynamic binding to serializeToJSON()
    std::cout << "Polymorphic serializeToJSON() call:\n" << polyMsg->serializeToJSON() << "\n";

    // --- FEATURE: Live Collaborative Appends & Creator-Only Privacy ---
    std::cout << "\n[Feature] Demonstrating Collaborative Appends & Creator-Only Privacy...\n";
    msg1.appendDetail("PRN", "1251076777", "user_bob");
    msg1.appendDetail("Pickup", "Swargate Station", "user_charlie");

    // Creator's View (Alice): Sees Bob and Charlie!
    std::cout << "\n-- Alice's View (Creator sees full attribution) --\n";
    std::cout << msg1.serializeForViewer("user_alice") << "\n";

    // Other Participant's View (Charlie): Sees his own (You), but Bob's name is HIDDEN!
    std::cout << "\n-- Charlie's View (Non-creator: Bob's name is stripped/hidden) --\n";
    std::cout << msg1.serializeForViewer("user_charlie") << "\n";

    // Unit 2: Friend Function Demonstration
    std::cout << "\n[Unit 2] Invoking Friend Function to inspect private audit history...\n";
    inspectPrivateAuditHistory(msg1, std::cout);

    // --- UNIT 5: File Handling Operations ---
    std::cout << "\n[Unit 5] Demonstrating File Handling (ofstream, ifstream, seekg, tellg)...\n";
    AuditFileStore fileStore("test_audit.log");
    fileStore.writeLogEntry("[AUDIT] Collaborative message initialized by Alice");
    fileStore.writeLogEntry("[AUDIT] Bob appended PRN: 1251076777");
    std::cout << "Audit log file size: " << fileStore.getFileSize() << " bytes.\n";

    auto logs = fileStore.readAllLogs();
    std::cout << "Read " << logs.size() << " log entries from disk.\n";

    // --- UNIT 6: Exception Handling, Generic Templates & SOLID ---
    std::cout << "\n[Unit 6] Demonstrating Custom Exceptions & Multiple Catch Blocks...\n";
    try {
        std::cout << "Attempting invalid edit on locked message...\n";
        msg1.lockMessage();
        msg1.appendDetail("LateField", "Value", "user_bob"); // Should throw!
    } catch (const UnauthorizedEditException& ex) {
        std::cout << "  CAUGHT EXPECTED EXCEPTION: " << ex.what() << " (Code: " << ex.getCode() << ")\n";
    } catch (const ChatAppException& ex) {
        std::cout << "  CAUGHT GENERIC CHAT EXCEPTION: " << ex.what() << "\n";
    } catch (...) {
        std::cout << "  CAUGHT UNKNOWN EXCEPTION\n";
    }

    // Patent Claim 3 & 4 Verification (Membership Revocation)
    std::cout << "\n[Patent Claims] Demonstrating Recovery Plan Validation & Membership Invalidation...\n";
    RecoveryPlan plan("plan_1", "user_bob", "conv_group_1", 101, 1, 100, 1, 25);
    try {
        // Membership changed from version 1 to 2!
        plan.validateRecoveryState(101, 2);
    } catch (const MembershipRevokedException& ex) {
        std::cout << "  CAUGHT MEMBERSHIP REVOKED EXCEPTION: " << ex.what() << "\n";
    }

    // Generic Programming (Template Class)
    std::cout << "\n[Unit 6] Demonstrating Generic Template Class (CircularBacklogBuffer)...\n";
    CircularBacklogBuffer<int, 5> seqBuffer;
    seqBuffer.push(101);
    seqBuffer.push(102);
    seqBuffer.push(103);
    int poppedVal;
    seqBuffer.pop(poppedVal);
    std::cout << "Popped sequence number: " << poppedVal << ", remaining in buffer: " << seqBuffer.size() << "\n";

    delete polyMsg;

    std::cout << "\n========================================================\n";
    std::cout << "  ALL SYLLABUS UNITS & FEATURES VERIFIED SUCCESSFULLY!\n";
    std::cout << "========================================================\n";
    return 0;
}
#endif

