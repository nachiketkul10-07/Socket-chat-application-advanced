/**
 * =========================================================================================
 * VISHWAKARMA INSTITUTE OF TECHNOLOGY, PUNE
 * Department of Computer Engineering - Academic Year 2026-27
 * Course Project: Real-Time Collaborative & Adaptive Message Recovery Chat System
 * Faculty Guide: Prof. Suvarna Patil
 *
 * File: oop_concepts.hpp
 * Description: Core C++ Object-Oriented Architecture demonstrating all 6 syllabus units:
 *   - Unit 1: OOP Fundamentals & Paradigms
 *   - Unit 2: Classes, Objects, Access Specifiers, Static, Friend, Memory Management
 *   - Unit 3: Constructors (Default, Parameterized, Copy, Overloading), Destructors
 *   - Unit 4: Inheritance (Single, Multilevel, Multiple, Hierarchical), Polymorphism
 *   - Unit 5: File Handling (fstream, file modes, seekg/seekp, error handling)
 *   - Unit 6: Exception Handling, Generic Programming (Templates), SOLID Principles
 * =========================================================================================
 */

#ifndef OOP_CONCEPTS_HPP
#define OOP_CONCEPTS_HPP

#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <memory>
#include <stdexcept>
#include <fstream>
#include <sstream>
#include <ctime>
#include <cstdint>
#include <algorithm>

namespace VIT_OOP {

// =========================================================================================
// UNIT 6: EXCEPTION HANDLING (Custom Exception Hierarchy)
// =========================================================================================
class ChatAppException : public std::exception {
protected:
    std::string errorMessage;
    int errorCode;
public:
    ChatAppException(const std::string& msg, int code = 1000)
        : errorMessage(msg), errorCode(code) {}
    virtual const char* what() const noexcept override {
        return errorMessage.c_str();
    }
    int getCode() const noexcept { return errorCode; }
    virtual ~ChatAppException() = default;
};

class AuthenticationException : public ChatAppException {
public:
    AuthenticationException(const std::string& msg)
        : ChatAppException("AuthError: " + msg, 1001) {}
};

class UnauthorizedEditException : public ChatAppException {
public:
    UnauthorizedEditException(const std::string& msg)
        : ChatAppException("UnauthorizedEditError: " + msg, 1002) {}
};

class ConcurrencyConflictException : public ChatAppException {
public:
    ConcurrencyConflictException(const std::string& msg)
        : ChatAppException("ConflictError: " + msg, 1003) {}
};

class MembershipRevokedException : public ChatAppException {
public:
    MembershipRevokedException(const std::string& msg)
        : ChatAppException("MembershipRevokedError: " + msg, 1004) {}
};

class PlanExpiredException : public ChatAppException {
public:
    PlanExpiredException(const std::string& msg)
        : ChatAppException("PlanExpiredError: " + msg, 1005) {}
};

class FileOperationException : public ChatAppException {
public:
    FileOperationException(const std::string& msg)
        : ChatAppException("FileIOError: " + msg, 1006) {}
};

// =========================================================================================
// UNIT 6: GENERIC PROGRAMMING (Templates)
// =========================================================================================

// Generic Template Function
template <typename T>
std::string toDisplayString(const T& value) {
    std::ostringstream oss;
    oss << value;
    return oss.str();
}

// Specialization for bool
template <>
inline std::string toDisplayString<bool>(const bool& value) {
    return value ? "true" : "false";
}

// Generic Template Class: Thread-safe / bounded buffer for message sequence backlogs
template <typename T, size_t MaxCapacity = 100>
class CircularBacklogBuffer {
private:
    T buffer[MaxCapacity];
    size_t headIndex;
    size_t tailIndex;
    size_t currentCount;

public:
    CircularBacklogBuffer() : headIndex(0), tailIndex(0), currentCount(0) {}

    bool push(const T& item) {
        if (currentCount >= MaxCapacity) return false;
        buffer[tailIndex] = item;
        tailIndex = (tailIndex + 1) % MaxCapacity;
        currentCount++;
        return true;
    }

    bool pop(T& outItem) {
        if (currentCount == 0) return false;
        outItem = buffer[headIndex];
        headIndex = (headIndex + 1) % MaxCapacity;
        currentCount--;
        return true;
    }

