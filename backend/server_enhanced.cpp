// server_enhanced.cpp - Enhanced OOP Chat Server with SQLite, JSON Protocol, and Full Features
// Compile: g++ -std=c++17 server_enhanced.cpp database.cpp sqlite3.c -o server_enhanced.exe -lws2_32 -static
// Run: server_enhanced.exe 8080

#define _WIN32_WINNT 0x0600
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

#include <iostream>
#include <string>
#include <map>
#include <vector>
#include <sstream>
#include <memory>
#include <algorithm>
#include <ctime>
#include <cstdlib>
#include <cstdint>

#include "database.hpp"

#pragma comment(lib, "ws2_32.lib")

// Simple JSON builder (minimal implementation for protocol messages)
namespace JSON {
    std::string escape(const std::string& str) {
        std::string result;
        for (char c : str) {
            switch (c) {
                case '"': result += "\\\""; break;
                case '\\': result += "\\\\"; break;
                case '\n': result += "\\n"; break;
                case '\r': result += "\\r"; break;
                case '\t': result += "\\t"; break;
                default: result += c; break;
            }
        }
        return result;
    }
    
    std::string str(const std::string& key, const std::string& value) {
        return "\"" + key + "\":\"" + escape(value) + "\"";
    }
    
    std::string num(const std::string& key, int64_t value) {
        return "\"" + key + "\":" + std::to_string(value);
    }
    
    std::string boolean(const std::string& key, bool value) {
        return "\"" + key + "\":" + (value ? "true" : "false");
    }
}

// Simple JSON parser for incoming messages
namespace JSONParser {
    std::string extractString(const std::string& json, const std::string& key) {
        std::string searchKey = "\"" + key + "\"";
        size_t pos = json.find(searchKey);
        if (pos == std::string::npos) return "";
        
        pos = json.find("\"", pos + searchKey.length());
        if (pos == std::string::npos) return "";
        pos++;
        
        size_t endPos = json.find("\"", pos);
        if (endPos == std::string::npos) return "";
        
        return json.substr(pos, endPos - pos);
    }
    
    int extractInt(const std::string& json, const std::string& key) {
        std::string searchKey = "\"" + key + "\":";
        size_t pos = json.find(searchKey);
        if (pos == std::string::npos) return 0;
        
        pos += searchKey.length();
        return std::atoi(json.c_str() + pos);
    }

    bool extractBool(const std::string& json, const std::string& key) {
        std::string searchKey = "\"" + key + "\"";
        size_t pos = json.find(searchKey);
        if (pos == std::string::npos) return false;
        pos = json.find(":", pos + searchKey.length());
        if (pos == std::string::npos) return false;
        pos++; // skip ':'
        // Skip whitespace
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
        // Check literal 'true' or '1'
        if (pos + 4 <= json.size() && json.substr(pos, 4) == "true") return true;
        if (pos < json.size() && json[pos] == '1') return true;
        return false;
    }
}

// ==========================================
// ClientSession Class - Represents a connected client
// ==========================================
class ClientSession {
private:
    SOCKET socket;
    std::string userId;
    std::string username;
    bool authenticated;
    std::string receiveBuffer;
    
public:
    ClientSession(SOCKET sock) : socket(sock), authenticated(false) {}
    
    SOCKET getSocket() const { return socket; }
    std::string getUserId() const { return userId; }
    std::string getUsername() const { return username; }
    bool isAuthenticated() const { return authenticated; }
    
    void setUser(const std::string& uid, const std::string& uname) {
        userId = uid;
        username = uname;
        authenticated = true;
    }
    
    void appendToBuffer(const std::string& data) {
        receiveBuffer += data;
    }
    
    std::vector<std::string> extractLines() {
        std::vector<std::string> lines;
        size_t pos;
        
        while ((pos = receiveBuffer.find('\n')) != std::string::npos) {
            std::string line = receiveBuffer.substr(0, pos);
            receiveBuffer.erase(0, pos + 1);
            
            // Remove trailing \r if present
            if (!line.empty() && line.back() == '\r') {
                line.pop_back();
            }
            
            if (!line.empty()) {
                lines.push_back(line);
            }
        }
        
        return lines;
    }
    
    bool sendLine(const std::string& message) {
        std::string payload = message + "\n";
        int sent = send(socket, payload.c_str(), (int)payload.size(), 0);
        return sent != SOCKET_ERROR;
    }
};

// ==========================================
// Logger Class
// ==========================================
class Logger {
private:
    CRITICAL_SECTION cs;
    
