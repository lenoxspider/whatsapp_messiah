# WhatsApp Messiah 🕊️

> **Personal WhatsApp Second Brain & Autonomous Messiah Ghost-Handler Daemon**  
> Dense, dark `#0B0D0E`, keyboard-driven operations console with forensic intelligence, living memory, and zero-database vector hybrid search.

---

## ⚡ What Can WhatsApp Messiah Do?

WhatsApp Messiah turns your personal WhatsApp account into an autonomous intelligence machine. It operates in two parallel engines:
1. **Second Brain**: Your personal capture vault, task scheduler, semantic search engine, and autonomous tool-calling AI agent.
2. **Messiah Ghost-Handler**: An autonomous persona engine that mimics your texting cadence, remembers personal details about contacts, silently rejects inbound calls, preserves deleted messages/media, and intercepts ephemeral View-Once media.

---

## 📋 Comprehensive Feature Matrix

### 🧠 1. Autonomous Second Brain & AI Agent

| Feature | Capability & Behavior | How to Use |
|---|---|---|
| **Autonomous Tool-Calling Agent** | `!ask` connects directly to your private SQLite database using OpenAI tool calling (function calling). It can inspect contacts, schedule reminders, create notes, search the vault, and query deleted message forensics. | `!ask Remind me Friday at 2pm to call Kofi`<br>`!ask What did I decide about the VPS?`<br>`!ask Set contact +233501234567 to Tier 1 VIP`<br>`!ask What deleted messages do we have from John?` |
| **Hybrid Semantic + Keyword Search** | Combines SQLite FTS5 (BM25) with vector embeddings (`text-embedding-3-small`, 1536-dim Float32Array BLOBs) using **Reciprocal Rank Fusion (RRF)**. Finds notes by concept even with 0 overlapping keywords. | `!find that thing about the server`<br>(finds *"Hetzner baremetal in Frankfurt"*) |
| **Whisper Voice Note Transcription** | Record or forward any voice memo to yourself in self-chat. Messiah passes the audio to OpenAI `whisper-1`, captures the text into your vault under `#voice`, and replies with the transcript. | Send any voice note to your self-chat |
| **Passive Inbox & URL Capture** | Forward any thought, link, or message to yourself. Messiah automatically tags URLs as `#link` and thoughts as `#inbox`. | Send or forward any message in self-chat |
| **Natural Language Task Reminders** | Schedule delayed notifications. Background cron triggers alerts at the exact time. | `!remind in 45m Submit invoice`<br>`!remind tomorrow at 9am Review pull request` |
| **Daily Capture Digest** | Receive a snapshot of recent captures and pending reminders. | `!digest` |
| **Prompt-Injection Hardening** | Strictly JID-whitelisted: **only your own account (`fromMe = true`) can invoke agent tools**. Inbound messages are treated as passive untrusted data inside `<untrusted_content>` tags. | Automated security guard |

---

### 🛡️ 2. Messiah Ghost-Handler & Forensic Intelligence

| Feature | Capability & Behavior | Technical Detail |
|---|---|---|
| **Anti-ViewOnce Interception** | Intercepts ephemeral View-Once photos, voice notes, and videos. Decrypts and saves them permanently to `data/media/` before they vanish, and forwards them instantly to Discord. | Baileys companion handshake emulates `Platform.ANDROID` with multi-wrapper protobuf unwrapping. |
| **Anti-Revoke 2.0 (Message Preservation)** | Intercepts `ProtocolMessage.REVOKE` ("Delete for everyone"). Preserves original text, photos, audio notes, and video payloads in SQLite with exact revocation timing. | Evidence inspectable via Web Console with dark audio/video players and JSON/CSV export. |
| **Stealth Call Rejecter** | Silently and automatically rejects all inbound voice and video WhatsApp calls (`sock.rejectCall`). No ring, no voicemail, zero interruption. | Calls logged to SQLite with caller JID and timestamp; instant alert sent to Discord. |
| **Status Stealer ("Ghost Capture")** | Reply to any contact's WhatsApp status with `!😶🌫️` (or custom trigger). Messiah downloads the original high-resolution photo/video or text, archives it to your vault, forwards it to Discord, and immediately revokes your reply so the contact never sees it. | Full media decryption via `contextInfo.quotedMessage` with instant `delete for everyone` stealth revocation. |
| **Per-Contact Living Memory** | Inbound messages from contacts trigger an asynchronous background AI extractor that captures durable personal facts (family, jobs, locations, preferences, commitments) into `contact_facts`. | Living memory is automatically injected into the Messiah Ghost persona generator. |
| **Voice Fingerprinting & Style Mimicry** | Samples your sent messages (`from_me = 1`) to extract your natural casing quirks, slang, sentence length, and emoji frequency. Replies sound like *you*, not a bot. | Auto-generated style guide injected into ghost replies; cached for 6 hours. |
| **Humanized Presence & Timing Simulation** | Emulates realistic human latency: a **2.5s–8s reflection delay** before picking up the phone, plus dynamic typing speed with natural **800ms mid-typing pauses** on long replies. | WhatsApp `composing` and `paused` presence simulation with randomized jitter. |
| **Selective Deafness (Blue Tick Control)** | Selectively sends read receipts (`readMessages`) only to approved tiers. Ignored contacts and unknown callers remain permanently unread. | Configured via contact tiers. |
| **Emergency Discord Escalations** | Detects urgent keywords ("emergency", "hospital", "urgent", "call me now") or high-priority messages and pings your Discord webhook, holding autonomous replies for manual review. | Discord rich embed with actionable links. |

---

### 👥 3. 5-Tier Contact Relationship Board

Contacts are categorized into 5 tiers that dictate autonomous reply behavior:

