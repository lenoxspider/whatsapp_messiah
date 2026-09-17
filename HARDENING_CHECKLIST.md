# 🛡️ WhatsApp Messiah — System Hardening & Reliability Checklist

> **Goal**: Transition from feature expansion to zero-defect reliability, security lockdown, and local test verification.
> **Testing Strategy**: All items will be implemented, tested, and verified locally on this machine step-by-step.

---

## 🚨 IMMEDIATE CRITICAL PRIORITIES (Fix First)

### 1. 🔒 Control Plane & Web Dashboard Lockdown
- [x] **Bind Host Restricted**: Express server binds strictly to `127.0.0.1` (local loopback) by default — preventing external `0.0.0.0` exposure.
- [x] **Authentication Middleware**: Enforced session / auth middleware protection across all administrative routes (`/api/pair`, `/api/extras`, `/api/config`).
- [x] **Log Stream Sanitize & Gate**: Redacts authentication tokens, bearer headers, and raw base64 payload streams from the API log output.
- [x] **Audit Logging**: Structured audit logging (`systemLogger.audit`) records timestamp, IP address, and administrative action for pairing, resets, and reconnects.

### 2. 🕵️ Status Stealer Redesign (Command-Driven Stealth Capture-On-Receipt)
- [x] **Eliminate Trigger-and-Delete**: Removed the outward reply trigger (`_nice` / `!😶🌫️`) and post-delete step entirely to eliminate detection footprint (100% stealth).
- [x] **Capture-On-Receipt Pipeline**: Intercepts `status@broadcast` JID inbound events directly to store text, photos, and videos automatically on arrival for targeted contacts.
- [x] **Target Management Commands & API**: Managed dynamically via Self-Chat (`!steal add/remove/list`) and REST API endpoints (`/api/extras/targets`).
- [x] **Search Index Isolation**: Status items are isolated in `captured_statuses` and excluded from Second Brain RAG search context by default.

### 3. ⏰ Scheduler State Machine & Crash Recovery
- [x] **Atomic Claim State Machine**: Upgraded `reminders` DB schema to use explicit status states: `pending` ➔ `claimed` ➔ `sent` (or `failed`).
- [x] **Atomic Claim Query**: Implemented `UPDATE reminders SET status='claimed', claimed_at=? WHERE id=? AND status='pending'` before triggering socket send.
- [x] **Startup Catch-Up Recovery**: On daemon boot, automatically re-queues any `claimed` row older than 3 minutes (handles mid-send process crashes).
- [x] **UTC Timestamp Normalization**: Stores all timestamps in UTC and renders localized time strings strictly at send time.

---

## 📋 FEATURE-BY-FEATURE HARDENING TIER

### Tier 1: Core Connectivity & Error Classification
- [x] **Disconnect Reason Classification**:
  - `401 / loggedOut`: Terminal state ➔ Halts auto-reconnect and dispatches Discord health alert (prevents account ban loop).
  - `440 / connectionReplaced`: Reconnects max 1 time ➔ Halts if collision persists.
  - `428 / 515 / temporary`: Exponential backoff with random +/-20% jitter & circuit breaker (max 10 attempts).
- [x] **Atomic Credential Writes**: Wrapped `saveCreds` with atomic temp write (`creds.tmp`), `fsync`, and atomic rename to `creds.json`.
- [x] **Rolling Credential Snapshots**: Takes timestamped session snapshots in `data/sessions_backups/` upon successful connection (keeps last 5 snapshots).
- [x] **Socket Heartbeat Monitor**: Checks WebSocket `readyState` every 60s and triggers clean reconnection if socket drops silently.

### Tier 2: Anti-ViewOnce Optimization
- [x] **Message ID Idempotency**: Single deduplication key on message ID across both resend request and Type 17 decode paths to prevent duplicate alerts.
- [x] **Decode Failure Quarantine**: If protobuf decoding throws, dump raw base64 payload to `data/quarantine/` for future offline decoding.
- [x] **Eager Local Download**: Download media buffer immediately upon decode and store locally before dispatching alerts.

### Tier 3: Anti-Revoke & Anti-Edit Protection
- [x] **Unconditional Store-On-Arrival**: Save inbound messages and media immediately before any protocol processing; ensure `handleRevoke` only updates existing rows.
- [x] **Eager Media Download for Priority Tiers**: Automatically pre-download media from Tier 1–2 contacts immediately upon arrival.
- [x] **Append-Only Edit History**: Track message edits as an append-only chain with timestamps to handle out-of-order deliveries.

### Tier 4: Ghost Handler (Autonomous AI Safety)
- [x] **Fail-Closed Engine**: On OpenAI rate limits, timeouts, or errors, log and send NOTHING (never output canned error fallback messages).
- [x] **Send-Layer Group Block**: Enforce a strict `CanSend` choke point at the core socket layer preventing any autonomous bot reply to `@g.us` group JIDs.
- [x] **Hard API Timeout**: 12-second timeout per AI completion request; abort if newer incoming message arrives.
- [x] **Per-Contact Rate Limiting**: Limit autonomous replies to a maximum of N messages per hour per contact.
- [x] **Prompt Injection Isolation**: Wrap inbound message content in strict delimiters in system prompt and grant Ghost zero tool-execution rights.

### Tier 5: Second Brain & RAG Retrieval Quality
- [ ] **Cosine Vector Embeddings**: Integrate `text-embedding-3-small` vector BLOB storage in SQLite alongside FTS5 search for semantic note retrieval.
- [ ] **Strict Context Prompting**: Instruct RAG system prompt to explicitly state "I don't have information on that" when retrieval distance is low.
- [ ] **Pre-Flight Whisper Checks**: Verify audio format and file size (<25MB) prior to API invocation.

### Tier 6: Backup & Transport Security
- [ ] **Encrypted Backups**: Encrypt backup archives (using password/AES) before sending over chat or saving.
- [ ] **Backup Retention Policy**: Enforce automated backup rotation (keep last N daily, M weekly backups).
- [ ] **Restore Verification Drill**: Document and test local database restore procedure.

---

## ✂️ FEATURES TO CUT / SIMPLIFY

- [ ] **Remove Outward Status Trigger**: Delete trigger word parsing and status delete commands.
- [ ] **Streamline Telemetry Duplication**: Clean up redundant forwarding routes where Discord and WhatsApp duplicate unnecessary logs.
- [ ] **Deprecate Unused Commands**: Evaluate low-value commands (e.g. `!dormant`) for removal to minimize code surface area.

---

## 📊 SYSTEM OBSERVABILITY & HEALTH METRICS

- [ ] **Health Status Endpoint**: Expose `/api/health` providing live metrics:
  - Socket state & uptime.
  - Timestamp of last received message.
  - Reminder queue breakdown (`pending`, `claimed`, `sent`, `failed`).
  - Disk space & SQLite DB byte size.
  - OpenAI API error rates.
- [ ] **Discord Health Alerting**: Dispatch webhook alerts on socket state changes or system failures.