    std::string getTimestamp() {
        time_t now = time(nullptr);
        char buf[32];
        struct tm* ti = localtime(&now);
        if (ti) {
            strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", ti);
            return std::string(buf);
        }
        return "0000-00-00 00:00:00";
    }
    
public:
    Logger() { InitializeCriticalSection(&cs); }
    ~Logger() { DeleteCriticalSection(&cs); }
    
    void log(const std::string& msg) {
        EnterCriticalSection(&cs);
        std::cout << "[" << getTimestamp() << "] " << msg << std::endl;
        LeaveCriticalSection(&cs);
    }
    
    void error(const std::string& msg) {
        EnterCriticalSection(&cs);
        std::cerr << "[" << getTimestamp() << "] ERROR: " << msg << std::endl;
        LeaveCriticalSection(&cs);
    }
};

// ==========================================
// ChatServer Class - Main Server with Full Features
// ==========================================
class ChatServer {
private:
    int port;
    SOCKET listenSocket;
    std::map<SOCKET, std::shared_ptr<ClientSession>> sessions;
    std::map<std::string, SOCKET> userIdToSocket;
    CRITICAL_SECTION sessionsCs;
    Logger logger;
    std::shared_ptr<ChatDB::DatabaseManager> db;
    
    struct ClientContext {
        ChatServer* server;
        SOCKET socket;
    };
    
    static DWORD WINAPI clientThreadProc(LPVOID lpParam) {
        ClientContext* ctx = static_cast<ClientContext*>(lpParam);
        ctx->server->handleClient(ctx->socket);
        delete ctx;
        return 0;
    }
    
    void handleClient(SOCKET clientSock) {
        auto session = std::make_shared<ClientSession>(clientSock);
        
        {
            EnterCriticalSection(&sessionsCs);
            sessions[clientSock] = session;
            LeaveCriticalSection(&sessionsCs);
        }
        
        // Send welcome
        std::string welcome = "{" + JSON::str("type", "welcome") + "," + JSON::str("message", "Connected to chat server") + "}";
        session->sendLine(welcome);
        
        char buffer[4096];
        while (true) {
            int bytesRead = recv(clientSock, buffer, sizeof(buffer) - 1, 0);
            if (bytesRead <= 0) break;
            
            buffer[bytesRead] = '\0';
            session->appendToBuffer(std::string(buffer, bytesRead));
            
            std::vector<std::string> lines = session->extractLines();
            for (const auto& line : lines) {
                try {
                    handleMessage(session, line);
                } catch (const std::exception& e) {
                    logger.error(std::string("Message handling error: ") + e.what());
                    sendError(session, "Internal server error");
                }
            }
        }
        
        // Cleanup on disconnect
        if (session->isAuthenticated()) {
            logger.log("User disconnected: " + session->getUsername());
            
            try {
                db->setUserOnlineStatus(session->getUserId(), false);
                db->updateUserLastSeen(session->getUserId(), time(nullptr));
                
                // Broadcast presence update
                std::string presenceMsg = "{"
                    + JSON::str("type", "presence") + ","
                    + "\"user\":{"
                    + JSON::str("id", session->getUserId()) + ","
                    + JSON::str("username", session->getUsername()) + ","
                    + JSON::boolean("isOnline", false) + ","
                    + JSON::num("lastSeenAt", time(nullptr))
                    + "}}";
                broadcastToAll(presenceMsg);
            } catch (...) {}
        }
        
        EnterCriticalSection(&sessionsCs);
        if (session->isAuthenticated()) {
            userIdToSocket.erase(session->getUserId());
        }
        sessions.erase(clientSock);
        LeaveCriticalSection(&sessionsCs);
        
        closesocket(clientSock);
    }
    
    void handleMessage(std::shared_ptr<ClientSession> session, const std::string& jsonLine) {
        std::string type = JSONParser::extractString(jsonLine, "type");
        
        if (type == "auth") {
            handleAuth(session, jsonLine);
        } else if (!session->isAuthenticated()) {
            sendError(session, "Not authenticated");
        } else if (type == "message") {
            handleSendMessage(session, jsonLine);
        } else if (type == "fetch_conversations") {
            handleFetchConversations(session);
        } else if (type == "fetch_history") {
            handleFetchHistory(session, jsonLine);
        } else if (type == "fetch_users") {
            handleFetchUsers(session);
        } else if (type == "fetch_notifications") {
            handleFetchNotifications(session);
        } else if (type == "fetch_suggestions") {
            handleFetchSuggestions(session);
        } else if (type == "create_group") {
            handleCreateGroup(session, jsonLine);
        } else if (type == "create_direct") {
            handleCreateDirect(session, jsonLine);
        } else if (type == "add_group_member") {
            handleAddGroupMember(session, jsonLine);
        } else if (type == "contact_request") {
            handleContactRequest(session, jsonLine);
        } else if (type == "search_users") {
            handleSearchUsers(session, jsonLine);
        } else if (type == "ping") {
            session->sendLine("{" + JSON::str("type", "pong") + "}");
        } else if (type == "typing") {
            handleTyping(session, jsonLine);
        } else if (type == "mark_read") {
            handleMarkRead(session, jsonLine);
        } else if (type == "mark_notification_read") {
            handleMarkNotifRead(session, jsonLine);
        } else if (type == "accept_contact") {
            handleAcceptContact(session, jsonLine);
        } else if (type == "remove_group_member") {
            handleRemoveGroupMember(session, jsonLine);
        } else if (type == "leave_group") {
            handleLeaveGroup(session, jsonLine);
        } else if (type == "fetch_group_members") {
            handleFetchGroupMembers(session, jsonLine);
        } else {
            logger.log("Unknown message type: " + type);
        }
    }
    
