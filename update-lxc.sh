#!/bin/bash
set -e

# ==============================================================================
# G-Till Calculator - Quick Update Script for Proxmox LXC
# Run this script whenever you pull new updates from git.
# ==============================================================================

APP_DIR="/opt/g_till_calculator"
CURRENT_DIR="$(pwd)"

echo ">>> Updating Till Closing Calculator..."

# 1. If currently in a git directory, pull latest changes
if [ -d ".git" ]; then
  echo ">>> Pulling latest commits from git..."
  git pull origin main || echo "Git pull warning (continuing with local files)..."
fi

# 2. If running from outside /opt/g_till_calculator, sync files to APP_DIR
if [ "$CURRENT_DIR" != "$APP_DIR" ]; then
  echo ">>> Copying updated files from $CURRENT_DIR to $APP_DIR..."
  mkdir -p "$APP_DIR"
  cp -rf "$CURRENT_DIR"/* "$APP_DIR"/ 2>/dev/null || cp -rf . "$APP_DIR"/
fi

# 3. Ensure permissions for tillapp user
id -u tillapp &>/dev/null || useradd -m -s /bin/bash tillapp
chown -R tillapp:tillapp "$APP_DIR"

# 4. Install production dependencies if needed
cd "$APP_DIR"
if command -v sudo &>/dev/null; then
  sudo -u tillapp npm ci --omit=dev
else
  su -s /bin/bash tillapp -c "npm ci --omit=dev"
fi

# 5. Restart systemd service
systemctl daemon-reload
systemctl restart till-calculator

echo "=========================================================="
echo " Till Calculator updated and restarted successfully!      "
echo " Service Status: $(systemctl is-active till-calculator)   "
echo " Verification: $(curl -s http://127.0.0.1:3000/ | grep -o 'Cash Tips' || echo 'Verify via browser') "
echo "=========================================================="
