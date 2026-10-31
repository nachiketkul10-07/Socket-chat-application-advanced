// database.cpp - SQLite Database Implementation
#include "database.hpp"
#include "sqlite3.h"
#include <ctime>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <cstdlib>
#include <cstdint>

namespace ChatDB {

// Helper: Generate unique ID
static std::string generateId(const std::string& prefix) {
    std::ostringstream oss;
    oss << prefix << "_" << time(nullptr) << "_" << (rand() % 100000);
    return oss.str();
}

// Helper: Get current timestamp
static int64_t getCurrentTimestamp() {
    return static_cast<int64_t>(time(nullptr));
}

DatabaseManager::DatabaseManager(const std::string& path) : db(nullptr), dbPath(path) {
    InitializeCriticalSection(&dbCs);
    
    int rc = sqlite3_open(path.c_str(), &db);
    if (rc != SQLITE_OK) {
        std::string error = "Cannot open database: " + std::string(sqlite3_errmsg(db));
        sqlite3_close(db);
        throw std::runtime_error(error);
    }

    sqlite3_busy_timeout(db, 5000);
    sqlite3_exec(db, "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;", nullptr, nullptr, nullptr);
    
    createTables();
}

DatabaseManager::~DatabaseManager() {
    if (db) {
        sqlite3_close(db);
    }
    DeleteCriticalSection(&dbCs);
}

void DatabaseManager::executeSQL(const std::string& sql) {
    char* errMsg = nullptr;
    int rc = sqlite3_exec(db, sql.c_str(), nullptr, nullptr, &errMsg);
    if (rc != SQLITE_OK) {
        std::string error = "SQL error: " + std::string(errMsg);
        sqlite3_free(errMsg);
        throw std::runtime_error(error);
    }
}

void DatabaseManager::createTables() {
    EnterCriticalSection(&dbCs);
    
    try {
        // Users table
        executeSQL(
            "CREATE TABLE IF NOT EXISTS users ("
            "id TEXT PRIMARY KEY,"
            "username TEXT UNIQUE NOT NULL,"
            "created_at INTEGER NOT NULL,"
            "last_seen_at INTEGER,"
            "is_online INTEGER DEFAULT 0"
            ");"
        );
        
        // Conversations table
        executeSQL(
            "CREATE TABLE IF NOT EXISTS conversations ("
            "id TEXT PRIMARY KEY,"
            "type TEXT NOT NULL,"
            "name TEXT,"
            "created_at INTEGER NOT NULL,"
            "creator_id TEXT"
            ");"
        );
        
        // Conversation members table
        executeSQL(
            "CREATE TABLE IF NOT EXISTS conversation_members ("
            "conversation_id TEXT NOT NULL,"
            "user_id TEXT NOT NULL,"
            "joined_at INTEGER NOT NULL,"
            "PRIMARY KEY (conversation_id, user_id)"
            ");"
        );
        
        // Messages table
        executeSQL(
            "CREATE TABLE IF NOT EXISTS messages ("
            "id TEXT PRIMARY KEY,"
            "conversation_id TEXT NOT NULL,"
            "from_user_id TEXT NOT NULL,"
            "text TEXT NOT NULL,"
            "timestamp INTEGER NOT NULL"
            ");"
        );
        
        // Notifications table
        executeSQL(
            "CREATE TABLE IF NOT EXISTS notifications ("
            "id TEXT PRIMARY KEY,"
            "target_user_id TEXT NOT NULL,"
            "actor_id TEXT,"
            "type TEXT NOT NULL,"
            "text TEXT NOT NULL,"
            "timestamp INTEGER NOT NULL,"
            "is_read INTEGER DEFAULT 0"
            ");"
        );
        
        // Contacts table
        executeSQL(
            "CREATE TABLE IF NOT EXISTS contacts ("
            "user_id1 TEXT NOT NULL,"
            "user_id2 TEXT NOT NULL,"
            "status TEXT NOT NULL,"
            "created_at INTEGER NOT NULL,"
            "PRIMARY KEY (user_id1, user_id2)"
            ");"
        );
        
        // Create indexes
        executeSQL("CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, timestamp DESC);");
        executeSQL("CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target_user_id, timestamp DESC);");
        executeSQL("CREATE INDEX IF NOT EXISTS idx_conversation_members ON conversation_members(user_id);");
        
        // Create public conversation if it doesn't exist
        sqlite3_stmt* stmt;
        const char* checkSql = "SELECT COUNT(*) FROM conversations WHERE id = 'public_general'";
        if (sqlite3_prepare_v2(db, checkSql, -1, &stmt, nullptr) == SQLITE_OK) {
            if (sqlite3_step(stmt) == SQLITE_ROW && sqlite3_column_int(stmt, 0) == 0) {
                sqlite3_finalize(stmt);
                const char* insertSql = "INSERT INTO conversations (id, type, name, created_at) VALUES ('public_general', 'public', 'General', ?)";
                if (sqlite3_prepare_v2(db, insertSql, -1, &stmt, nullptr) == SQLITE_OK) {
                    sqlite3_bind_int64(stmt, 1, getCurrentTimestamp());
                    sqlite3_step(stmt);
                }
            }
            sqlite3_finalize(stmt);
        }
        
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
}

// User operations
User DatabaseManager::createUser(const std::string& username) {
    EnterCriticalSection(&dbCs);
    
    User user;
    user.id = generateId("user");
    user.username = username;
    user.createdAt = getCurrentTimestamp();
    user.lastSeenAt = user.createdAt;
    user.isOnline = true;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "INSERT INTO users (id, username, created_at, last_seen_at, is_online) VALUES (?, ?, ?, ?, 1)";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
            throw std::runtime_error("Failed to prepare user insert statement");
        }
        
        sqlite3_bind_text(stmt, 1, user.id.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, user.username.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 3, user.createdAt);
        sqlite3_bind_int64(stmt, 4, user.lastSeenAt);
        
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        
        if (rc != SQLITE_DONE) {
            throw std::runtime_error("Failed to insert user");
        }
        
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return user;
}

User* DatabaseManager::getUserByUsername(const std::string& username) {
    EnterCriticalSection(&dbCs);
    
    User* user = nullptr;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, username, created_at, last_seen_at, is_online FROM users WHERE username = ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
            throw std::runtime_error("Failed to prepare getUserByUsername statement");
        }
        
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            user = new User();
            const unsigned char* uId = sqlite3_column_text(stmt, 0);
            const unsigned char* uName = sqlite3_column_text(stmt, 1);
            user->id = uId ? reinterpret_cast<const char*>(uId) : "";
            user->username = uName ? reinterpret_cast<const char*>(uName) : "";
            user->createdAt = sqlite3_column_int64(stmt, 2);
            user->lastSeenAt = sqlite3_column_int64(stmt, 3);
            user->isOnline = sqlite3_column_int(stmt, 4) != 0;
        }
        
        sqlite3_finalize(stmt);
        
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return user;
}