    void handleAuth(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string username = JSONParser::extractString(json, "username");
        
        if (username.empty() || username.length() > 50) {
            sendError(session, "Invalid username");
            return;
        }
        
        try {
            // Check if user exists
            ChatDB::User* existingUser = db->getUserByUsername(username);
            ChatDB::User user;
            
            if (existingUser) {
                user = *existingUser;
                delete existingUser;
                
                // Update online status
                db->setUserOnlineStatus(user.id, true);
            } else {
                // Create new user
                user = db->createUser(username);
            }
            
            session->setUser(user.id, user.username);
            
            EnterCriticalSection(&sessionsCs);
            userIdToSocket[user.id] = session->getSocket();
            LeaveCriticalSection(&sessionsCs);
            
            logger.log("User authenticated: " + username + " (ID: " + user.id + ")");
            
            // Send auth success
            std::string response = "{"
                + JSON::str("type", "auth_success") + ","
                + "\"user\":{"
                + JSON::str("id", user.id) + ","
                + JSON::str("username", user.username) + ","
                + JSON::boolean("isOnline", true)
                + "}}";
            session->sendLine(response);
            
            // Broadcast presence
            std::string presenceMsg = "{"
                + JSON::str("type", "presence") + ","
                + "\"user\":{"
                + JSON::str("id", user.id) + ","
                + JSON::str("username", user.username) + ","
                + JSON::boolean("isOnline", true)
                + "}}";
            broadcastToAll(presenceMsg);
            
        } catch (const std::exception& e) {
            logger.error(std::string("Auth error: ") + e.what());
            sendError(session, "Authentication failed");
        }
    }
    
    void handleSendMessage(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string conversationId = JSONParser::extractString(json, "conversationId");
        std::string text = JSONParser::extractString(json, "text");
        
        if (conversationId.empty() || text.empty() || text.length() > 2000) {
            sendError(session, "Invalid message");
            return;
        }
        
        try {
            // Verify user has access to conversation
            if (!db->isUserInConversation(session->getUserId(), conversationId)) {
                sendError(session, "Unauthorized conversation access");
                return;
            }
            
            // Persist message
            ChatDB::Message msg = db->createMessage(conversationId, session->getUserId(), text);
            
            // Build message JSON
            std::string messageJson = "{"
                + JSON::str("type", "message") + ","
                + JSON::str("id", msg.id) + ","
                + JSON::str("conversationId", msg.conversationId) + ","
                + JSON::str("fromUserId", msg.fromUserId) + ","
                + JSON::str("text", msg.text) + ","
                + JSON::num("timestamp", msg.timestamp)
                + "}";
            
            // Route message based on conversation type
            if (conversationId == "public_general") {
                broadcastToAll(messageJson);
            } else {
                std::vector<std::string> members = db->getConversationMembers(conversationId);
                for (const auto& memberId : members) {
                    sendToUser(memberId, messageJson);
                }
            }
            
            logger.log("Message sent: " + session->getUsername() + " -> " + conversationId);
            
        } catch (const std::exception& e) {
            logger.error(std::string("Send message error: ") + e.what());
            sendError(session, "Failed to send message");
        }
    }
    