    size_t size() const noexcept { return currentCount; }
    bool isFull() const noexcept { return currentCount >= MaxCapacity; }
    bool isEmpty() const noexcept { return currentCount == 0; }
};

// =========================================================================================
// FORWARD DECLARATIONS (Unit 2)
// =========================================================================================
class CollaborativeMessage;
class AuditFileStore;
class RecoveryController;

// =========================================================================================
// UNIT 4: ABSTRACT CLASSES & INTERFACES (SOLID - Interface Segregation Principle)
// =========================================================================================

// Pure Abstract Interface 1: Serialization
class ISerializable {
public:
    virtual std::string serializeToJSON() const = 0; // Pure virtual function
    virtual ~ISerializable() = default;
};

// Pure Abstract Interface 2: Auditing
class IAuditable {
public:
    virtual void recordAuditEntry(const std::string& editorId, const std::string& change) = 0;
    virtual ~IAuditable() = default;
};

// Pure Abstract Interface 3: Recovery validation
class IRecoverable {
public:
    virtual bool validateRecoveryState(int sessionGen, int currentMembershipVer) const = 0;
    virtual ~IRecoverable() = default;
};

// =========================================================================================
// UNIT 1, 2, 3 & 4: MESSAGE CLASS HIERARCHY
// =========================================================================================

enum class MessageType {
    TEXT,
    SYSTEM,
    COLLABORATIVE_FILLIN
};

enum class MessageStatus {
    OPEN,
    READY,
    FINALIZED,
    EXPIRED
};

// Base Abstract Class (Unit 1 & 4)
class BaseMessage : public ISerializable {
protected:
    std::string messageId;
    std::string conversationId;
    std::string senderId;
    int64_t timestamp;
    int64_t sequenceNumber;
    MessageType type;

    // Unit 2: Static Data Member
    static int64_t totalMessagesCreated;

public:
    // Unit 3: Constructors
    BaseMessage(); // Default constructor
    BaseMessage(const std::string& id, const std::string& convId, const std::string& sender,
                MessageType msgType, int64_t seq = 0, int64_t ts = 0); // Parameterized constructor with default arg
    BaseMessage(const BaseMessage& other); // Copy constructor

    // Unit 3: Virtual Destructor for safe polymorphic cleanup
    virtual ~BaseMessage();

    // Unit 2: Methods with 'this' pointer and parameter usage
    std::string getId() const { return this->messageId; }
    std::string getConversationId() const { return this->conversationId; }
    std::string getSenderId() const { return this->senderId; }
    int64_t getSequence() const { return this->sequenceNumber; }
    MessageType getType() const { return this->type; }

    void setSequence(int64_t seq) { this->sequenceNumber = seq; }

    // Unit 2: Static Method
    static int64_t getTotalMessagesCreated() { return totalMessagesCreated; }

    // Unit 4: Pure Virtual Method from ISerializable
    virtual std::string serializeToJSON() const override = 0;
};

// Derived Class 1: Standard Text Message (Single Inheritance)
class TextMessage : public BaseMessage {
private:
    std::string textContent;

public:
    TextMessage();
    TextMessage(const std::string& id, const std::string& convId, const std::string& sender,
                const std::string& text, int64_t seq = 0);

    // Unit 4: Method Overriding
    virtual std::string serializeToJSON() const override;

    std::string getText() const { return textContent; }
    void setText(const std::string& newText) { textContent = newText; }
};

// Structure representing a single collaborative appended field/detail
struct FieldDetail {
    std::string fieldId;
    std::string label;
    std::string value;
    int version;
    std::string lastEditorId;
    std::string lastEditorUsername;
    bool isComplete;

    FieldDetail()
        : fieldId(""), label("Detail"), value(""), version(0),
          lastEditorId(""), lastEditorUsername(""), isComplete(false) {}

    FieldDetail(const std::string& id, const std::string& lbl, const std::string& val, const std::string& editor)
        : fieldId(id), label(lbl), value(val), version(1),
          lastEditorId(editor), lastEditorUsername(editor), isComplete(!val.empty()) {}
};

// Derived Class 2: Collaborative Living Fill-in Message (Hierarchical & Multiple Inheritance)
// Inherits from BaseMessage and implements IAuditable interface
class CollaborativeMessage : public BaseMessage, public IAuditable {
private:
    std::string introText;
    MessageStatus status;
    bool requireAllMandatory;
    int64_t deadlineEpoch;
    std::vector<FieldDetail> appendedFields;
    std::vector<std::string> auditLog;