User* DatabaseManager::getUserById(const std::string& userId) {
    EnterCriticalSection(&dbCs);
    
    User* user = nullptr;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, username, created_at, last_seen_at, is_online FROM users WHERE id = ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
            throw std::runtime_error("Failed to prepare getUserById statement");
        }
        
        sqlite3_bind_text(stmt, 1, userId.c_str(), -1, SQLITE_TRANSIENT);
        
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            user = new User();
            const unsigned char* uId = sqlite3_column_text(stmt, 0);
            const unsigned char* uName = sqlite3_column_text(stmt, 1);
            user->id = uId ? reinterpret_cast<const char*>(uId) : "";
            user->username = uName ? reinterpret_cast<const char*>(uName) : "";
            user->createdAt = sqlite3_column_int64(stmt, 2);
            user->lastSeenAt = sqlite3_column_int64(stmt, 3);
            user->isOnline = sqlite3_column_int(stmt, 4) != 0;
        }
        
        sqlite3_finalize(stmt);
        
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return user;
}

void DatabaseManager::updateUserLastSeen(const std::string& userId, int64_t timestamp) {
    EnterCriticalSection(&dbCs);
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "UPDATE users SET last_seen_at = ? WHERE id = ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_int64(stmt, 1, timestamp);
            sqlite3_bind_text(stmt, 2, userId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
}

void DatabaseManager::setUserOnlineStatus(const std::string& userId, bool isOnline) {
    EnterCriticalSection(&dbCs);
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "UPDATE users SET is_online = ? WHERE id = ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_int(stmt, 1, isOnline ? 1 : 0);
            sqlite3_bind_text(stmt, 2, userId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
}

std::vector<User> DatabaseManager::getAllUsers() {
    EnterCriticalSection(&dbCs);
    
    std::vector<User> users;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, username, created_at, last_seen_at, is_online FROM users ORDER BY username";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            while (sqlite3_step(stmt) == SQLITE_ROW) {
                User user;
                user.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
                user.username = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
                user.createdAt = sqlite3_column_int64(stmt, 2);
                user.lastSeenAt = sqlite3_column_int64(stmt, 3);
                user.isOnline = sqlite3_column_int(stmt, 4) != 0;
                users.push_back(user);
            }
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return users;
}

// Conversation operations
Conversation DatabaseManager::createConversation(const std::string& type, const std::string& name, const std::string& creatorId) {
    EnterCriticalSection(&dbCs);
    
    Conversation conv;
    
    if (type == "direct") {
        conv.id = generateId("dm");
    } else if (type == "group") {
        conv.id = generateId("group");
    } else {
        conv.id = generateId("public");
    }
    
    conv.type = type;
    conv.name = name;
    conv.createdAt = getCurrentTimestamp();
    conv.creatorId = creatorId;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "INSERT INTO conversations (id, type, name, created_at, creator_id) VALUES (?, ?, ?, ?, ?)";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
            throw std::runtime_error("Failed to prepare conversation insert");
        }
        
        sqlite3_bind_text(stmt, 1, conv.id.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, conv.type.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, conv.name.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 4, conv.createdAt);
        sqlite3_bind_text(stmt, 5, conv.creatorId.c_str(), -1, SQLITE_TRANSIENT);
        
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        
        if (rc != SQLITE_DONE) {
            throw std::runtime_error("Failed to insert conversation");
        }
        
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return conv;
}

