// client.cpp  (WINDOWS VERSION - Winsock2)
// TCP chat client
// Compile (MinGW):        g++ -std=c++11 client.cpp -o client.exe -lws2_32
// Compile (Visual Studio): cl client.cpp /EHsc /link ws2_32.lib
// Run: client.exe 127.0.0.1 8080

#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

#include <iostream>
#include <string>
#include <thread>
#include <atomic>

#pragma comment(lib, "ws2_32.lib")

std::atomic<bool> running(true);

// Continuously listens for incoming messages from the server and prints them.
void receiveLoop(SOCKET sock) {
    char buffer[1024];
    std::string incomplete;

    while (running) {
        int n = recv(sock, buffer, sizeof(buffer) - 1, 0);
        if (n <= 0) {
            std::cout << "\n[Disconnected from server]\n";
            running = false;
            break;
        }
        buffer[n] = '\0';
        incomplete += std::string(buffer, n);

        size_t pos;
        while ((pos = incomplete.find('\n')) != std::string::npos) {
            std::string line = incomplete.substr(0, pos);
            incomplete.erase(0, pos + 1);
            if (!line.empty() && line.back() == '\r') line.pop_back();
            std::cout << line << std::endl;
        }
    }
}

int main(int argc, char* argv[]) {
    std::string serverIp = "127.0.0.1";
    int port = 8080;
    if (argc >= 2) serverIp = argv[1];
    if (argc >= 3) port = std::atoi(argv[2]);

    WSADATA wsaData;
    int wsResult = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (wsResult != 0) {
        std::cerr << "WSAStartup failed: " << wsResult << std::endl;
        return 1;
    }

    SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock == INVALID_SOCKET) {
        std::cerr << "socket() failed: " << WSAGetLastError() << std::endl;
        WSACleanup();
        return 1;
    }

    sockaddr_in serverAddr{};
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons((u_short)port);
    if (inet_pton(AF_INET, serverIp.c_str(), &serverAddr.sin_addr) <= 0) {
        std::cerr << "Invalid server address.\n";
        WSACleanup();
        return 1;
    }

    if (connect(sock, (sockaddr*)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
        std::cerr << "connect() failed: " << WSAGetLastError() << std::endl;
        WSACleanup();
        return 1;
    }

    std::cout << "Connected to server " << serverIp << ":" << port << std::endl;
    std::cout << "Enter your username: ";
    std::string username;
    std::getline(std::cin, username);
    if (username.empty()) username = "Anonymous";
    std::string usernameLine = username + "\n";
    send(sock, usernameLine.c_str(), (int)usernameLine.size(), 0);

    // Background thread handles incoming messages so the user can
    // type and receive at the same time.
    std::thread receiver(receiveLoop, sock);

    std::string line;
    while (running && std::getline(std::cin, line)) {
        if (line == "/quit") break;
        if (line.empty()) continue;
        std::string out = line + "\n";
        int sent = send(sock, out.c_str(), (int)out.size(), 0);
        if (sent == SOCKET_ERROR) {
            std::cerr << "send() failed, connection may be lost.\n";
            break;
        }
    }

    running = false;
    shutdown(sock, SD_BOTH);
    closesocket(sock);
    if (receiver.joinable()) receiver.join();

    WSACleanup();
    std::cout << "Disconnected.\n";
    return 0;
}