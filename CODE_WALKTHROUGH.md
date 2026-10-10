# MiniExchange Code Walkthrough (Hinglish Guide)

Hello! Agar aap ek beginner ho backend/MERN development mein lekin aapko Data Structures, Algorithms aur Competitive Programming ka knowledge hai, toh yeh guide specifically aapke liye banayi gayi hai.

Is document mein hum MiniExchange project ke har important file aur function ko step-by-step simple Hinglish mein samjhenge. Hum dekhenge ki kaunsa Data Structure kyu use kiya gaya hai, uski Time & Space Complexity kya hai, aur agar hum koi simple structure (jaise simple array) use karte toh system fail kyu ho jata.

---

## 1. Reading Order (Aapko Kis Order Mein Files Padhni Chahiye)

Jab aap codebase ko padhna shuru karo, toh isi order mein files open karke padho:

1. `src/engine/types.js` (Core Constants & Enums)
2. `src/engine/DoublyLinkedList.js` (FIFO Time Priority Queue)
3. `src/engine/Heap.js` (MaxHeap & MinHeap for Price Priority)
4. `src/engine/PriceLevel.js` (Aggregated Price Container)
5. `src/engine/OrderBook.js` (The Heart: Matching Loop & Rules)
6. `src/engine/ReferenceEngine.js` (Brute-force testing partner)
7. `src/services/walletService.js` (Double-entry balance locks & rebates)
8. `src/services/engineManager.js` (Multi-symbol & DB crash recovery)
9. `src/models/` (MongoDB collections: User, Order, Trade, Symbol)
10. `src/routes/` (REST API: Trading, Wallet, Admin)
11. `scripts/stressTest.js` & `scripts/benchmarkEngine.js` (Testing & Performance)

---

## 2. Deep Dive: Matching Engine Core (The Algorithmic Heart)

### File 1: `src/engine/types.js`
- **Kyu hai yeh?**
  Yeh file saare static constants store karti hai:
  - `Side`: `BUY`, `SELL`
  - `OrderType`: `LIMIT` (apne price pe lena), `MARKET` (turant best price pe lena)
  - `OrderStatus`: `OPEN`, `PARTIALLY_FILLED`, `FILLED`, `CANCELLED`, `REJECTED`
- **Important Rule:**
  System mein kabhi bhi floats (jaise `99.50`) use nahi hote. Money hamesha integer **Paise** mein hoti hai (e.g., `9950`). Quantity hamesha integer unit count hoti hai.

---

### File 2: `src/engine/DoublyLinkedList.js`
- **Problem kya thi?**
  Ek stock exchange mein jab do buyers same price (jaise ₹100) par order lagate hain, toh rule bolta hai: **jo pehle aaya usko pehle stock milega (FIFO - First In, First Out)**.
- **Agar hum simple JavaScript Array `[]` use karte toh kya hota?**
  - Jab oldest order fill hota, humein `array.shift()` karna padta. `shift()` array ke saare remaining elements ko memory mein ek-ek step left shift karta hai, jo **$O(N)$** hota hai.
  - Jab koi user apna beech ka order cancel karta, humein `array.splice()` karna padta, jo again **$O(N)$** hota hai.
  - Agar 50,000 orders resting hain, toh har fill aur cancel slow ho jata!
- **Doubly Linked List ka solution:**
  - `append(order)`: Naye order ko list ke tail pe lagata hai -> **$O(1)$**.
  - `popFront()`: Sabse purane order ko head se nikalta hai -> **$O(1)$**.
  - `removeNode(node)`: Agar humare paas node ka direct pointer hai, toh hum `node.prev.next = node.next` karke us order ko list se turant delete kar dete hain -> **$O(1)$**.
  - Saath hi hum `totalVolume` track karte hain, taaki price level ka total volume $O(1)$ mein mil jaye.

---

### File 3: `src/engine/Heap.js`
- **Problem kya thi?**
  Matching engine ko har trade match karne ke liye sabse best price dhoondhna hota hai:
  - **Buyer ke liye best price:** Sabse sasta seller (Lowest Ask).
  - **Seller ke liye best price:** Sabse mehenga buyer (Highest Bid).
- **Agar hum simple Sorted Array use karte toh kya hota?**
  - Agar naya price level insert karna ho, toh array mein binary search se jagah dhoondh ke elements shift karne padte -> **$O(p)$**, jahan $p$ distinct prices hain.
