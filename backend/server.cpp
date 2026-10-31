// server.cpp - Object-Oriented Multi-Client TCP Chat Server
// Compile: g++ -std=c++11 server.cpp -o server.exe -lws2_32
// Run:     server.exe 8080

#define _WIN32_WINNT 0x0600
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

#include <iostream>
#include <string>
#include <map>
#include <ctime>
#include <fstream>

#pragma comment(lib, "ws2_32.lib")

// ==========================================
// 1. Logger Class (Encapsulation & RAII)
// ==========================================
class Logger {
private:
    std::ofstream logFile;
    CRITICAL_SECTION logCs;

    std::string getTimestamp() {
        std::time_t now = std::time(nullptr);
        char buf[32];
        struct tm* timeinfo = std::localtime(&now);
        if (timeinfo) {
            std::strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", timeinfo);
            return std::string(buf);
        }
        return "0000-00-00 00:00:00";
    }

public:
    Logger(const std::string& filename = "chat_log.txt") {
        InitializeCriticalSection(&logCs);
        logFile.open(filename, std::ios::app);
    }

    ~Logger() {
        if (logFile.is_open()) {
            logFile.close();
        }
        DeleteCriticalSection(&logCs);
    }

    void log(const std::string& message) {
        EnterCriticalSection(&logCs);
        std::string formatted = "[" + getTimestamp() + "] " + message;
        std::cout << formatted << std::endl;
        if (logFile.is_open()) {
            logFile << formatted << std::endl;
            logFile.flush();
        }
        LeaveCriticalSection(&logCs);
    }
};

// ==========================================
// 2. ChatServer Class (Core OOP Architecture)
// ==========================================
class ChatServer {
private:
    int port;
    SOCKET listenSocket;
    std::map<SOCKET, std::string> clients; // Socket descriptor -> Username
    CRITICAL_SECTION clientsCs;
    Logger logger;

    // Helper context struct to pass instance and socket to client thread
    struct ClientContext {
        ChatServer* server;
        SOCKET socket;
    };

    // Private helper: Send string with \r\n delimiter (required by telnet/curl & Windows terminals)
    bool sendLine(SOCKET sock, const std::string& msg) {
        std::string payload = msg + "\r\n";
        int sent = send(sock, payload.c_str(), (int)payload.size(), 0);
        return sent != SOCKET_ERROR;
    }

    // Static thread procedure bridge to member function
    static DWORD WINAPI clientThreadProc(LPVOID lpParam) {
        ClientContext* ctx = static_cast<ClientContext*>(lpParam);
        ctx->server->handleClient(ctx->socket);
        delete ctx; // Clean up dynamically allocated context
        return 0;
    }

    // Per-client communication worker
    void handleClient(SOCKET clientSock) {
        char buffer[1024];
        std::string incomplete;
        std::string username;
        int bytesRead = 0;

        // Prompt client for username explicitly
        sendLine(clientSock, "========================================");
        sendLine(clientSock, "    WELCOME TO MULTI-CLIENT CHATROOM    ");
        sendLine(clientSock, "========================================");
        sendLine(clientSock, "Please enter your Name/Username: ");

        // 1. Read first line as Username
        while (true) {
            size_t pos = incomplete.find('\n');
            if (pos != std::string::npos) {
                username = incomplete.substr(0, pos);
                incomplete.erase(0, pos + 1);
                if (!username.empty() && username.back() == '\r') username.pop_back();
                break;
            }
            bytesRead = recv(clientSock, buffer, sizeof(buffer) - 1, 0);
            if (bytesRead <= 0) {
                closesocket(clientSock);
                return;
            }
            buffer[bytesRead] = '\0';
            incomplete += std::string(buffer, bytesRead);
        }

        if (username.empty()) username = "Anonymous";

        // Register client
        {
            EnterCriticalSection(&clientsCs);
            clients[clientSock] = username;
            LeaveCriticalSection(&clientsCs);
        }

        logger.log(username + " connected.");
        broadcast("[INFO] " + username + " has joined the chat room!", clientSock);
        sendLine(clientSock, "\n[SUCCESS] Joined as '" + username + "'. Type your messages and press Enter (or /quit to exit):");
        sendLine(clientSock, "--------------------------------------------------");

        // 2. Message processing loop
        while (true) {
            bytesRead = recv(clientSock, buffer, sizeof(buffer) - 1, 0);
            if (bytesRead <= 0) break; // Client disconnected or error

            buffer[bytesRead] = '\0';
            incomplete += std::string(buffer, bytesRead);

            size_t pos;
            while ((pos = incomplete.find('\n')) != std::string::npos) {
                std::string line = incomplete.substr(0, pos);
                incomplete.erase(0, pos + 1);
                if (!line.empty() && line.back() == '\r') line.pop_back();
                if (line.empty()) continue;

                std::string broadcastMsg = "[" + username + "]: " + line;
                logger.log(broadcastMsg);
                broadcast(broadcastMsg); // Broadcast to EVERYONE (including the sender)
            }
        }

        // Cleanup on disconnect
        removeClient(clientSock);
    }

