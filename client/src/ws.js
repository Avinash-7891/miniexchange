/**
 * client/src/ws.js
 * 
 * WEBSOCKET CLIENT MANAGER
 */

import { getToken } from './api';

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map(); // event -> Set(callbacks)
    this.reconnectTimeout = null;
    this.subscribedSymbols = new Set();
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = getToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws${token ? `?token=${token}` : ''}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // Re-subscribe to any previously tracked symbols
      for (const sym of this.subscribedSymbols) {
        this.subscribe(sym);
      }
      this._emit('connected', true);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type) {
          this._emit(msg.type, msg);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    this.ws.onclose = () => {
      this._emit('connected', false);
      // Auto-reconnect after 3 seconds
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws.close();
    };
  }

  subscribe(symbol) {
    const sym = symbol.toUpperCase();
    this.subscribedSymbols.add(sym);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'subscribe', symbol: sym }));
    }
  }

  unsubscribe(symbol) {
    const sym = symbol.toUpperCase();
    this.subscribedSymbols.delete(sym);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'unsubscribe', symbol: sym }));
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  _emit(event, data) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        cb(data);
      }
    }
  }
}

export const wsClient = new WebSocketClient();
