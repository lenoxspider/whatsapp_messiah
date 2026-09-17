#!/usr/bin/env bash
# ==============================================================================
# WhatsApp Messiah - Zero-Downtime VPS Update Script
# Pulls latest code, builds dist, and reloads PM2 without data loss
# ==============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}"
echo "=============================================================="
echo "          🔄 UPDATING WHATSAPP MESSIAH ON VPS                 "
echo "=============================================================="
echo -e "${NC}"

echo -e "${CYAN}[1/4] Pulling latest changes from git...${NC}"
git pull origin main

echo -e "${CYAN}[2/4] Updating npm dependencies...${NC}"
npm install

echo -e "${CYAN}[3/4] Compiling TypeScript...${NC}"
npm run build

echo -e "${CYAN}[4/4] Reloading PM2 process...${NC}"
if command -v pm2 &> /dev/null; then
  pm2 reload messiah || pm2 restart messiah || pm2 reload whatsapp-messiah || pm2 restart whatsapp-messiah
else
  echo -e "${YELLOW}PM2 not found. Please restart your daemon manually.${NC}"
fi

echo ""
echo -e "${GREEN}=============================================================="
echo "          ✅ WHATSAPP MESSIAH UPDATED SUCCESSFULLY!           "
echo "=============================================================="
echo -e "${NC}"
echo "Check live logs with: pm2 logs messiah (or pm2 logs whatsapp-messiah)"