Conversation* DatabaseManager::getConversation(const std::string& conversationId) {
    EnterCriticalSection(&dbCs);
    
    Conversation* conv = nullptr;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, type, name, created_at, creator_id FROM conversations WHERE id = ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, conversationId.c_str(), -1, SQLITE_TRANSIENT);
            
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                conv = new Conversation();
                conv->id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
                conv->type = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
                const char* namePtr = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
                conv->name = namePtr ? namePtr : "";
                conv->createdAt = sqlite3_column_int64(stmt, 3);
                const char* creatorPtr = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
                conv->creatorId = creatorPtr ? creatorPtr : "";
            }
            
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return conv;
}

void DatabaseManager::addConversationMember(const std::string& conversationId, const std::string& userId) {
    EnterCriticalSection(&dbCs);
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, conversationId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, userId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_int64(stmt, 3, getCurrentTimestamp());
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
}

void DatabaseManager::removeConversationMember(const std::string& conversationId, const std::string& userId) {
    EnterCriticalSection(&dbCs);
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, conversationId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, userId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
}

std::vector<std::string> DatabaseManager::getConversationMembers(const std::string& conversationId) {
    EnterCriticalSection(&dbCs);
    
    std::vector<std::string> members;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT user_id FROM conversation_members WHERE conversation_id = ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, conversationId.c_str(), -1, SQLITE_TRANSIENT);
            
            while (sqlite3_step(stmt) == SQLITE_ROW) {
                members.push_back(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0)));
            }
            
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return members;
}

bool DatabaseManager::isUserInConversation(const std::string& userId, const std::string& conversationId) {
    // Public conversations are accessible to all
    if (conversationId == "public_general") {
        return true;
    }
    
    EnterCriticalSection(&dbCs);
    
    bool isMember = false;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, conversationId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, userId.c_str(), -1, SQLITE_TRANSIENT);
            
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                isMember = sqlite3_column_int(stmt, 0) > 0;
            }
            
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return isMember;
}

