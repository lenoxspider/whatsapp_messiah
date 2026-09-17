#!/usr/bin/env bash
# ==============================================================================
# WhatsApp Messiah - Production VPS Automated Setup Script
# Installs Node 24, PM2, dependencies, configures password, and launches daemon
# ==============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "=============================================================="
echo "          🕊️  WHATSAPP MESSIAH - VPS SETUP ENGINE             "
echo "=============================================================="
echo -e "${NC}"

# 1. Prompt for Dashboard Master Password
echo -e "${YELLOW}[Security] Secure your Web Dashboard Control Plane:${NC}"
DASH_PASS=""
while [ -z "$DASH_PASS" ]; do
  read -r -s -p "Enter your desired Dashboard Master Password: " DASH_PASS
  echo ""
  if [ -z "$DASH_PASS" ]; then
    echo -e "${RED}Password cannot be empty. Please enter a valid password.${NC}"
  fi
done

read -r -s -p "Confirm Dashboard Master Password: " DASH_PASS_CONFIRM
echo ""
if [ "$DASH_PASS" != "$DASH_PASS_CONFIRM" ]; then
  echo -e "${RED}Passwords do not match. Setup aborted.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Master password set.${NC}\n"

# 2. Check and Install Node.js 24 (if not present)
NODE_VER=$(node -v 2>/dev/null || echo "none")
if [[ "$NODE_VER" != v2* ]]; then
  echo -e "${CYAN}[1/5] Installing Node.js 24 LTS via NodeSource...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs build-essential git
else
  echo -e "${GREEN}✓ Node.js ($NODE_VER) already installed.${NC}"
fi

# 3. Install PM2 process supervisor globally
if ! command -v pm2 &> /dev/null; then
  echo -e "${CYAN}[2/5] Installing PM2 process manager...${NC}"
  sudo npm install -g pm2
else
  echo -e "${GREEN}✓ PM2 is already installed.${NC}"
fi

# 4. Prepare directories and .env file
echo -e "${CYAN}[3/5] Configuring environment and database paths...${NC}"
mkdir -p data/media sessions

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    cat <<EOF > .env
PORT=3000
PAIRING_METHOD=code
PHONE_NUMBER=
DATABASE_PATH=./data/messiah.db
SESSIONS_DIR=./sessions
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
DISCORD_WEBHOOK_URL=
GHOST_HANDLER_ENABLED=1
AUTONOMOUS_GHOST=0
AUTO_REJECT_CALLS=1
FORWARD_MEDIA_TO_DISCORD=1
TYPING_SPEED_MS=45
MAX_TYPING_DELAY_MS=8000
EOF
  fi
fi

# Update DASHBOARD_PASSWORD in .env
if grep -q "^DASHBOARD_PASSWORD=" .env; then
  sed -i "s/^DASHBOARD_PASSWORD=.*$/DASHBOARD_PASSWORD=${DASH_PASS}/" .env
else
  echo "DASHBOARD_PASSWORD=${DASH_PASS}" >> .env
fi

# Lock permissions on .env
chmod 600 .env
echo -e "${GREEN}✓ .env configured and permissions secured (chmod 600).${NC}"

# 5. Install Dependencies and Build TypeScript
echo -e "${CYAN}[4/5] Installing project dependencies and compiling TypeScript...${NC}"
npm install
npm run build

# 6. Start / Register PM2 Service
echo -e "${CYAN}[5/5] Launching Messiah daemon under PM2...${NC}"
pm2 delete whatsapp-messiah 2>/dev/null || true
pm2 start dist/index.js --name "whatsapp-messiah"
pm2 save

PUBLIC_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}=============================================================="
echo "          🎉 WHATSAPP MESSIAH INSTALLED SUCCESSFULLY!          "
echo "=============================================================="
echo -e "${NC}"
echo -e "🌐 Web Dashboard:  ${CYAN}http://${PUBLIC_IP}:3000${NC}"
echo -e "🔐 Master Pass:    ${YELLOW}[Hidden - As entered above]${NC}"
echo -e "📋 PM2 Logs:       ${CYAN}pm2 logs whatsapp-messiah${NC}"
echo -e "🔄 PM2 Restart:    ${CYAN}pm2 restart whatsapp-messiah${NC}"
echo ""
echo "Open the dashboard link in your browser to pair your WhatsApp!"
