#!/bin/bash
set -e

# ==============================================================================
# G-Till Calculator - Proxmox VE LXC Automated Deployment Script
# Runs natively inside Debian 12 / Ubuntu 22.04+ LXC Container
# Memory footprint: ~30MB RAM
# ==============================================================================

echo ">>> Setting up Till Calculator inside Proxmox LXC container..."

# 1. Update packages
apt-get update -y
apt-get install -y curl git ca-certificates

# 2. Install Node.js 22 (LTS) if not already installed
if ! command -v node &> /dev/null; then
  echo ">>> Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"
echo "NPM version: $(npm -v)"

# 3. Create dedicated application user
id -u tillapp &>/dev/null || useradd -m -s /bin/bash tillapp

APP_DIR="/opt/g_till_calculator"
mkdir -p "$APP_DIR"

# 4. Copy or sync application files
cp -r . "$APP_DIR/"
chown -R tillapp:tillapp "$APP_DIR"

# 5. Install production npm dependencies
cd "$APP_DIR"
sudo -u tillapp npm ci --omit=dev

# 6. Create systemd service
SERVICE_FILE="/etc/systemd/system/till-calculator.service"

cat << 'EOF' > "$SERVICE_FILE"
[Unit]
Description=Till Closing Calculator Service
After=network.target

[Service]
Type=simple
User=tillapp
WorkingDirectory=/opt/g_till_calculator
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=ADMIN_PIN=1234
Environment=DB_PATH=/opt/g_till_calculator/data/till.db

# Security sandboxing
ProtectSystem=full
ProtectHome=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

# 7. Enable and start service
systemctl daemon-reload
systemctl enable till-calculator
systemctl restart till-calculator

echo "=================================================================="
echo " Till Calculator has been successfully installed and started!    "
echo " Service status: $(systemctl is-active till-calculator)          "
echo " Access locally on port 3000: http://<LXC_CONTAINER_IP>:3000     "
echo " Admin Dashboard: http://<LXC_CONTAINER_IP>:3000/admin           "
echo " Default Admin PIN: 1234                                         "
echo "=================================================================="
