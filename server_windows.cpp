// server.cpp  (WINDOWS VERSION - Winsock2)
// Multi-client TCP chat server
// Compile (MinGW):        g++ -std=c++11 server.cpp -o server.exe -lws2_32
// Compile (Visual Studio): cl server.cpp /EHsc /link ws2_32.lib
// Run: server.exe 8080

#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

#include <iostream>
#include <string>
#include <map>
#include <thread>
#include <mutex>
#include <ctime>
#include <fstream>

#pragma comment(lib, "ws2_32.lib")

// ---------- Shared state (protected by clientsMutex) ----------
std::mutex clientsMutex;
std::map<SOCKET, std::string> clients;   // socket -> username

std::mutex logMutex;
std::ofstream logFile;

// ---------- Helpers ----------
std::string currentTimestamp() {
    std::time_t now = std::time(nullptr);
    char buf[32];
    struct tm timeinfo;
    localtime_s(&timeinfo, &now);
    std::strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
    return std::string(buf);
}

void logMessage(const std::string& msg) {
    std::lock_guard<std::mutex> lock(logMutex);
    std::string line = "[" + currentTimestamp() + "] " + msg;
    std::cout << line << std::endl;
    if (logFile.is_open()) {
        logFile << line << std::endl;
        logFile.flush();
    }
}

// Sends one "\n"-terminated message to a single socket.
bool sendLine(SOCKET sock, const std::string& msg) {
    std::string out = msg + "\n";
    int sent = send(sock, out.c_str(), (int)out.size(), 0);
    return sent != SOCKET_ERROR;
}

// Broadcasts a message to every connected client except excludeSock (INVALID_SOCKET = exclude none).
void broadcast(const std::string& msg, SOCKET excludeSock = INVALID_SOCKET) {
    std::lock_guard<std::mutex> lock(clientsMutex);
    for (auto& pair : clients) {
        if (pair.first == excludeSock) continue;
        sendLine(pair.first, msg);
    }
}

void removeClient(SOCKET sock) {
    std::string username;
    {
        std::lock_guard<std::mutex> lock(clientsMutex);
        auto it = clients.find(sock);
        if (it != clients.end()) {
            username = it->second;
            clients.erase(it);
        }
    }
    closesocket(sock);
    if (!username.empty()) {
        logMessage(username + " disconnected.");
        broadcast(username + " has left the chat.");
    }
}

// ---------- Per-client thread ----------
// TCP is a byte stream, so partial reads are buffered and split on '\n'
// to recover individual messages (message framing).
void handleClient(SOCKET sock) {
    char buffer[1024];
    std::string incomplete;
    std::string username;

    // First message from the client is treated as their username.
    int n = recv(sock, buffer, sizeof(buffer) - 1, 0);
    if (n <= 0) {
        closesocket(sock);
        return;
    }
    buffer[n] = '\0';
    username = std::string(buffer);
    while (!username.empty() && (username.back() == '\n' || username.back() == '\r'))
        username.pop_back();
    if (username.empty()) username = "Anonymous";

    {
        std::lock_guard<std::mutex> lock(clientsMutex);
        clients[sock] = username;
    }
    logMessage(username + " connected.");
    broadcast(username + " has joined the chat.", sock);
    sendLine(sock, "Welcome, " + username + "! Type messages and press Enter.");

    while (true) {
        n = recv(sock, buffer, sizeof(buffer) - 1, 0);
        if (n <= 0) break; // 0 = clean disconnect, <0 = error

        buffer[n] = '\0';
        incomplete += std::string(buffer, n);

        size_t pos;
        while ((pos = incomplete.find('\n')) != std::string::npos) {
            std::string line = incomplete.substr(0, pos);
            incomplete.erase(0, pos + 1);
            if (!line.empty() && line.back() == '\r') line.pop_back();
            if (line.empty()) continue;

            std::string full = username + ": " + line;
            logMessage(full);
            broadcast(full, sock);
        }
    }

    removeClient(sock);
}

int main(int argc, char* argv[]) {
    int port = 8080;
    if (argc >= 2) port = std::atoi(argv[1]);

    logFile.open("chat_log.txt", std::ios::app);
    if (!logFile.is_open()) {
        std::cerr << "Warning: could not open chat_log.txt for logging.\n";
    }

    // --- Winsock startup (required on Windows before any socket calls) ---
    WSADATA wsaData;
    int wsResult = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (wsResult != 0) {
        std::cerr << "WSAStartup failed: " << wsResult << std::endl;
        return 1;
    }

    SOCKET serverSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (serverSock == INVALID_SOCKET) {
        std::cerr << "socket() failed: " << WSAGetLastError() << std::endl;
        WSACleanup();
        return 1;
    }

    // Allow immediate reuse of the port after restart
    BOOL opt = TRUE;
    setsockopt(serverSock, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));

    sockaddr_in serverAddr{};
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_addr.s_addr = INADDR_ANY;
    serverAddr.sin_port = htons((u_short)port);

    if (bind(serverSock, (sockaddr*)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
        std::cerr << "bind() failed: " << WSAGetLastError() << std::endl;
        closesocket(serverSock);
        WSACleanup();
        return 1;
    }

    if (listen(serverSock, SOMAXCONN) == SOCKET_ERROR) {
        std::cerr << "listen() failed: " << WSAGetLastError() << std::endl;
        closesocket(serverSock);
        WSACleanup();
        return 1;
    }

    logMessage("Server started on port " + std::to_string(port));

    while (true) {
        sockaddr_in clientAddr{};
        int clientLen = sizeof(clientAddr);
        SOCKET clientSock = accept(serverSock, (sockaddr*)&clientAddr, &clientLen);
        if (clientSock == INVALID_SOCKET) {
            std::cerr << "accept() failed: " << WSAGetLastError() << std::endl;
            continue;
        }

        char ipStr[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &clientAddr.sin_addr, ipStr, sizeof(ipStr));
        logMessage(std::string("New connection from ") + ipStr);

        // One thread per client; detach so it cleans up on exit.
        std::thread(handleClient, clientSock).detach();
    }

    closesocket(serverSock);
    WSACleanup();
    return 0;
}