    void handleFetchConversations(std::shared_ptr<ClientSession> session) {
        try {
            std::vector<ChatDB::Conversation> convs = db->getConversationsForUser(session->getUserId());
            
            std::ostringstream oss;
            oss << "{" << JSON::str("type", "conversations") << ",\"conversations\":[";
            
            for (size_t i = 0; i < convs.size(); i++) {
                if (i > 0) oss << ",";
                
                std::string displayName = convs[i].name;
                if (displayName.empty() && convs[i].type == "direct") {
                    // Get other user's name for direct conversations
                    std::vector<std::string> members = db->getConversationMembers(convs[i].id);
                    for (const auto& memberId : members) {
                        if (memberId != session->getUserId()) {
                            ChatDB::User* otherUser = db->getUserById(memberId);
                            if (otherUser) {
                                displayName = otherUser->username;
                                delete otherUser;
                            }
                            break;
                        }
                    }
                }
                
                oss << "{"
                    << JSON::str("id", convs[i].id) << ","
                    << JSON::str("type", convs[i].type) << ","
                    << JSON::str("name", displayName) << ","
                    << JSON::num("unreadCount", 0);
                
                // Add last message info
                ChatDB::Message* lastMsg = db->getLastMessage(convs[i].id);
                if (lastMsg) {
                    ChatDB::User* sender = db->getUserById(lastMsg->fromUserId);
                    oss << "," << JSON::str("lastMessage", lastMsg->text);
                    oss << "," << JSON::num("lastMessageTime", lastMsg->timestamp);
                    if (sender) {
                        oss << "," << JSON::str("lastMessageFrom", sender->username);
                        delete sender;
                    }
                    delete lastMsg;
                }
                
                oss << "}";
            }
            
            oss << "]}";
            session->sendLine(oss.str());
            
        } catch (const std::exception& e) {
            logger.error(std::string("Fetch conversations error: ") + e.what());
            sendError(session, "Failed to fetch conversations");
        }
    }
    
    void handleFetchHistory(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string conversationId = JSONParser::extractString(json, "conversationId");
        int limit = JSONParser::extractInt(json, "limit");
        if (limit <= 0 || limit > 100) limit = 50;
        
        try {
            if (!db->isUserInConversation(session->getUserId(), conversationId)) {
                sendError(session, "Unauthorized");
                return;
            }
            
            std::vector<ChatDB::Message> messages = db->getMessageHistory(conversationId, limit);
            
            std::ostringstream oss;
            oss << "{" << JSON::str("type", "history") << ","
                << JSON::str("conversationId", conversationId) << ",\"messages\":[";
            
            for (size_t i = 0; i < messages.size(); i++) {
                if (i > 0) oss << ",";
                oss << "{"
                    << JSON::str("id", messages[i].id) << ","
                    << JSON::str("conversationId", messages[i].conversationId) << ","
                    << JSON::str("fromUserId", messages[i].fromUserId) << ","
                    << JSON::str("text", messages[i].text) << ","
                    << JSON::num("timestamp", messages[i].timestamp)
                    << "}";
            }
            
            oss << "]}";
            session->sendLine(oss.str());
            
        } catch (const std::exception& e) {
            logger.error(std::string("Fetch history error: ") + e.what());
            sendError(session, "Failed to fetch history");
        }
    }
    
    void handleFetchUsers(std::shared_ptr<ClientSession> session) {
        try {
            std::vector<ChatDB::User> users = db->getAllUsers();
            
            std::ostringstream oss;
            oss << "{" << JSON::str("type", "users") << ",\"users\":[";
            
            for (size_t i = 0; i < users.size(); i++) {
                if (i > 0) oss << ",";
                oss << "{"
                    << JSON::str("id", users[i].id) << ","
                    << JSON::str("username", users[i].username) << ","
                    << JSON::boolean("isOnline", users[i].isOnline) << ","
                    << JSON::num("lastSeenAt", users[i].lastSeenAt)
                    << "}";
            }
            
            oss << "]}";
            session->sendLine(oss.str());
            
        } catch (const std::exception& e) {
            logger.error(std::string("Fetch users error: ") + e.what());
            sendError(session, "Failed to fetch users");
        }
    }
    
    void handleFetchNotifications(std::shared_ptr<ClientSession> session) {
        try {
            std::vector<ChatDB::Notification> notifs = db->getNotificationsForUser(session->getUserId());
            
            std::ostringstream oss;
            oss << "{" << JSON::str("type", "notifications") << ",\"notifications\":[";
            
            for (size_t i = 0; i < notifs.size(); i++) {
                if (i > 0) oss << ",";
                
                std::string actorName = notifs[i].actorId;
                if (!actorName.empty()) {
                    ChatDB::User* actor = db->getUserById(notifs[i].actorId);
                    if (actor) {
                        actorName = actor->username;
                        delete actor;
                    }
                }
                
                oss << "{"
                    << JSON::str("id", notifs[i].id) << ","
                    << JSON::str("type", notifs[i].type) << ","
                    << JSON::str("actorId", notifs[i].actorId) << ","
                    << JSON::str("text", notifs[i].text) << ","
                    << JSON::num("timestamp", notifs[i].timestamp) << ","
                    << JSON::boolean("isRead", notifs[i].isRead)
                    << "}";
            }
            
            oss << "]}";
            session->sendLine(oss.str());
            
        } catch (const std::exception& e) {
            logger.error(std::string("Fetch notifications error: ") + e.what());
            sendError(session, "Failed to fetch notifications");
        }
    }
    