    void removeClient(SOCKET sock) {
        std::string username;
        {
            EnterCriticalSection(&clientsCs);
            auto it = clients.find(sock);
            if (it != clients.end()) {
                username = it->second;
                clients.erase(it);
            }
            LeaveCriticalSection(&clientsCs);
        }
        closesocket(sock);
        if (!username.empty()) {
            logger.log(username + " disconnected.");
            broadcast(username + " has left the chat.");
        }
    }

public:
    // Constructor (RAII: Winsock & synchronization initialization)
    ChatServer(int serverPort) : port(serverPort), listenSocket(INVALID_SOCKET), logger("chat_log.txt") {
        InitializeCriticalSection(&clientsCs);

        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            std::cerr << "WSAStartup failed.\n";
        }
    }

    // Destructor (RAII: Socket cleanup, Critical section release, Winsock termination)
    ~ChatServer() {
        if (listenSocket != INVALID_SOCKET) {
            closesocket(listenSocket);
        }
        DeleteCriticalSection(&clientsCs);
        WSACleanup();
    }

    // Broadcast a message to all connected clients
    void broadcast(const std::string& msg, SOCKET excludeSock = INVALID_SOCKET) {
        EnterCriticalSection(&clientsCs);
        for (auto& pair : clients) {
            // Send to everyone (including sender if excludeSock is INVALID_SOCKET)
            if (pair.first == excludeSock) continue;
            sendLine(pair.first, msg);
        }
        LeaveCriticalSection(&clientsCs);
    }

    // Start listening and accept incoming client connections
    bool start() {
        listenSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (listenSocket == INVALID_SOCKET) {
            std::cerr << "Failed to create socket.\n";
            return false;
        }

        BOOL opt = TRUE;
        setsockopt(listenSocket, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));

        sockaddr_in serverAddr{};
        serverAddr.sin_family = AF_INET;
        serverAddr.sin_addr.s_addr = INADDR_ANY;
        serverAddr.sin_port = htons((u_short)port);

        if (bind(listenSocket, (sockaddr*)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
            std::cerr << "Bind failed.\n";
            return false;
        }

        if (listen(listenSocket, SOMAXCONN) == SOCKET_ERROR) {
            std::cerr << "Listen failed.\n";
            return false;
        }

        logger.log("Server started on port " + std::to_string(port));

        while (true) {
            sockaddr_in clientAddr{};
            int clientLen = sizeof(clientAddr);
            SOCKET clientSock = accept(listenSocket, (sockaddr*)&clientAddr, &clientLen);
            if (clientSock == INVALID_SOCKET) {
                continue;
            }

            char* ipStr = inet_ntoa(clientAddr.sin_addr);
            logger.log(std::string("New connection from ") + (ipStr ? ipStr : "unknown"));

            // Disable Nagle algorithm for immediate packet delivery to telnet/curl clients
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
    if (argc >= 2) port = std::atoi(argv[1]);

    // Create ChatServer object and start listening
    ChatServer server(port);
    server.start();

    return 0;
}