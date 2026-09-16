# WhatsApp Messiah 🕊️

A personal WhatsApp daemon combining a **Second Brain** (message-to-self capture, full-text search, time-based reminders, and OpenAI queries) with a **Messiah Ghost-Handler** (contact-tiered replies, presence simulation with realistic typing latency, selective deafness, anti-revoke message preservation, and Discord emergency escalations).

---

## Features

### 1. Second Brain (Control Plane)
* **Message Yourself as Inbox**: Forward any message, link, or note to your own number; Messiah automatically indexes and tags it.
* **Full-Text Search (`!find <query>`)**: Instant SQLite FTS5 search across your notes and message archive.
* **Natural Language Reminders (`!remind in 30m <task>`)**: Time-delayed notifications dispatched directly into your chat.
* **OpenAI Brain (`!ask <question>`)**: Context-aware answering using your saved memories and notes.
* **Digest (`!digest`)**: A snapshot of your recent captures and pending reminders.

### 2. Messiah Ghost-Handler
* **Presence & Typing Simulation**: Generates human typing intervals based on character length and random jitter before sending replies.
* **Selective Deafness (Zero Blue Ticks)**: Read receipts (`readMessages`) are selectively sent only to approved contact tiers. Unknown callers and ignored contacts remain permanently unread.
* **Anti-Revoke / Silent Archiving**: Intercepts `ProtocolMessage.REVOKE` ("Delete for everyone"). The original message text and timestamp are preserved in SQLite, and an alert is sent to Discord.
* **Contact Tiers (1 to 5)**:
  * Tier 1 (Inner circle): Authentic persona mirroring your tone.
  * Tier 2 (Acquaintances): Casual deflection ("super busy with work, will hit you up").
  * Tier 3 (Business): Courteous holding response.
  * Tier 4 (Strangers): Neutral/minimal.
  * Tier 5 (Ignore): Complete silence + zero blue ticks.
### 3. Web Control Dashboard (Multi-Page Control Plane)
* **Live Pairing Hub (`http://localhost:3000/`)**: View real-time WhatsApp QR code or generate and display the 8-digit pairing code directly in your browser.
* **Credentials & AI Config (`/config.html`)**: Update OpenAI API keys, test models, test Discord webhooks, and adjust typing speeds with immediate persistence.
* **Second Brain Vault (`/vault.html`)**: Interactive FTS5 search across all your saved notes, quick-add note form, and scheduled reminders tracker.
* **Ghost Sentinel & Anti-Revoke (`/contacts.html`)**: Set relationship tiers (1–5) per contact, write custom AI personas, and review the Anti-Revoke audit log of intercepted messages.

---

## Setup & Configuration

### 1. Environment Configuration
Copy `.env.example` to `.env` and fill in your details:

```env
# Pairing method: 'code' (for headless VPS) or 'qr' (terminal QR)
PAIRING_METHOD=code

# Phone number in international format without '+' or spaces (e.g. 15551234567)
PHONE_NUMBER=15551234567

# Your WhatsApp JID (phone_number@s.whatsapp.net)
OWNER_JID=15551234567@s.whatsapp.net

# OpenAI API Key for second brain and persona generation
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Discord Webhook URL for escalations and anti-revoke alerts
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### 2. Running the Bot

* **Development mode**:
  ```bash
  npm run dev
  ```
* **Production build & run**:
  ```bash
  npm run build
  npm start
  ```

### 3. Pairing with WhatsApp
* When `PAIRING_METHOD=code`, the terminal will display an **8-digit code** (e.g. `ABCD-1234`).
* On your phone:
  1. Open WhatsApp -> **Settings** -> **Linked Devices**.
  2. Tap **Link a Device**.
  3. Tap **Link with phone number instead**.
  4. Enter the 8-digit code shown in the terminal.
* Once linked, the session is saved in `./sessions` and survives server reboots.