    void handleFetchSuggestions(std::shared_ptr<ClientSession> session) {
        try {
            std::vector<ChatDB::User> suggestions = db->getSuggestedContacts(session->getUserId(), 10);
            
            std::ostringstream oss;
            oss << "{" << JSON::str("type", "suggestions") << ",\"suggestions\":[";
            
            for (size_t i = 0; i < suggestions.size(); i++) {
                if (i > 0) oss << ",";
                oss << "{"
                    << JSON::str("id", suggestions[i].id) << ","
                    << JSON::str("username", suggestions[i].username) << ","
                    << JSON::boolean("isOnline", suggestions[i].isOnline) << ","
                    << JSON::num("mutualCount", 0)
                    << "}";
            }
            
            oss << "]}";
            session->sendLine(oss.str());
            
        } catch (const std::exception& e) {
            logger.error(std::string("Fetch suggestions error: ") + e.what());
            sendError(session, "Failed to fetch suggestions");
        }
    }
    
    void handleCreateGroup(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string groupName = JSONParser::extractString(json, "name");
        
        if (groupName.empty() || groupName.length() > 100) {
            sendError(session, "Invalid group name");
            return;
        }
        
        try {
            // Create group conversation
            ChatDB::Conversation conv = db->createConversation("group", groupName, session->getUserId());
            
            // Add creator as member
            db->addConversationMember(conv.id, session->getUserId());
            
            logger.log("Group created: " + groupName + " by " + session->getUsername());
            
            // Parse member IDs from JSON (simplified)
            size_t pos = json.find("\"memberIds\"");
            if (pos != std::string::npos) {
                size_t start = json.find("[", pos);
                size_t end = json.find("]", start);
                if (start != std::string::npos && end != std::string::npos) {
                    std::string membersStr = json.substr(start + 1, end - start - 1);
                    std::istringstream iss(membersStr);
                    std::string memberId;
                    while (std::getline(iss, memberId, ',')) {
                        // Clean up quotes and whitespace
                        memberId.erase(std::remove(memberId.begin(), memberId.end(), '\"'), memberId.end());
                        memberId.erase(std::remove(memberId.begin(), memberId.end(), ' '), memberId.end());
                        if (!memberId.empty() && memberId != session->getUserId()) {
                            db->addConversationMember(conv.id, memberId);
                            
                            // Send notification to member
                            std::string notifText = session->getUsername() + " added you to group: " + groupName;
                            db->createNotification(memberId, session->getUserId(), "group_invite", notifText);
                            
                            // Send real-time notification if online
                            std::string notifMsg = "{"
                                + JSON::str("type", "notification") + ","
                                + JSON::str("notifType", "group_invite") + ","
                                + JSON::str("text", notifText)
                                + "}";
                            sendToUser(memberId, notifMsg);
                        }
                    }
                }
            }
            
            // Send success response
            std::string response = "{"
                + JSON::str("type", "group_created") + ","
                + JSON::str("conversationId", conv.id) + ","
                + "\"conversation\":{"
                + JSON::str("id", conv.id) + ","
                + JSON::str("type", "group") + ","
                + JSON::str("name", conv.name) + ","
                + JSON::num("unreadCount", 0)
                + "}}";
            session->sendLine(response);
            
        } catch (const std::exception& e) {
            logger.error(std::string("Create group error: ") + e.what());
            sendError(session, "Failed to create group");
        }
    }
    