- **Binary Heap ka solution:**
  - `MaxHeap` (Bids ke liye): Root node par hamesha highest buy price hota hai.
  - `MinHeap` (Asks ke liye): Root node par hamesha lowest sell price hota hai.
  - `peek()`: Best price dekhna -> **$O(1)$**.
  - `push()`: Naya price level insert karna -> **$O(\log p)$**.
  - `remove(price)`: Jab koi price level empty ho jaye (saare orders fill ya cancel ho jayein), toh heap mein tracked `indices` map se usko **$O(\log p)$** mein clean kar dete hain.

---

### File 4: `src/engine/PriceLevel.js`
- **Kyu hai yeh?**
  Yeh class ek specific price point ko represent karti hai.
  Example: Price `₹100.00` (10000 paise).
  Iske andar hota hai:
  - `price`: integer paise.
  - `orders`: ek `DoublyLinkedList` jismein us ₹100 par resting saare orders line mein lage hain.
  - Properties: `totalVolume` (is price par total kitne shares available hain), `orderCount` (kitne orders hain).

---

### File 5: `src/engine/OrderBook.js` (The Main Engine)
Yeh pure project ki sabse main class hai. Har symbol (jaise RELI) ka apna ek alag `OrderBook` instance hota hai.

#### Iske Main Components:
1. `bids`: `MaxHeap` (Bids ke price levels).
2. `bidLevels`: `Map<price, PriceLevel>` (Fast $O(1)$ access agar level pehle se exist karta hai).
3. `asks`: `MinHeap` (Asks ke price levels).
4. `askLevels`: `Map<price, PriceLevel>`.
5. `orders`: `Map<orderId, { node, level, side, order }>` ($O(1)$ lookup aur cancellation ke liye).

#### Order Processing Flow (`processOrderSync`):
Jab ek naya order aata hai:
1. **Validation:** Check karo quantity > 0 integer hai, limit price tick size (5 paise) ka multiple hai.
2. **Matching Loop:**
   - Agar incoming **BUY** hai, toh opposite side (`asks`) ke sabse best level ko check karo.
   - Agar incoming LIMIT hai aur `bestAsk.price > incoming.price`, toh match nahi ho sakta -> Loop break.
   - Agar price match hota hai:
     - Check **Self-Trade Prevention**: Agar resting order usi user ka hai jisne incoming order bheja hai, toh match mat karo! Matching turant STOP karo aur incoming order ki remaining quantity **CANCEL** kar do.
     - `tradeQty = min(incoming.remainingQty, restingOrder.remainingQty)`.
     - **Trade Price Rule:** Trade hamesha **RESTING ORDER** ke price par execute hota hai (incoming order ko price improvement milta hai!).
     - Dono orders ki quantities update karo.
     - Agar resting order pura fill ho gaya, usko linked list aur map se delete kar do.
     - Agar price level empty ho gaya, usko heap aur map se remove kar do.
3. **Loop ke baad:**
   - Agar incoming order pura fill ho gaya -> Status = `FILLED`.
   - Agar MARKET order tha aur liquidity khatam ho gayi -> Remaining quantity turant **CANCEL** ho jaati hai (MARKET order book mein kabhi rest nahi karta).
   - Agar LIMIT order tha aur remaining quantity bachi -> Usko book ke apne side (bids/asks) mein rest karne ke liye insert kar do -> Status = `PARTIALLY_FILLED` ya `OPEN`.
4. **Invariant Check (`assertInvariants()`):**
   Har ek order ke turant baad yeh verify hota hai ki:
   - Book kabhi "crossed" nahi honi chahiye: `bestBid < bestAsk`.
   - Map aur heap mein koi ghost ya empty levels nahi bache hone chahiye.

---

### File 6: `src/engine/ReferenceEngine.js`
- **Kyu banaya gaya?**
  Competitive programming aur systems engineering mein complex data structures (Heaps + DLL + HashMaps) mein chhote edge-case bugs ho sakte hain.
- **ReferenceEngine kya karta hai?**
  Yeh ek super-simple, naive implementation hai jo sirf plain arrays (`bids = []`, `asks = []`) aur standard `.sort()` use karta hai. Isme koi clever trick nahi hai, isliye yeh obviously correct hai.
- **Differential Testing:**
  Random test script same random order sequence dono engines ko deta hai. Agar ek single paise ya unit ka bhi difference aata hai, test instantly fail ho jata hai.

---

## 3. Backend & Business Logic Walkthrough

### File 7: `src/services/walletService.js` (Money Ledger)
Financial systems mein sabse bada rule hota hai: **Paisa na hawa mein create ho sakta hai, na gayab ho sakta hai.**

