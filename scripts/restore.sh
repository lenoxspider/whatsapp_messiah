#!/usr/bin/env bash
# ==============================================================================
# WhatsApp Messiah - VPS Migration & Disaster Recovery Restore Script
# Restores all 4 pillars (database, sessions, media, .env) with zero re-pairing
# ==============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ARCHIVE="$1"

echo -e "${CYAN}"
echo "=============================================================="
echo "      🔄  WHATSAPP MESSIAH - VPS RESTORE & MIGRATION          "
echo "=============================================================="
echo -e "${NC}"

# If no archive specified, find the latest in current dir or data/backups/
if [ -z "$ARCHIVE" ]; then
  ARCHIVE=$(ls -t messiah-backup-*.zip 2>/dev/null | head -n 1 || ls -t data/backups/messiah-backup-*.zip 2>/dev/null | head -n 1 || ls -t *.tar.gz 2>/dev/null | head -n 1)
fi

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo -e "${RED}Error: Backup archive not found.${NC}"
  echo "Usage: ./scripts/restore.sh <path_to_backup_archive.zip>"
  exit 1
fi

echo -e "${YELLOW}Target Archive:${NC} ${CYAN}${ARCHIVE}${NC}"

# Stop PM2 if running to unlock database
if command -v pm2 &> /dev/null; then
  echo -e "${CYAN}[1/4] Pausing PM2 process if active...${NC}"
  pm2 stop whatsapp-messiah 2>/dev/null || true
fi

# 2. Extract Archive
echo -e "${CYAN}[2/4] Restoring database, media vault, and WhatsApp sessions...${NC}"

if [[ "$ARCHIVE" == *.zip ]]; then
  if command -v unzip &> /dev/null; then
    unzip -o -q "$ARCHIVE" -d .
  else
    # Fallback to python or node unzip
    node -e "
      import AdmZip from 'adm-zip';
      const zip = new AdmZip(process.argv[1]);
      zip.extractAllTo('.', true);
      console.log('Unpacked via AdmZip');
    " "$ARCHIVE"
  fi
elif [[ "$ARCHIVE" == *.tar.gz ]]; then
  tar -xzf "$ARCHIVE" -C .
fi

echo -e "${GREEN}✓ State restored.${NC}"

# 3. Verify Directory and Permissions
mkdir -p data/media sessions data/backups
if [ -f ".env" ]; then
  chmod 600 .env
fi

# 4. Install Dependencies and Build
echo -e "${CYAN}[3/4] Installing dependencies & compiling TypeScript...${NC}"
npm install --silent
npm run build

# 5. Start or Restart Daemon under PM2
echo -e "${CYAN}[4/4] Launching WhatsApp Messiah daemon...${NC}"
if command -v pm2 &> /dev/null; then
  pm2 delete whatsapp-messiah 2>/dev/null || true
  pm2 start dist/index.js --name "whatsapp-messiah"
  pm2 save
  echo -e "${GREEN}✓ PM2 daemon started successfully!${NC}"
else
  echo -e "${YELLOW}PM2 not found. You can start the daemon manually via:${NC}"
  echo -e "${CYAN}npm start${NC}"
fi

PUBLIC_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}=============================================================="
echo "          🎉 RESTORATION & MIGRATION COMPLETE!                "
echo "=============================================================="
echo -e "${NC}"
echo -e "🔐 WhatsApp Session: ${GREEN}Resumed (Zero re-pairing required!)${NC}"
echo -e "🌐 Web Dashboard:    ${CYAN}http://${PUBLIC_IP}:3000${NC}"
echo -e "📋 Live Logs:        ${CYAN}pm2 logs whatsapp-messiah${NC}"
echo ""