    void handleCreateDirect(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string otherUserId = JSONParser::extractString(json, "userId");
        
        if (otherUserId.empty() || otherUserId == session->getUserId()) {
            sendError(session, "Invalid user");
            return;
        }
        
        try {
            // Check if DM already exists
            std::vector<ChatDB::Conversation> convs = db->getConversationsForUser(session->getUserId());
            for (const auto& conv : convs) {
                if (conv.type == "direct") {
                    std::vector<std::string> members = db->getConversationMembers(conv.id);
                    if (members.size() == 2 && 
                        std::find(members.begin(), members.end(), otherUserId) != members.end()) {
                        // DM already exists
                        std::string response = "{"
                            + JSON::str("type", "conversation_created") + ","
                            + JSON::str("conversationId", conv.id)
                            + "}";
                        session->sendLine(response);
                        return;
                    }
                }
            }
            
            // Create new DM
            ChatDB::User* otherUser = db->getUserById(otherUserId);
            if (!otherUser) {
                sendError(session, "User not found");
                return;
            }
            
            std::string dmName = session->getUsername() + " & " + otherUser->username;
            ChatDB::Conversation conv = db->createConversation("direct", dmName, session->getUserId());
            
            db->addConversationMember(conv.id, session->getUserId());
            db->addConversationMember(conv.id, otherUserId);
            
            delete otherUser;
            
            logger.log("Direct conversation created: " + conv.id);
            
            std::string response = "{"
                + JSON::str("type", "conversation_created") + ","
                + JSON::str("conversationId", conv.id)
                + "}";
            session->sendLine(response);
            
        } catch (const std::exception& e) {
            logger.error(std::string("Create direct error: ") + e.what());
            sendError(session, "Failed to create conversation");
        }
    }
    
    void handleAddGroupMember(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string conversationId = JSONParser::extractString(json, "conversationId");
        std::string userId = JSONParser::extractString(json, "userId");
        
        try {
            ChatDB::Conversation* conv = db->getConversation(conversationId);
            if (!conv || conv->type != "group") {
                sendError(session, "Invalid group");
                delete conv;
                return;
            }
            
            // Check if requester is member (simplified authorization)
            if (!db->isUserInConversation(session->getUserId(), conversationId)) {
                sendError(session, "Unauthorized");
                delete conv;
                return;
            }
            
            db->addConversationMember(conversationId, userId);
            
            std::string notifText = session->getUsername() + " added you to group: " + conv->name;
            db->createNotification(userId, session->getUserId(), "group_invite", notifText);
            
            delete conv;
            
            std::string response = "{" + JSON::str("type", "member_added") + "," + JSON::str("conversationId", conversationId) + "}";
            session->sendLine(response);
            
        } catch (const std::exception& e) {
            logger.error(std::string("Add member error: ") + e.what());
            sendError(session, "Failed to add member");
        }
    }
    
    void handleContactRequest(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string targetUserId = JSONParser::extractString(json, "userId");
        
        try {
            db->createContactRequest(session->getUserId(), targetUserId);
            
            std::string notifText = session->getUsername() + " sent you a contact request";
            db->createNotification(targetUserId, session->getUserId(), "contact_request", notifText);
            
            std::string response = "{" + JSON::str("type", "contact_request_sent") + "}";
            session->sendLine(response);
            
        } catch (const std::exception& e) {
            logger.error(std::string("Contact request error: ") + e.what());
            sendError(session, "Failed to send contact request");
        }
    }
    
    void handleSearchUsers(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string query = JSONParser::extractString(json, "query");
        
        try {
            std::vector<ChatDB::User> allUsers = db->getAllUsers();
            std::vector<ChatDB::User> results;
            
            for (const auto& user : allUsers) {
                if (user.id != session->getUserId() && 
                    user.username.find(query) != std::string::npos) {
                    results.push_back(user);
                    if (results.size() >= 10) break;
                }
            }
            
            std::ostringstream oss;
            oss << "{" << JSON::str("type", "search_results") << ",\"users\":[";
            
            for (size_t i = 0; i < results.size(); i++) {
                if (i > 0) oss << ",";
                oss << "{"
                    << JSON::str("id", results[i].id) << ","
                    << JSON::str("username", results[i].username) << ","
                    << JSON::boolean("isOnline", results[i].isOnline)
                    << "}";
            }
            
            oss << "]}";
            session->sendLine(oss.str());
            
        } catch (const std::exception& e) {
            logger.error(std::string("Search error: ") + e.what());
            sendError(session, "Search failed");
        }
    }

    void handleTyping(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string conversationId = JSONParser::extractString(json, "conversationId");
        bool isTyping = JSONParser::extractBool(json, "isTyping");
        if (conversationId.empty()) return;
        if (!db->isUserInConversation(session->getUserId(), conversationId)) return;

        std::string typingMsg = "{"
            + JSON::str("type", "typing") + ","
            + JSON::str("conversationId", conversationId) + ","
            + JSON::str("userId", session->getUserId()) + ","
            + JSON::str("username", session->getUsername()) + ","
            + JSON::boolean("isTyping", isTyping)
            + "}";

        if (conversationId == "public_general") {
            broadcastToAll(typingMsg);
        } else {
            std::vector<std::string> members = db->getConversationMembers(conversationId);
            for (const auto& memberId : members) {
                if (memberId != session->getUserId()) {
                    sendToUser(memberId, typingMsg);
                }
            }
        }
    }

