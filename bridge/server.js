// WebSocket to TCP Bridge Server with Built-in HTTP Static File Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const net = require('net');

const WS_PORT = process.env.PORT || process.env.WS_PORT || 3001;
const TCP_HOST = process.env.TCP_HOST || '127.0.0.1';
const TCP_PORT = process.env.TCP_PORT || 8080;

const distPath = path.join(__dirname, '..', 'dashboard', 'dist');

// Create HTTP server that serves built React dashboard (production bundle)
const httpServer = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const filePath = path.join(distPath, reqPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
    } else {
        // SPA Fallback to index.html
        const indexHtml = path.join(distPath, 'index.html');
        if (fs.existsSync(indexHtml)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(indexHtml).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Dashboard build not found. Run npm run build in dashboard/');
        }
    }
});

// Attach WebSocket server to the same HTTP server
const wss = new WebSocket.Server({ server: httpServer });

httpServer.listen(WS_PORT, '0.0.0.0', () => {
    console.log(`[Bridge] HTTP & WebSocket server listening on port ${WS_PORT}`);
    console.log(`[Bridge] Production Web App available at http://localhost:${WS_PORT}`);
    console.log(`[Bridge] Will connect to TCP server at ${TCP_HOST}:${TCP_PORT}`);
});

wss.on('connection', (ws) => {
    console.log('[Bridge] New WebSocket connection');
    
    let tcpClient = null;
    let tcpBuffer = '';
    
    // Connect to TCP server
    try {
        tcpClient = net.createConnection({ host: TCP_HOST, port: TCP_PORT }, () => {
            console.log('[Bridge] Connected to TCP server');
        });
        
        tcpClient.on('data', (data) => {
            // Handle newline-delimited messages from TCP server
            tcpBuffer += data.toString();
            
            let lines = tcpBuffer.split('\n');
            tcpBuffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                
                try {
                    let message;
                    if (line.startsWith('{')) {
                        message = JSON.parse(line);
                    } else {
                        message = {
                            type: 'message',
                            text: line,
                            timestamp: Math.floor(Date.now() / 1000)
                        };
                    }
                    
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify(message));
                    }
                } catch (err) {
                    console.error('[Bridge] Error parsing TCP message:', err.message);
                }
            }
        });
        
        tcpClient.on('error', (err) => {
            console.error('[Bridge] TCP error:', err.message);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'TCP connection error: ' + err.message
                }));
            }
        });
        
        tcpClient.on('close', () => {
            console.log('[Bridge] TCP connection closed');
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });
        
    } catch (err) {
        console.error('[Bridge] Failed to connect to TCP server:', err.message);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to connect to chat server'
        }));
        ws.close();
        return;
    }
    
    // Handle WebSocket messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            // Forward JSON message to TCP server as newline-delimited JSON
            if (tcpClient && !tcpClient.destroyed) {
                const jsonLine = JSON.stringify(data) + '\n';
                tcpClient.write(jsonLine);
                
                if (data.type === 'auth') {
                    console.log(`[Bridge] Auth request for user: ${data.username}`);
                }
            }
        } catch (err) {
            console.error('[Bridge] Error handling WebSocket message:', err.message);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('[Bridge] WebSocket connection closed');
        if (tcpClient && !tcpClient.destroyed) {
            tcpClient.end();
        }
    });
    
    ws.on('error', (err) => {
        console.error('[Bridge] WebSocket error:', err.message);
    });
});

wss.on('error', (err) => {
    console.error('[Bridge] WebSocket server error:', err);
});

console.log('[Bridge] Server ready');