1. **Pre-trade Locking (`lockForOrder`):**
   - Jab koi user BUY LIMIT order lagata hai:
     System calculate karta hai: `cost = price * quantity`.
     MongoDB mein atomic conditional update hota hai:
     ```js
     { _id: userId, 'cash.available': { $gte: cost } }
     => $inc: { 'cash.available': -cost, 'cash.locked': cost }
     ```
     Agar user ke paas paise kam hain, toh query match nahi hoti aur order reject ho jata hai. Paisa negative kabhi nahi jaa sakta!
   - Jab koi SELL order lagata hai, shares lock hote hain:
     `holdings[symbol].available -> holdings[symbol].locked`.

2. **Trade Settlement (`settleTrade`):**
   - Buyer ke `cash.locked` se paise katte hain aur Seller ke `cash.available` mein chale jaate hain.
   - Seller ke `holdings.locked` se shares nikalte hain aur Buyer ke `holdings.available` mein add ho jaate hain.
   - **Price Improvement Refund:**
     Agar buyer ne ₹105 limit lagayi thi, lekin trade ₹95 par hua, toh ₹10 per unit extra locked cash turant buyer ke `cash.available` mein refund ho jata hai!

3. **Cancellation (`releaseLocked`):**
   - Agar order cancel ho gaya, toh bache huye locked paise/shares wapas available balance mein move ho jaate hain.

---

### File 8: `src/services/engineManager.js`
Yeh file Node.js backend aur in-memory matching engine ke beech ka bridge hai:
1. **Multi-Symbol Management:**
   Yeh har symbol (`RELI`, `TCS`, `INFY`) ke liye ek alag `OrderBook` instance maintain karti hai.
2. **Serial Execution Queue:**
   Ek hi symbol ke liye simultaneous requests ek sequential promise queue ke through jaati hain, taaki do orders ek doosre ke beech interleave na ho sakein.
3. **Crash Recovery (Restart Resilience):**
   Jab server restart hota hai, MongoDB se saare `OPEN` aur `PARTIALLY_FILLED` orders load hote hain aur in-memory book mein sequence order mein wapas insert ho jaate hain. Isliye restart ke baad book kabhi khali nahi hoti!

---

### File 9: `src/services/wsService.js` (WebSockets)
Live updates ke liye:
- **Public Channel:** Jab bhi book depth update hoti hai ya naya trade hota hai, saare connected browsers ko snapshot milta hai.
- **Private Channel:** Jab kisi user ka apna order fill hota hai ya wallet balance change hota hai, sirf us user ke WebSocket connection par private update bheja jata hai.

---

## 4. Testing & Benchmarking Scripts

### `scripts/stressTest.js`
- **Mulberry32 PRNG:** Deterministic random generator jo ek seed se repeatable random orders banata hai.
- Dono engines (`OrderBook` vs `ReferenceEngine`) ko 1,50,000 orders diye jaate hain.
- Har order ke baad trades, prices, volumes aur final book compare hoti hai.

### `scripts/benchmarkEngine.js`
- Engine-only micro-benchmark.
- 1,00,000 orders ko memory mein pre-generate karta hai.
- `process.hrtime.bigint()` se nanosecond precision latency measure karta hai.
- 5 baar run karke median calculate karta hai:
  **Result: 2,53,081 orders/second at 2.7 µs p50 latency!**

### `scripts/concurrencyTest.js`
- Real REST API (`POST /api/orders`) par ek saath `Promise.all` se 100 simultaneous requests bhejta hai.
- Uske baad audit karta hai:
  - Koi bhi balance negative toh nahi hua? (0 violations)
  - System ka total cash pehle aur baad mein exact same hai? (100% match)
  - Book uncrossed hai? (100% verified)

---

## 5. UI Overview (`client/`)

UI ko intentionally simple, clean aur non-flashy rakha gaya hai:
- **Trading Page:** Symbol selector, live order book tables (Green Bids, Red Asks, Spread), plain order form, user open orders table, trade tape, aur simple candlestick chart.
- **Portfolio Page:** Available vs Locked cash aur stock holdings breakdown.
- **My Trades Page:** Last 30 trades ki table (counterparty identity strictly hidden).
- **Admin Panel:** Metrics (users, trades, volume), Emergency Market Pause button, User Freeze/Unfreeze, Fake fund granting, aur system order cancel button.

---

## 6. Conclusion
Yeh project ek standard web app se bohot aage hai — yeh computational finance ke core data structures (Binary Heaps, Doubly Linked Lists, HashMaps) aur distributed system safety patterns (atomic locks, double-entry conservation, differential fuzz testing) ka ek real-world implementation hai.
Aap is code ko line-by-line padhiye aur interview ya resume mein confidently explain kijiye!