    void handleMarkRead(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string conversationId = JSONParser::extractString(json, "conversationId");
        if (conversationId.empty()) return;
        std::string ack = "{" + JSON::str("type", "read_ack") + "," + JSON::str("conversationId", conversationId) + "}";
        session->sendLine(ack);
    }

    void handleMarkNotifRead(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string notifId = JSONParser::extractString(json, "id");
        if (!notifId.empty()) {
            try {
                db->markNotificationRead(notifId);
                session->sendLine("{" + JSON::str("type", "notification_marked_read") + "," + JSON::str("id", notifId) + "}");
            } catch (...) {}
        }
    }

    void handleAcceptContact(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string targetUserId = JSONParser::extractString(json, "userId");
        if (targetUserId.empty()) return;
        try {
            db->acceptContactRequest(targetUserId, session->getUserId());
            std::string notifText = session->getUsername() + " accepted your contact request";
            db->createNotification(targetUserId, session->getUserId(), "contact_accept", notifText);

            std::string notifMsg = "{"
                + JSON::str("type", "notification") + ","
                + JSON::str("notifType", "contact_accept") + ","
                + JSON::str("text", notifText)
                + "}";
            sendToUser(targetUserId, notifMsg);

            ChatDB::User* otherUser = db->getUserById(targetUserId);
            if (otherUser) {
                std::string dmName = session->getUsername() + " & " + otherUser->username;
                ChatDB::Conversation conv = db->createConversation("direct", dmName, session->getUserId());
                db->addConversationMember(conv.id, session->getUserId());
                db->addConversationMember(conv.id, targetUserId);
                delete otherUser;

                std::string convCreated = "{"
                    + JSON::str("type", "conversation_created") + ","
                    + JSON::str("conversationId", conv.id)
                    + "}";
                session->sendLine(convCreated);
                sendToUser(targetUserId, convCreated);
            }
        } catch (const std::exception& e) {
            logger.error(std::string("Accept contact error: ") + e.what());
            sendError(session, "Failed to accept contact request");
        }
    }

    void handleRemoveGroupMember(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string conversationId = JSONParser::extractString(json, "conversationId");
        std::string userId = JSONParser::extractString(json, "userId");
        try {
            ChatDB::Conversation* conv = db->getConversation(conversationId);
            if (!conv || conv->type != "group") {
                sendError(session, "Invalid group");
                if (conv) delete conv;
                return;
            }
            if (conv->creatorId != session->getUserId()) {
                sendError(session, "Only group creator can remove members");
                delete conv;
                return;
            }
            db->removeConversationMember(conversationId, userId);
            delete conv;
            session->sendLine("{" + JSON::str("type", "member_removed") + "," + JSON::str("conversationId", conversationId) + "," + JSON::str("userId", userId) + "}");
            sendToUser(userId, "{" + JSON::str("type", "removed_from_group") + "," + JSON::str("conversationId", conversationId) + "}");
        } catch (const std::exception& e) {
            logger.error(std::string("Remove member error: ") + e.what());
            sendError(session, "Failed to remove member");
        }
    }

    void handleLeaveGroup(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string conversationId = JSONParser::extractString(json, "conversationId");
        try {
            db->removeConversationMember(conversationId, session->getUserId());
            session->sendLine("{" + JSON::str("type", "group_left") + "," + JSON::str("conversationId", conversationId) + "}");
        } catch (const std::exception& e) {
            logger.error(std::string("Leave group error: ") + e.what());
            sendError(session, "Failed to leave group");
        }
    }

    void handleFetchGroupMembers(std::shared_ptr<ClientSession> session, const std::string& json) {
        std::string conversationId = JSONParser::extractString(json, "conversationId");
        if (conversationId.empty()) {
            conversationId = JSONParser::extractString(json, "groupId"); // fallback key
        }
        try {
            if (conversationId.empty() || !db->isUserInConversation(session->getUserId(), conversationId)) {
                sendError(session, "Unauthorized");
                return;
            }
            std::vector<std::string> memberIds = db->getConversationMembers(conversationId);
            ChatDB::Conversation* conv = db->getConversation(conversationId);
            std::string creatorId = conv ? conv->creatorId : "";
            if (conv) delete conv;

            std::ostringstream oss;
            oss << "{" << JSON::str("type", "group_members") << "," << JSON::str("conversationId", conversationId) << ",\"members\":[";
            for (size_t i = 0; i < memberIds.size(); i++) {
                if (i > 0) oss << ",";
                ChatDB::User* u = db->getUserById(memberIds[i]);
                if (u) {
                    oss << "{"
                        << JSON::str("id", u->id) << ","
                        << JSON::str("username", u->username) << ","
                        << JSON::boolean("isOnline", u->isOnline) << ","
                        << JSON::boolean("isCreator", u->id == creatorId)
                        << "}";
                    delete u;
                }
            }
            oss << "]}";
            session->sendLine(oss.str());
        } catch (const std::exception& e) {
            logger.error(std::string("Fetch members error: ") + e.what());
            sendError(session, "Failed to fetch members");
        }
    }
    
