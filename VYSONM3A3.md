# VYSONM3A3

## Q1-Q3: Polling & Long Polling
Implemented in `index.js`.
- `GET /status/:userId`: Short polling. Checks DB status.
- `GET /poll/:userId`: Long polling. Waits for task completion using `pendingResponses` map.
- Timeout: Implemented 10s timeout in `/poll`. Client should retry on timeout.

## Q4: Short Polling vs Long Polling
**Short Polling:**
- **Pros:** Simple to implement, standard HTTP request/response, no long-held connections.
- **Cons:** High latency (up to polling interval), wasted server resources (checking repeatedly when no change), high network traffic.

**Long Polling:**
- **Pros:** Low latency (instant update upon completion), less network traffic than frequent short polling.
- **Cons:** Server must hold connections open (memory/thread usage), requires timeout/retry logic, potential for "thundering herd" if many clients reconnect at once.

## Q5: WebSockets
Implemented in `index.js` using `ws` library.
- Clients connect to `ws://localhost:3000`.
- `POST /score` updates leaderboard and broadcasts to all connected clients.

## Q6: ws:// vs wss://
- **ws://**: Unencrypted WebSocket connection (similar to HTTP). Data is sent in plain text.
- **wss://**: Encrypted WebSocket connection (similar to HTTPS). Data is encrypted using TLS/SSL. Required for secure applications and when the main site is HTTPS.

## Q7: WebSocket Authentication & Authorization
Since standard WebSocket API in browsers doesn't support custom headers (like Authorization), common strategies include:
1.  **Query Parameter:** Pass token in URL: `ws://api.com?token=xyz`.
2.  **Cookie:** Use HTTP cookies (sent automatically if same domain).
3.  **Handshake:** Establish connection, then client sends an "auth" message as the first packet.

Server validates the token on the `connection` event or the first message. If invalid, the socket is closed.

## Q8: Webhooks
Implemented in `index.js`.
- `sendAnalyticsWebhook` function triggers when `image_uploaded` event occurs.
- Sends POST request to configured URL.
- Test uses a mock endpoint `/mock-analytics`.

## Q9 (Bonus): Socket.IO vs Native WebSockets
**Native WebSockets (`ws`):**
- Standard protocol (RFC 6455).
- Lightweight, low-level.
- You must handle reconnection, broadcasting, and fallbacks manually.

**Socket.IO:**
- Higher-level library built on top of WebSockets.
- **Features:** Automatic reconnection, fallbacks (HTTP long-polling) if WS is blocked, Rooms/Namespaces, Acknowledgements, Packet buffering.
- **Cons:** Slightly heavier, custom protocol (client/server must match).

## Q10 (Bonus): Server-Sent Events (SSE)
Implemented in `index.js` at `/events`.
- One-way (Server -> Client).
- Uses standard HTTP with `Content-Type: text/event-stream`.
- Simpler than WebSockets for "feed" type features (leaderboards, logs).
