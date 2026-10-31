// database.hpp - SQLite Database Manager (OOP + RAII)
#ifndef DATABASE_HPP
#define DATABASE_HPP

#include <string>
#include <vector>
#include <memory>
#include <stdexcept>
#include <windows.h>
#include <cstdint>

// Forward declarations for SQLite
struct sqlite3;
struct sqlite3_stmt;

namespace ChatDB {

// User record
struct User {
    std::string id;
    std::string username;
    int64_t createdAt;
    int64_t lastSeenAt;
    bool isOnline;
};

// Conversation record
struct Conversation {
    std::string id;
    std::string type; // "direct", "group", "public"
    std::string name;
    int64_t createdAt;
    std::string creatorId;
};

// Message record
struct Message {
    std::string id;
    std::string conversationId;
    std::string fromUserId;
    std::string text;
    int64_t timestamp;
};

// Notification record
struct Notification {
    std::string id;
    std::string targetUserId;
    std::string actorId;
    std::string type;
    std::string text;
    int64_t timestamp;
    bool isRead;
};

// Recovery plan record (Patent Claims 1-4)
struct RecoveryPlanRecord {
    std::string id;
    std::string userId;
    std::string conversationId;
    int sessionGeneration;
    int startSeq;
    int endSeq;
    int membershipVersion;
    std::string state;
    int batchSize;
    int64_t createdAt;
    int64_t expiresAt;
};

// Collaborative message record (LCFM Model A)
struct CollaborativeMessageRecord {
    std::string messageId;
    std::string conversationId;
    std::string creatorId;
    std::string introText;
    std::string status;
    int64_t createdAt;
    int64_t updatedAt;
};

// Database Manager Class (RAII + Thread-Safe)
class DatabaseManager {
private:
    sqlite3* db;
    CRITICAL_SECTION dbCs;
    std::string dbPath;

    void executeSQL(const std::string& sql);
    void createTables();

public:
    DatabaseManager(const std::string& path);
    ~DatabaseManager();

    // User operations
    User createUser(const std::string& username);
    User* getUserById(const std::string& userId);
    User* getUserByUsername(const std::string& username);
    void updateUserLastSeen(const std::string& userId, int64_t timestamp);
    void setUserOnlineStatus(const std::string& userId, bool isOnline);
    std::vector<User> getAllUsers();

    // Conversation operations
    Conversation createConversation(const std::string& type, const std::string& name, const std::string& creatorId);
    Conversation* getConversation(const std::string& conversationId);
    std::vector<Conversation> getConversationsForUser(const std::string& userId);
    void addConversationMember(const std::string& conversationId, const std::string& userId);
    void removeConversationMember(const std::string& conversationId, const std::string& userId);
    std::vector<std::string> getConversationMembers(const std::string& conversationId);
    bool isUserInConversation(const std::string& userId, const std::string& conversationId);

    // Message operations
    Message createMessage(const std::string& conversationId, const std::string& fromUserId, const std::string& text);
    std::vector<Message> getMessageHistory(const std::string& conversationId, int limit);
    Message* getLastMessage(const std::string& conversationId);

    // Notification operations
    Notification createNotification(const std::string& targetUserId, const std::string& actorId, 
                                   const std::string& type, const std::string& text);
    std::vector<Notification> getNotificationsForUser(const std::string& userId);
    void markNotificationRead(const std::string& notificationId);

    // Contact operations
    void createContactRequest(const std::string& fromUserId, const std::string& toUserId);
    void acceptContactRequest(const std::string& fromUserId, const std::string& toUserId);
    bool areContacts(const std::string& userId1, const std::string& userId2);
    std::vector<User> getSuggestedContacts(const std::string& userId, int limit);

    // Recovery Operations (Patent: Adaptive Recovery)
    RecoveryPlanRecord createRecoveryPlan(const std::string& userId, const std::string& conversationId, int sessionGen, int startSeq, int endSeq, int membershipVer, int batchSize);
    bool validateRecoveryPlan(const std::string& planId, int sessionGen, int membershipVer);
    void advanceRecoveryCursor(const std::string& userId, const std::string& conversationId, int seq);

    // Collaborative Living Message Operations (LCFM)
    CollaborativeMessageRecord createCollaborativeMessage(const std::string& conversationId, const std::string& creatorId, const std::string& introText);
    void appendCollaborativeDetail(const std::string& messageId, const std::string& label, const std::string& value, const std::string& editorId);
    void lockCollaborativeMessage(const std::string& messageId, const std::string& userId);
};

} // namespace ChatDB

#endif // DATABASE_HPP