    void sendError(std::shared_ptr<ClientSession> session, const std::string& message) {
        std::string error = "{" + JSON::str("type", "error") + "," + JSON::str("message", message) + "}";
        session->sendLine(error);
    }
    
    void sendToUser(const std::string& userId, const std::string& message) {
        EnterCriticalSection(&sessionsCs);
        auto it = userIdToSocket.find(userId);
        if (it != userIdToSocket.end()) {
            auto sessionIt = sessions.find(it->second);
            if (sessionIt != sessions.end()) {
                sessionIt->second->sendLine(message);
            }
        }
        LeaveCriticalSection(&sessionsCs);
    }
    
    void broadcastToAll(const std::string& message) {
        EnterCriticalSection(&sessionsCs);
        for (auto& pair : sessions) {
            if (pair.second->isAuthenticated()) {
                pair.second->sendLine(message);
            }
        }
        LeaveCriticalSection(&sessionsCs);
    }
    
public:
    ChatServer(int serverPort, const std::string& dbPath) 
        : port(serverPort), listenSocket(INVALID_SOCKET) {
        InitializeCriticalSection(&sessionsCs);
        
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            throw std::runtime_error("WSAStartup failed");
        }
        
        try {
            db = std::make_shared<ChatDB::DatabaseManager>(dbPath);
            logger.log("Database initialized: " + dbPath);
        } catch (const std::exception& e) {
            logger.error(std::string("Database initialization failed: ") + e.what());
            throw;
        }
    }
    
    ~ChatServer() {
        if (listenSocket != INVALID_SOCKET) {
            closesocket(listenSocket);
        }
        DeleteCriticalSection(&sessionsCs);
        WSACleanup();
    }
    
    bool start() {
        listenSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (listenSocket == INVALID_SOCKET) {
            logger.error("Failed to create socket");
            return false;
        }
        
        BOOL opt = TRUE;
        setsockopt(listenSocket, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
        
        sockaddr_in serverAddr{};
        serverAddr.sin_family = AF_INET;
        serverAddr.sin_addr.s_addr = INADDR_ANY;
        serverAddr.sin_port = htons((u_short)port);
        
        if (bind(listenSocket, (sockaddr*)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
            logger.error("Bind failed with error: " + std::to_string(WSAGetLastError()));
            return false;
        }
        
        if (listen(listenSocket, SOMAXCONN) == SOCKET_ERROR) {
            logger.error("Listen failed with error: " + std::to_string(WSAGetLastError()));
            return false;
        }
        
        logger.log("========================================");
        logger.log("Enhanced Chat Server Started");
        logger.log("Port: " + std::to_string(port));
        logger.log("Features: SQLite, JSON Protocol, Groups, DMs");
        logger.log("========================================");
        
        while (true) {
            sockaddr_in clientAddr{};
            int clientLen = sizeof(clientAddr);
            SOCKET clientSock = accept(listenSocket, (sockaddr*)&clientAddr, &clientLen);
            if (clientSock == INVALID_SOCKET) continue;
            
            char* ipStr = inet_ntoa(clientAddr.sin_addr);
            logger.log(std::string("New connection from ") + (ipStr ? ipStr : "unknown"));
            
            BOOL nodelay = TRUE;
            setsockopt(clientSock, IPPROTO_TCP, TCP_NODELAY, (const char*)&nodelay, sizeof(nodelay));
            
            ClientContext* ctx = new ClientContext{ this, clientSock };
            HANDLE hThread = CreateThread(NULL, 0, clientThreadProc, ctx, 0, NULL);
            if (hThread != NULL) {
                CloseHandle(hThread);
            } else {
                delete ctx;
                closesocket(clientSock);
            }
        }
        
        return true;
    }
};

int main(int argc, char* argv[]) {
    int port = 8080;
    std::string dbPath = "chat.db";
    
    if (argc >= 2) port = std::atoi(argv[1]);
    if (argc >= 3) dbPath = argv[2];
    
    try {
        ChatServer server(port, dbPath);
        server.start();
    } catch (const std::exception& e) {
        std::cerr << "Fatal error: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}