    // Unit 2: Friend Function Declaration
    friend void inspectPrivateAuditHistory(const CollaborativeMessage& msg, std::ostream& out);

public:
    // Unit 3: Constructors
    CollaborativeMessage();
    CollaborativeMessage(const std::string& id, const std::string& convId, const std::string& creatorId,
                         const std::string& intro, int64_t seq = 0);
    CollaborativeMessage(const CollaborativeMessage& other); // Deep copy constructor

    virtual ~CollaborativeMessage() override;

    // Unit 2: Method Overloading
    void appendDetail(const std::string& value, const std::string& editorId);
    void appendDetail(const std::string& label, const std::string& value, const std::string& editorId);
    void appendDetail(const std::string& label, const std::string& value, const std::string& editorId, int expectedVersion);

    // Unit 4: Method Overriding
    virtual std::string serializeToJSON() const override;

    // Customized serialization enforcing creator-only attribution privacy
    std::string serializeForViewer(const std::string& viewerUserId) const;

    // Unit 4: Implementation of IAuditable pure virtual method
    virtual void recordAuditEntry(const std::string& editorId, const std::string& change) override;

    // Status management
    void lockMessage();
    void unlockMessage();
    bool isLocked() const { return status == MessageStatus::FINALIZED || status == MessageStatus::EXPIRED; }

    size_t getFieldCount() const { return appendedFields.size(); }
    const std::vector<FieldDetail>& getFields() const { return appendedFields; }
    MessageStatus getStatus() const { return status; }
};

// =========================================================================================
// UNIT 1, 2, 4: RECOVERY PLAN (Patent: Membership-Bound Adaptive Recovery)
// =========================================================================================

class RecoveryPlan : public IRecoverable, public ISerializable {
private:
    std::string planId;
    std::string userId;
    std::string conversationId;
    int sessionGeneration;
    int targetStartSeq;
    int targetEndSeq;
    int membershipVersion;
    int batchSize;
    int64_t expiryTimestamp;
    bool active;

public:
    RecoveryPlan();
    RecoveryPlan(const std::string& pId, const std::string& uId, const std::string& cId,
                 int sessionGen, int startSeq, int endSeq, int membershipVer,
                 int batchSz = 25, int timeoutSec = 60);

    // Unit 4: Pure Virtual Implementation from IRecoverable
    virtual bool validateRecoveryState(int currentSessionGen, int currentMembershipVer) const override;

    // Unit 4: Pure Virtual Implementation from ISerializable
    virtual std::string serializeToJSON() const override;

    // Unit 2: Methods with 'this'
    std::string getPlanId() const { return this->planId; }
    int getBatchSize() const { return this->batchSize; }
    bool isActive() const { return this->active; }
    void invalidate() { this->active = false; }

    // Adaptive Batch Calculation (Bounds: min 5, max 100)
    static int calculateAdaptiveBatch(int remainingMessages);
};

// =========================================================================================
// UNIT 5: FILE HANDLING (Audit File Store & Disk Persistence)
// =========================================================================================

class AuditFileStore {
private:
    std::string filePath;

public:
    AuditFileStore(const std::string& path);

    // Writes audit log using std::ofstream with append mode
    void writeLogEntry(const std::string& logLine);

    // Reads log file sequentially using std::ifstream with error handling
    std::vector<std::string> readAllLogs();

    // Demonstrates file pointer manipulation (seekg, tellg)
    int64_t getFileSize();
};

// =========================================================================================
// UNIT 2: FRIEND FUNCTION IMPLEMENTATION
// =========================================================================================
inline void inspectPrivateAuditHistory(const CollaborativeMessage& msg, std::ostream& out) {
    out << "=== AUDIT HISTORY FOR MESSAGE " << msg.messageId << " ===\n";
    for (const auto& entry : msg.auditLog) {
        out << "  [Audit]: " << entry << "\n";
    }
}

} // namespace VIT_OOP

#endif // OOP_CONCEPTS_HPP

