/// <reference types="vite/client" />
import { ServerMessage } from './types';

type MessageHandler = (message: ServerMessage) => void;
type StatusHandler = (isConnected: boolean) => void;

const getWsUrl = (): string => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  if (typeof window === 'undefined') {
    return 'ws://localhost:3001';
  }
  // If running in Vite dev server (port 5173), default bridge is 3001
  if (window.location.port === '5173') {
    return `ws://${window.location.hostname || 'localhost'}:3001`;
  }
  // When served by the production bridge server or cloud platform (Render, Railway, etc.)
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const portPart = window.location.port ? `:${window.location.port}` : '';
  return `${proto}//${window.location.hostname}${portPart}`;
};

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private handlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private url: string = getWsUrl();
  private shouldReconnect: boolean = true;
  private reconnectDelay: number = 2000;
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Refresh URL dynamically upon connection attempt
        this.url = getWsUrl();
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          console.log('[WebSocket] Connected to bridge at', this.url);
          this.notifyStatus(true);
          this.startPing();
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          try {
            const message: ServerMessage = JSON.parse(event.data);
            this.handlers.forEach(handler => handler(message));
          } catch (err) {
            console.error('[WebSocket] Failed to parse message:', err);
          }
        };
        
        this.ws.onerror = (error) => {
          console.error('[WebSocket] Connection error:', error);
          reject(error);
        };
        
        this.ws.onclose = () => {
          console.log('[WebSocket] Connection closed');
          this.ws = null;
          this.stopPing();
          this.notifyStatus(false);
          
          if (this.shouldReconnect) {
            if (!this.reconnectTimer) {
              this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.connect().catch(err => {
                  console.error('[WebSocket] Reconnect failed:', err);
                });
              }, this.reconnectDelay);
            }
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }
  
  disconnect() {
    this.shouldReconnect = false;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send - connection is closed');
    }
  }
  
  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  onStatusChange(handler: StatusHandler) {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }

  private notifyStatus(isConnected: boolean) {
    this.statusHandlers.forEach(h => h(isConnected));
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping' });
      }
    }, 25000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
