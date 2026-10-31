// client.cpp - Object-Oriented TCP Chat Client
// Compile: g++ -std=c++11 client.cpp -o client.exe -lws2_32
// Run:     client.exe 127.0.0.1 8080

#define _WIN32_WINNT 0x0600
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

#include <iostream>
#include <string>

#pragma comment(lib, "ws2_32.lib")

#ifndef ENABLE_VIRTUAL_TERMINAL_PROCESSING
#define ENABLE_VIRTUAL_TERMINAL_PROCESSING 0x0004
#endif

// ==========================================
// ChatClient Class (OOP Client Architecture)
// ==========================================
class ChatClient {
private:
    std::string serverIp;
    int serverPort;
    SOCKET clientSocket;
    HANDLE recvThreadHandle;
    volatile bool isRunning;

    // Static thread entry point bridging to instance method
    static DWORD WINAPI receiverThreadProc(LPVOID lpParam) {
        ChatClient* client = static_cast<ChatClient*>(lpParam);
        client->receiveMessages();
        return 0;
    }

    // Background message receiving worker
    void receiveMessages() {
        char buffer[1024];
        std::string incomplete;

        while (isRunning) {
            int n = recv(clientSocket, buffer, sizeof(buffer) - 1, 0);
            if (n <= 0) {
                std::cout << "\n[Disconnected from server]\n";
                isRunning = false;
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

public:
    // Constructor (RAII: Winsock initialization)
    ChatClient(const std::string& ip, int port)
        : serverIp(ip), serverPort(port), clientSocket(INVALID_SOCKET),
          recvThreadHandle(NULL), isRunning(false) {
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
            std::cerr << "WSAStartup failed.\n";
        }

        // Enable ANSI escape sequence processing in Windows Console for clean UI formatting
        HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);
        if (hOut != INVALID_HANDLE_VALUE) {
            DWORD dwMode = 0;
            if (GetConsoleMode(hOut, &dwMode)) {
                dwMode |= ENABLE_VIRTUAL_TERMINAL_PROCESSING;
                SetConsoleMode(hOut, dwMode);
            }
        }
    }

    // Destructor (RAII: Clean socket and thread handle closure, Winsock cleanup)
    ~ChatClient() {
        disconnect();
        WSACleanup();
    }

    // Establish connection to server
    bool connectToServer() {
        clientSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (clientSocket == INVALID_SOCKET) {
            std::cerr << "Socket creation failed.\n";
            return false;
        }

        sockaddr_in serverAddr{};
        serverAddr.sin_family = AF_INET;
        serverAddr.sin_port = htons((u_short)serverPort);
        unsigned long ip = inet_addr(serverIp.c_str());
        if (ip == INADDR_NONE) {
            std::cerr << "Invalid IP address.\n";
            closesocket(clientSocket);
            clientSocket = INVALID_SOCKET;
            return false;
        }
        serverAddr.sin_addr.s_addr = ip;

        if (connect(clientSocket, (sockaddr*)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
            std::cerr << "Failed to connect to server.\n";
            closesocket(clientSocket);
            clientSocket = INVALID_SOCKET;
            return false;
        }

        isRunning = true;
        return true;
    }

    // Send single string line
    bool sendMessage(const std::string& message) {
        if (clientSocket == INVALID_SOCKET) return false;
        std::string payload = message + "\n";
        int sent = send(clientSocket, payload.c_str(), (int)payload.size(), 0);
        return sent != SOCKET_ERROR;
    }

    // Start UI chat loop
    void run() {
        if (!connectToServer()) return;

        // Spawn background listener thread immediately so all server greetings & replies are shown
        recvThreadHandle = CreateThread(NULL, 0, receiverThreadProc, this, 0, NULL);

        // User input loop
        std::string line;
        while (isRunning && std::getline(std::cin, line)) {
            if (line == "/quit") break;
            if (line.empty()) continue;
            if (!sendMessage(line)) {
                std::cerr << "Failed to send message.\n";
                break;
            }
            // Overwrite typed line with clean format
            std::cout << "\033[A\r\033[2K" << "You: " << line << std::endl;
        }

        disconnect();
        std::cout << "\n[INFO] Disconnected from chat room.\n";
    }

    // Disconnect and clean resources
    void disconnect() {
        isRunning = false;
        if (clientSocket != INVALID_SOCKET) {
            shutdown(clientSocket, SD_BOTH);
            closesocket(clientSocket);
            clientSocket = INVALID_SOCKET;
        }
        if (recvThreadHandle != NULL) {
            WaitForSingleObject(recvThreadHandle, 1000);
            CloseHandle(recvThreadHandle);
            recvThreadHandle = NULL;
        }
    }
};

int main(int argc, char* argv[]) {
    std::string ip = "127.0.0.1";
    int port = 8080;

    if (argc >= 2) ip = argv[1];
    if (argc >= 3) port = std::atoi(argv[2]);

    // Create ChatClient object and run chat session
    ChatClient client(ip, port);
    client.run();

    return 0;
}