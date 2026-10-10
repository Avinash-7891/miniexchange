/**
 * services/wsService.js
 * 
 * WEBSOCKET REAL-TIME BROADCAST SERVICE
 * 
 * Channels:
 * 1. Public Symbol Channel: Top order book depth updates & real-time public trade tape.
 * 2. Private User Channel: Live order state transitions (FILLED, PARTIALLY_FILLED, CANCELLED)
 *    and instant wallet balance refreshes.
 */

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

class WsService {
  constructor() {
    this.wss = null;
    this.clients = new Set(); // Set of active WebSocket connections
  }

  /**
   * Attach WebSocket server to Express HTTP server
   * @param {http.Server} server 
   */
  init(server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      ws.isAlive = true;
      ws.userId = null;
      ws.subscribedSymbols = new Set();

      // Extract optional token from URL query string
      try {
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');
        if (token) {
          const secret = process.env.JWT_SECRET || 'miniexchange-dev-secret-key-12345';
          const decoded = jwt.verify(token, secret);
          ws.userId = decoded.userId;
        }
      } catch (err) {
        // Unauthenticated client (spectator mode)
      }

      this.clients.add(ws);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleClientMessage(ws, msg);
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON payload' }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      // Send initial welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        authenticated: !!ws.userId,
        userId: ws.userId
      }));
    });

    // Heartbeat ping interval to detect disconnected clients
    this.pingInterval = setInterval(() => {
      this.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  _handleClientMessage(ws, msg) {
    if (!msg || !msg.action) return;

    switch (msg.action) {
      case 'auth': {
        if (!msg.token) return;
        try {
          const secret = process.env.JWT_SECRET || 'miniexchange-dev-secret-key-12345';
          const decoded = jwt.verify(msg.token, secret);
          ws.userId = decoded.userId;
          ws.send(JSON.stringify({ type: 'auth_success', userId: ws.userId }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid or expired token' }));
        }
        break;
      }

      case 'subscribe': {
        if (msg.symbol) {
          const sym = msg.symbol.toUpperCase();
          ws.subscribedSymbols.add(sym);
          ws.send(JSON.stringify({ type: 'subscribed', symbol: sym }));
        }
        break;
      }

      case 'unsubscribe': {
        if (msg.symbol) {
          const sym = msg.symbol.toUpperCase();
          ws.subscribedSymbols.delete(sym);
          ws.send(JSON.stringify({ type: 'unsubscribed', symbol: sym }));
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Broadcast order book depth update for a symbol to all interested clients.
   */
  broadcastOrderBook(symbol, depth) {
    const sym = symbol.toUpperCase();
    const payload = JSON.stringify({
      type: 'orderbook_update',
      symbol: sym,
      data: depth
    });

    for (const client of this.clients) {
      if (client.readyState === 1 && (client.subscribedSymbols.has(sym) || client.subscribedSymbols.size === 0)) {
        client.send(payload);
      }
    }
  }

  /**
   * Broadcast new trade execution on a symbol.
   */
  broadcastTrade(symbol, trade) {
    const sym = symbol.toUpperCase();
    const payload = JSON.stringify({
      type: 'trade_update',
      symbol: sym,
      data: {
        tradeId: trade.tradeId,
        price: trade.price,
        quantity: trade.quantity,
        aggressorSide: trade.aggressorSide,
        timestamp: trade.timestamp
      }
    });

    for (const client of this.clients) {
      if (client.readyState === 1 && (client.subscribedSymbols.has(sym) || client.subscribedSymbols.size === 0)) {
        client.send(payload);
      }
    }
  }

  /**
   * Send private order status update to the order's owner.
   */
  sendUserOrderUpdate(userId, order) {
    const uid = String(userId);
    const payload = JSON.stringify({
      type: 'user_order_update',
      data: order
    });

    for (const client of this.clients) {
      if (client.readyState === 1 && client.userId === uid) {
        client.send(payload);
      }
    }
  }

  /**
   * Send private wallet balance refresh to user.
   */
  sendUserWalletUpdate(userId, wallet) {
    const uid = String(userId);
    const payload = JSON.stringify({
      type: 'user_wallet_update',
      data: wallet
    });

    for (const client of this.clients) {
      if (client.readyState === 1 && client.userId === uid) {
        client.send(payload);
      }
    }
  }
}

module.exports = new WsService();