std::vector<Conversation> DatabaseManager::getConversationsForUser(const std::string& userId) {
    EnterCriticalSection(&dbCs);
    
    std::vector<Conversation> conversations;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = 
            "SELECT DISTINCT c.id, c.type, c.name, c.created_at, c.creator_id "
            "FROM conversations c "
            "LEFT JOIN conversation_members cm ON c.id = cm.conversation_id "
            "WHERE c.type = 'public' OR cm.user_id = ? "
            "ORDER BY c.created_at DESC";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, userId.c_str(), -1, SQLITE_TRANSIENT);
            
            while (sqlite3_step(stmt) == SQLITE_ROW) {
                Conversation conv;
                conv.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
                conv.type = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
                const char* namePtr = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
                conv.name = namePtr ? namePtr : "";
                conv.createdAt = sqlite3_column_int64(stmt, 3);
                const char* creatorPtr = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
                conv.creatorId = creatorPtr ? creatorPtr : "";
                conversations.push_back(conv);
            }
            
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return conversations;
}

// Message operations
Message DatabaseManager::createMessage(const std::string& conversationId, const std::string& fromUserId, const std::string& text) {
    EnterCriticalSection(&dbCs);
    
    Message msg;
    msg.id = generateId("msg");
    msg.conversationId = conversationId;
    msg.fromUserId = fromUserId;
    msg.text = text;
    msg.timestamp = getCurrentTimestamp();
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "INSERT INTO messages (id, conversation_id, from_user_id, text, timestamp) VALUES (?, ?, ?, ?, ?)";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
            throw std::runtime_error("Failed to prepare message insert");
        }
        
        sqlite3_bind_text(stmt, 1, msg.id.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, msg.conversationId.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, msg.fromUserId.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 4, msg.text.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 5, msg.timestamp);
        
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        
        if (rc != SQLITE_DONE) {
            throw std::runtime_error("Failed to insert message");
        }
        
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return msg;
}

std::vector<Message> DatabaseManager::getMessageHistory(const std::string& conversationId, int limit) {
    EnterCriticalSection(&dbCs);
    
    std::vector<Message> messages;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, conversation_id, from_user_id, text, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, conversationId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_int(stmt, 2, limit);
            
            while (sqlite3_step(stmt) == SQLITE_ROW) {
                Message msg;
                msg.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
                msg.conversationId = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
                msg.fromUserId = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
                msg.text = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
                msg.timestamp = sqlite3_column_int64(stmt, 4);
                messages.push_back(msg);
            }
            
            sqlite3_finalize(stmt);
        }
        
        // Reverse to get chronological order
        std::reverse(messages.begin(), messages.end());
        
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return messages;
}

Message* DatabaseManager::getLastMessage(const std::string& conversationId) {
    EnterCriticalSection(&dbCs);
    
    Message* msg = nullptr;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, conversation_id, from_user_id, text, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT 1";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, conversationId.c_str(), -1, SQLITE_TRANSIENT);
            
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                msg = new Message();
                msg->id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
                msg->conversationId = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
                msg->fromUserId = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
                msg->text = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
                msg->timestamp = sqlite3_column_int64(stmt, 4);
            }
            
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return msg;
}

// Notification operations
Notification DatabaseManager::createNotification(const std::string& targetUserId, const std::string& actorId, 
                                               const std::string& type, const std::string& text) {
    EnterCriticalSection(&dbCs);
    
    Notification notif;
    notif.id = generateId("notif");
    notif.targetUserId = targetUserId;
    notif.actorId = actorId;
    notif.type = type;
    notif.text = text;
    notif.timestamp = getCurrentTimestamp();
    notif.isRead = false;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "INSERT INTO notifications (id, target_user_id, actor_id, type, text, timestamp, is_read) VALUES (?, ?, ?, ?, ?, ?, 0)";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, notif.id.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, notif.targetUserId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 3, notif.actorId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 4, notif.type.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 5, notif.text.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_int64(stmt, 6, notif.timestamp);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return notif;
}