* **🟢 Tier 1 (Inner Circle / VIP):** Close friends and family. Receives warm, authentic replies matching your tone; leverages personal notes from your vault; blue ticks enabled.
* **🔵 Tier 2 (Acquaintance):** Friendly and casual, but non-committal. Automatically deflects meetup requests ("super busy with projects, will hit you up later").
* **🟣 Tier 3 (Business / Work):** Courteous and brief. Confirms receipt and notes that you are away from your desk and will review properly.
* **🟡 Tier 4 (Stranger / Unknown):** Guarded and minimal ("Hey, who is this?").
* **🔴 Tier 5 (Ghost / Mute):** Complete silence. Zero automated replies and permanent grey ticks.

---

### 🌐 4. Operations Control Plane (Web Dashboard)

Password-gated control plane running at `http://localhost:3000` (and on your VPS public IP):

* **⚡ Operations Console (`/`):** Real-time WhatsApp socket state, uptime counter, live message audit log with tier badges, danger controls (restart daemon, purge unlinked media, clear sessions).
* **📇 Contacts Directory & Dossier Inspector (`/contacts.html`):**
  * **Directory:** Searchable by name, phone, or JID with tier filter chips (`All`, `T1`–`T5`), living memory counters (`🧠 N`), and revocation badges (`🛡️ N`).
  * **Dossier Inspector:** 1-click tier reclassification, living memory facts manager (add/delete facts), custom persona prompt override, and recent 25-message conversation history preview.
  * **Tier Board:** 5-column drag-and-drop Kanban board with keyboard shortcuts (`1`–`5`).
  * **Revoked Inbox:** Dual-pane forensic evidence inspector with dark image viewer, `<audio>` player for voice notes, and `<video>` player.
* **🧠 Second Brain Vault (`/vault.html`):** Interactive search across notes, quick note creator, and scheduled task queue.
* **🥷 Covert Ops & Extras (`/extras.html`):** Status Stealer ("Ghost Capture") control deck, trigger customizer (with presets like `!😶🌫️`, `!yoink`, `!steal`), Stealth Auto-Delete switch, Discord webhook tester, and full intercepted status media gallery.
* **⚙️ System Config & Telemetry (`/config.html`):**
  * **AI Spend & Token Telemetry:** Real-time today's spend, total token usage, invocations count, and live SQLite audit table.
  * **Live Persona Tuning Studio:** Test sample incoming messages against your persona prompt in real time.
  * **Autonomous Switches:** Toggle Autonomous Ghost Mode, Presence Simulation, Stealth Call Rejecter, and Discord Media Forwarding with live visual status badges.

---

## 🚀 Quick Start & Installation

### Local Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/lenoxspider/whatsapp_messiah.git
   cd whatsapp_messiah
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your desired configuration:
   ```env
   DASHBOARD_PASSWORD=your_secure_master_password
   PHONE_NUMBER=233501234567
   OWNER_JID=233501234567@s.whatsapp.net
   PAIRING_METHOD=code
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   AUTO_REJECT_CALLS=1
   FORWARD_MEDIA_TO_DISCORD=1
   ```

4. **Build & Run:**
   ```bash
   npm run build
   npm start
   ```

5. **Link WhatsApp:**
   * Terminal will display an **8-digit pairing code** (e.g. `ABCD-1234`).
   * On your phone: WhatsApp -> **Settings** -> **Linked Devices** -> **Link with phone number instead** -> Enter the code.
   * Open `http://localhost:3000` to access the Operations Console.

---

### ☁️ Production VPS Automated Setup (Ubuntu / Debian)

A zero-touch bash installer is provided for headless Linux servers:

```bash
chmod +x scripts/setup.sh scripts/update.sh
./scripts/setup.sh
```

**What `scripts/setup.sh` does:**
1. Prompts for your desired Web Dashboard master password and securely sets `chmod 600 .env`.
2. Installs Node.js 24 LTS and PM2 process manager if missing.
3. Compiles TypeScript and starts the daemon under PM2 with automatic system reboot persistence (`pm2 startup`).

**Zero-downtime updates:**
```bash
./scripts/update.sh
```

---

## 🛠️ WhatsApp In-Chat Commands (Second Brain)

Send these commands to yourself in your WhatsApp self-chat:

| Command | Usage | Description |
|---|---|---|
| `!ask` | `!ask <instruction or question>` | Autonomous tool-calling AI agent over your SQLite database. |
| `!note` | `!note [#tag] <content>` | Captures a note directly into your vault. |
| `!find` | `!find <query>` | Hybrid semantic + keyword search over your notes vault. |
| `!remind` | `!remind <time> <task>` | Schedules natural-language time-delayed task notifications. |
| `!digest` | `!digest` | Summarizes recent captures and active pending reminders. |
| `!help` | `!help` | Displays available Second Brain commands and capture tips. |
| `!😶🌫️` | Reply to any contact status | Covertly captures status media/text to Discord & vault with auto-revocation (customizable in `/extras.html`). |

---

## 🔒 Security & Privacy Directives

* **Data Ownership:** All messages, notes, call logs, and embeddings are stored in a local SQLite database (`data/messiah.db`) in WAL mode. No external database or cloud vector service required.
* **Password Gated:** All Web Operations Console endpoints (`/api/*` and dashboard pages) are protected by session cookies and bcrypt password hashing.
* **Prompt-Injection Hardening:** Autonomous tool execution is locked strictly to your own authenticated phone number. External contacts can never trigger tools or database operations.
* **Secret Masking:** Sensitive API keys (`OPENAI_API_KEY`, `DISCORD_WEBHOOK_URL`, `DASHBOARD_PASSWORD`) are write-only and never exposed in cleartext over the API.

---

## 📜 License
ISC License &middot; Created by [lenoxspider](https://github.com/lenoxspider)
