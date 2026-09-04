# Proxmox VE LXC Container Deployment Guide

The Till Closing Calculator is designed to be lightweight, resource-efficient, and reliable. Inside a Proxmox LXC container, it consumes only **~25–35 MB of RAM** and requires no heavy runtime.

---

## Container Sizing Recommendation in Proxmox
- **Template**: Debian 12 (Bookworm) or Ubuntu 22.04 / 24.04 Standard
- **Cores**: 1 vCPU
- **Memory**: 512 MB RAM (or even 256 MB)
- **Swap**: 512 MB
- **Disk**: 4 GB – 8 GB
- **Network**: DHCP or Static IP (bridged to `vmbr0`)

---

## Deployment Option A: Native systemd Service (Recommended)

This method requires **no Docker daemon** overhead and starts instantly.

### 1. Create your LXC container in Proxmox
From the Proxmox Web GUI, create a container with Debian 12 or Ubuntu.

### 2. Copy application files into the container
On your Proxmox host or workstation:
```bash
# Clone or copy the folder into the LXC container (replace 105 with your CT ID)
pct push 105 /path/to/g_till_calculator /root/g_till_calculator -r
```
Or simply clone it via Git inside the container:
```bash
pct enter 105
git clone <your-repo-url> /root/g_till_calculator
```

### 3. Run the setup script
Inside the container terminal:
```bash
cd /root/g_till_calculator
chmod +x setup-lxc.sh
./setup-lxc.sh
```

The script will automatically:
1. Install Node.js 22 LTS (if needed).
2. Create an isolated system user `tillapp`.
3. Install production dependencies.
4. Install and enable a systemd service (`till-calculator.service`).
5. Start the application on port `3000`.

### 4. Manage the service
```bash
systemctl status till-calculator
systemctl restart till-calculator
journalctl -u till-calculator -f
```

---

## Deployment Option B: Docker inside LXC Container

If you prefer running Docker containers:

1. In Proxmox, make sure the LXC container has **"Nesting: Yes"** and **"keyctl: Yes"** enabled in Options > Features.
2. Inside the container, install Docker and Docker Compose:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. Copy this project folder into the container and start:
   ```bash
   cd /path/to/g_till_calculator
   docker compose up -d --build
   ```
4. Persistent database is saved in the `till_data` Docker volume.

---

## Network & Phone Access

### Local WiFi Access
Find your container's IP address:
```bash
ip addr show eth0
```
Employees on the same store WiFi can open the app on their phone browser:
```
http://<CONTAINER_IP>:3000
```

### Add to Phone Home Screen (PWA / Web Shortcut)
- **iOS Safari**: Tap the **Share** button > Tap **Add to Home Screen**.
- **Android Chrome**: Tap the **⋮** menu > Tap **Add to Home screen** / **Install app**.

This turns the calculator into a full-screen, app-like experience for store employees!

---

## Environment Variables Configuration

You can customize runtime behavior in `/etc/systemd/system/till-calculator.service` or in a `.env` file:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port |
| `ADMIN_PIN` | `1234` | PIN to unlock manager admin dashboard |
| `DB_PATH` | `/opt/g_till_calculator/data/till.db` | SQLite database file location |
| `WEBHOOK_URL` | *(empty)* | Optional webhook endpoint (Google Sheets, Notion, etc.) |

To apply changes:
```bash
systemctl daemon-reload
systemctl restart till-calculator
```
