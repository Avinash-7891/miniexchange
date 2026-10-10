import React, { useState, useEffect, useCallback } from 'react';
import {
  getSymbols,
  getOrderBook,
  getMyOrders,
  getRecentTrades,
  getCandles
} from '../api';
import { wsClient } from '../ws';
import OrderBookWidget from './OrderBookWidget';
import OrderForm from './OrderForm';
import MyOrdersWidget from './MyOrdersWidget';
import RecentTradesWidget from './RecentTradesWidget';
import SimpleChart from './SimpleChart';

export default function TradingPage({ user }) {
  const [symbols, setSymbols] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('RELI');
  const [book, setBook] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [recentTrades, setRecentTrades] = useState([]);
  const [candles, setCandles] = useState([]);
  const [interval, setInterval] = useState('1m');
  const [copiedPrice, setCopiedPrice] = useState(null);

  // Load available symbols on mount
  useEffect(() => {
    getSymbols()
      .then((res) => {
        if (res.symbols && res.symbols.length > 0) {
          setSymbols(res.symbols);
          setSelectedSymbol(res.symbols[0].symbol);
        }
      })
      .catch((err) => console.error('Failed to load symbols:', err));
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedSymbol) return;

    try {
      const [bookRes, tradesRes, candlesRes] = await Promise.all([
        getOrderBook(selectedSymbol).catch(() => null),
        getRecentTrades(selectedSymbol).catch(() => ({ trades: [] })),
        getCandles(selectedSymbol, interval).catch(() => ({ candles: [] }))
      ]);

      if (bookRes) setBook(bookRes);
      if (tradesRes) setRecentTrades(tradesRes.trades || []);
      if (candlesRes) setCandles(candlesRes.candles || []);

      if (user) {
        const ordersRes = await getMyOrders(selectedSymbol).catch(() => ({ orders: [] }));
        setMyOrders(ordersRes.orders || []);
      }
    } catch (err) {
      console.error('Error fetching trading data:', err);
    }
  }, [selectedSymbol, interval, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to WebSocket updates for selected symbol
  useEffect(() => {
    if (!selectedSymbol) return;

    wsClient.subscribe(selectedSymbol);

    const unsubBook = wsClient.on('orderbook_update', (msg) => {
      if (msg.symbol === selectedSymbol) {
        setBook(msg.data);
      }
    });

    const unsubTrade = wsClient.on('trade_update', (msg) => {
      if (msg.symbol === selectedSymbol) {
        setRecentTrades((prev) => [msg.data, ...prev]);
        // Also refresh chart candles
        getCandles(selectedSymbol, interval).then((res) => setCandles(res.candles || []));
      }
    });

    const unsubUserOrder = wsClient.on('user_order_update', (msg) => {
      setMyOrders((prev) => {
        const updated = msg.data;
        const exists = prev.some((o) => o.orderId === updated.orderId);
        if (exists) {
          return prev.map((o) => (o.orderId === updated.orderId ? updated : o));
        }
        return [updated, ...prev];
      });
    });

    return () => {
      unsubBook();
      unsubTrade();
      unsubUserOrder();
      wsClient.unsubscribe(selectedSymbol);
    };
  }, [selectedSymbol, interval]);

  return (
    <div>
      {/* Symbol Selector Bar */}
      <div
        className="panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 15px',
          marginBottom: '15px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <label style={{ margin: 0, fontWeight: 'bold' }}>SYMBOL:</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {symbols.map((s) => (
              <button
                key={s.symbol}
                className={`btn btn-sm ${selectedSymbol === s.symbol ? 'btn-primary' : ''}`}
                onClick={() => setSelectedSymbol(s.symbol)}
              >
                {s.symbol}
              </button>
            ))}
          </div>
        </div>

        {book && (
          <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
            <span>
              Best Bid: <strong>₹{book.bestBid ? (book.bestBid / 100).toFixed(2) : '-'}</strong>
            </span>
            <span>
              Best Ask: <strong>₹{book.bestAsk ? (book.bestAsk / 100).toFixed(2) : '-'}</strong>
            </span>
            <span>
              Spread: <strong>₹{book.spread !== null ? (book.spread / 100).toFixed(2) : '-'}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Main 3-Column Trading Layout */}
      <div className="trading-layout">
        {/* Left: Order Book Depth */}
        <div>
          <OrderBookWidget book={book} onSelectPrice={(p) => setCopiedPrice(p)} />
        </div>

        {/* Center: Candlestick Chart & User's Orders */}
        <div>
          <SimpleChart
            candles={candles}
            symbol={selectedSymbol}
            interval={interval}
            onIntervalChange={(newInt) => setInterval(newInt)}
          />
          {user && (
            <MyOrdersWidget orders={myOrders} onOrderCancelled={loadData} />
          )}
        </div>

        {/* Right: Place Order Form & Live Trade Tape */}
        <div>
          {user ? (
            <OrderForm
              symbol={selectedSymbol}
              selectedPrice={copiedPrice}
              onOrderPlaced={loadData}
            />
          ) : (
            <div className="panel">
              <div className="panel-header">Place Order</div>
              <div className="empty-state">
                Please log in to place orders and participate in trading.
              </div>
            </div>
          )}
          <RecentTradesWidget trades={recentTrades} symbol={selectedSymbol} />
        </div>
      </div>
    </div>
  );
}