std::vector<Notification> DatabaseManager::getNotificationsForUser(const std::string& userId) {
    EnterCriticalSection(&dbCs);
    
    std::vector<Notification> notifications;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, target_user_id, actor_id, type, text, timestamp, is_read FROM notifications WHERE target_user_id = ? ORDER BY timestamp DESC LIMIT 50";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, userId.c_str(), -1, SQLITE_TRANSIENT);
            
            while (sqlite3_step(stmt) == SQLITE_ROW) {
                Notification notif;
                notif.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
                notif.targetUserId = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
                const char* actorPtr = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
                notif.actorId = actorPtr ? actorPtr : "";
                notif.type = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
                notif.text = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
                notif.timestamp = sqlite3_column_int64(stmt, 5);
                notif.isRead = sqlite3_column_int(stmt, 6) != 0;
                notifications.push_back(notif);
            }
            
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return notifications;
}

void DatabaseManager::markNotificationRead(const std::string& notificationId) {
    EnterCriticalSection(&dbCs);
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "UPDATE notifications SET is_read = 1 WHERE id = ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, notificationId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
}

// Contact operations
void DatabaseManager::createContactRequest(const std::string& fromUserId, const std::string& toUserId) {
    EnterCriticalSection(&dbCs);
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "INSERT OR REPLACE INTO contacts (user_id1, user_id2, status, created_at) VALUES (?, ?, 'requested', ?)";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, fromUserId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, toUserId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_int64(stmt, 3, getCurrentTimestamp());
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
}

void DatabaseManager::acceptContactRequest(const std::string& fromUserId, const std::string& toUserId) {
    EnterCriticalSection(&dbCs);
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = "UPDATE contacts SET status = 'accepted' WHERE user_id1 = ? AND user_id2 = ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, fromUserId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, toUserId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
}

bool DatabaseManager::areContacts(const std::string& userId1, const std::string& userId2) {
    EnterCriticalSection(&dbCs);
    
    bool areConnected = false;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = 
            "SELECT COUNT(*) FROM contacts WHERE "
            "((user_id1 = ? AND user_id2 = ?) OR (user_id1 = ? AND user_id2 = ?)) "
            "AND status = 'accepted'";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, userId1.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, userId2.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 3, userId2.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 4, userId1.c_str(), -1, SQLITE_TRANSIENT);
            
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                areConnected = sqlite3_column_int(stmt, 0) > 0;
            }
            
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return areConnected;
}

std::vector<User> DatabaseManager::getSuggestedContacts(const std::string& userId, int limit) {
    EnterCriticalSection(&dbCs);
    
    std::vector<User> suggestions;
    
    try {
        sqlite3_stmt* stmt;
        const char* sql = 
            "SELECT u.id, u.username, u.created_at, u.last_seen_at, u.is_online "
            "FROM users u "
            "WHERE u.id != ? "
            "AND u.id NOT IN ("
            "  SELECT user_id2 FROM contacts WHERE user_id1 = ?"
            "  UNION"
            "  SELECT user_id1 FROM contacts WHERE user_id2 = ?"
            ") "
            "ORDER BY u.created_at DESC LIMIT ?";
        
        if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, userId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, userId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 3, userId.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_int(stmt, 4, limit);
            
            while (sqlite3_step(stmt) == SQLITE_ROW) {
                User user;
                user.id = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
                user.username = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
                user.createdAt = sqlite3_column_int64(stmt, 2);
                user.lastSeenAt = sqlite3_column_int64(stmt, 3);
                user.isOnline = sqlite3_column_int(stmt, 4) != 0;
                suggestions.push_back(user);
            }
            
            sqlite3_finalize(stmt);
        }
    } catch (...) {
        LeaveCriticalSection(&dbCs);
        throw;
    }
    
    LeaveCriticalSection(&dbCs);
    return suggestions;
}

} // namespace ChatDB