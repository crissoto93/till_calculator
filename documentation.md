# 💵 Till Closing Calculator — Documentation & Deployment Guide

Welcome to the comprehensive documentation for the **Till Closing Calculator**. This guide explains the app at a medium level (architecture, business logic, workflows, and database) and provides a step-by-step tutorial on deploying it to **Proxmox Virtual Environment (PVE)** and securely accessing it through your **Cloudflare-managed domain**.

---

## Table of Contents
1. [App Overview & Core Concepts](#1-app-overview--core-concepts)
2. [User Experience & Workflows](#2-user-experience--workflows)
   - [Employee Closing Workflow (Write-Only)](#employee-closing-workflow-write-only)
   - [Manager Admin Dashboard (`/admin`)](#manager-admin-dashboard-admin)
3. [Math & Business Logic](#3-math--business-logic)
   - [Integer Cents Precision](#integer-cents-precision)
   - [Bi-Directional Calculation](#bi-directional-calculation)
   - [Strict Denomination Validation](#strict-denomination-validation)
   - [Register Expected vs. Drawer Float (Discrepancy)](#register-expected-vs-drawer-float-discrepancy)
4. [Architecture & Technical Stack](#4-architecture--technical-stack)
   - [Backend & Database](#backend--database)
   - [Frontend & Mobile Optimization](#frontend--mobile-optimization)
5. [Proxmox VE Setup (Step-by-Step)](#5-proxmox-ve-setup-step-by-step)
   - [Step 1: Create a Lightweight Debian 12 LXC Container](#step-1-create-a-lightweight-debian-12-lxc-container)
   - [Step 2: Copy Files into Container](#step-2-copy-files-into-container)
   - [Step 3: Run the 1-Command Installer (`setup-lxc.sh`)](#step-3-run-the-1-command-installer-setup-lxcsh)
   - [Step 4: Verify the Service](#step-4-verify-the-service)
6. [Domain, DDNS & Cloudflare Networking](#6-domain-ddns--cloudflare-networking)
   - [Recommended: Cloudflare Tunnel (No DDNS or Port Forwarding Needed)](#recommended-option-a--cloudflare-tunnel-cloudflared)
   - [Alternative: DDNS (ddns-updater) + Nginx / Port Forwarding](#alternative-option-b--ddns-updater--port-forwarding--reverse-proxy)
   - [Alternative: Private Tailscale Access (No Public Internet)](#alternative-option-c--tailscale-private-vpn)
7. [External Integrations (Google Sheets & Notion)](#7-external-integrations-google-sheets--notion)
8. [Maintenance, Backups & Troubleshooting](#8-maintenance-backups--troubleshooting)

---

## 1. App Overview & Core Concepts

The **Till Closing Calculator** is a lightweight, mobile-first web application designed for retail stores, restaurants, and small businesses. It replaces pen-and-paper cash balancing sheets when closing out cash drawers at the end of a shift or business day.

### Key Goals:
- **Phone Usability**: Staff can pull out their phone (iOS or Android) and enter counts directly while standing at the till.
- **Error Elimination**: Instant bi-directional calculation prevents counting mistakes, and strict denomination multiple validation stops employees from entering impossible numbers (like typing $30 in a $20 bill slot).
- **Clear Bank Action**: Automatically determines the exact amount to take out for bank deposit while ensuring the specified float (default $200.00) remains in the drawer for the next shift.
- **Append-Only Integrity**: Employees cannot view, browse, or tamper with previous closing records.
- **Manager Auditability**: Managers can view historical closings, filter by employee, download CSV reports, or stream entries live to Google Sheets or Notion.
- **Ultra-Lightweight Footprint**: Runs in an LXC container using only **~25–35 MB of RAM**.

---

## 2. User Experience & Workflows

### Employee Closing Workflow (Write-Only)
1. **Open the App**: The employee loads `http://<your-domain>/` on their smartphone browser.
2. **Enter Name**: Types their name or initials (e.g., `Sarah K.`).
3. **Count the Till**:
   - For each denomination ($100 down to $0.01), staff can either type the **Quantity** or the **Dollar Total**.
   - The app auto-syncs both columns in real time.
4. **Review Totals**:
   - **Total Cash Counted**: Live sum of all bills and coins.
   - **Cash Stays in Drawer**: Defaults to `$200.00` (can be changed if a different float is kept).
   - **Cash to Deposit**: The app calculates `Total Cash Counted - Cash Stays in Drawer` and highlights it in green: *"This is what should be cashed out from the register and prepared for the bank deposit."*
   - **Register Expected**: The employee enters the expected ending drawer cash from the POS/register report.
   - **Discrepancy**: Instantly shows if the drawer is `Balanced ($0.00)`, `+Over`, or `-Short`.
5. **Submit Closing**:
   - Tap **"Save & Submit Till Closing"**.
   - The system records the entry into SQLite and dispatches the webhook (if configured).
   - A clean **Receipt Modal** appears confirming the timestamp, deposit amount, float, and discrepancy.
   - Tapping **"Start New Till Closing"** resets the form for the next shift. Staff cannot see any historical entries.

### Manager Admin Dashboard (`/admin`)
Accessing `/admin` opens the management portal:
- **PIN Authentication**: Protected by a manager PIN (default: `1234`, customizable).
- **Shift Audit Log**: A comprehensive table showing date/time, employee, total cash, drawer float, bank deposit, expected cash, and discrepancy.
- **Denomination Breakdown**: Clicking **"Details"** on any row opens the exact bill-by-bill and coin-by-coin count submitted during that shift.
- **Search & Filter**: Quickly filter entries by employee name.
- **One-Click CSV Export**: Downloads a complete spreadsheet (`till_closings_YYYY-MM-DD.csv`) compatible with Microsoft Excel, Apple Numbers, and Google Sheets.
- **Live Webhook Settings**: Configure a Google Apps Script or Notion webhook URL and test the connection with a single click.

---

## 3. Math & Business Logic

### Integer Cents Precision
Standard JavaScript floating-point numbers often produce rounding glitches (e.g. `0.1 + 0.2 = 0.30000000000000004`). In this app, **all calculations are converted to integer cents internally**:
- `$100.00` &rarr; `10,000` cents
- `$20.00` &rarr; `2,000` cents
- `$0.25` &rarr; `25` cents
- `$0.01` &rarr; `1` cent

This guarantees 100% mathematical accuracy without rounding drift.

### Bi-Directional Calculation
- If the user enters **Quantity** $Q$:
  $$\text{Amount} = \frac{Q \times \text{Denomination Cents}}{100}$$
- If the user enters **Amount** $A$:
  $$\text{Quantity} = \frac{\text{Amount Cents}}{\text{Denomination Cents}}$$

### Strict Denomination Validation
When entering an amount in Column 3, the value must be an exact multiple of that denomination:
$$\text{Remainder} = \text{Amount Cents} \pmod{\text{Denomination Cents}}$$
- If $\text{Remainder} \neq 0$: The row turns red, displays a warning badge (`⚠️ Must be an exact multiple of $X.XX`), and the **Save** button is disabled until the mistake is corrected.

### Register Expected vs. Drawer Float (Discrepancy)
The discrepancy formula compares the cash retained in the till against what the POS register expected to remain in the drawer after the deposit was pulled:
$$\text{Discrepancy} = \text{Cash Stays in Drawer} - \text{Register Expected}$$

#### Scenarios:
| Cash Stays in Drawer | Register Expected | Discrepancy Calculation | Result Badge |
| :--- | :--- | :--- | :--- |
| `$200.00` | `$200.15` | `$200.00 - $200.15 = -$0.15` | **`▼ -$0.15 SHORT`** |
| `$200.00` | `$200.00` | `$200.00 - $200.00 = $0.00` | **`✓ Balanced ($0.00)`** |
| `$200.00` | `$199.50` | `$200.00 - $199.50 = +$0.50` | **`▲ +$0.50 OVER`** |

---

## 4. Architecture & Technical Stack

```
   ┌─────────────────────────────────────────────────────────┐
   │                     Client Browser                      │
   │  (Mobile Safari / Chrome PWA / Desktop Browser)         │
   └───────────────▲─────────────────────────┬───────────────┘
                   │ Static Assets (HTML/CSS)│ JSON API Requests
                   │                         ▼
   ┌───────────────┴─────────────────────────────────────────┐
   │                  Node.js Express Server                 │
   │             (Port 3000, ~30 MB RAM Usage)               │
   ├────────────────────────────┬────────────────────────────┤
   │  Public Endpoints:         │  Admin Endpoints (PIN):    │
   │  - GET /api/config         │  - POST /api/admin/login   │
   │  - POST /api/closings      │  - GET /api/admin/closings │
   │    (Append-only)           │  - GET /api/admin/export   │
   │                            │  - POST /api/admin/settings│
   └───────────────┬────────────┴────────────┬───────────────┘
                   │                         │
                   ▼                         ▼
   ┌────────────────────────────┐   ┌────────────────────────┐
   │       SQLite Database      │   │ External Webhooks      │
   │      `data/till.db`        │   │ (Google Sheets/Notion) │
   │    (WAL Mode, Fast & Safe) │   │ (Async, Non-blocking)  │
   └────────────────────────────┘   └────────────────────────┘
```

- **Runtime**: Node.js (v22+ LTS).
- **Backend Framework**: Express 5.
- **Database**: SQLite with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) for high concurrency and crash durability.
- **Frontend**: Pure semantic HTML5, modern CSS3 (no heavy framework bloat), and vanilla JavaScript.
- **Security**:
  - Public route `/api/closings` is strictly append-only (no GET/PUT/DELETE).
  - Admin endpoints require authorization token generated via PIN authentication.
  - Rate-limited and sanitized server-side re-validation of all calculations.

---

## 5. Proxmox VE Setup (Step-by-Step)

Follow these steps to deploy the application inside an LXC container on your Proxmox VE node.

### Step 1: Create a Lightweight Debian 12 LXC Container
1. Log in to your **Proxmox VE Web Interface** (`https://<pve-ip>:8006`).
2. Click **Create CT** (top right).
3. **General**:
   - **CT ID**: e.g., `110`
   - **Hostname**: `till-calculator`
   - **Password**: Set a root password.
   - **Unprivileged container**: Checked (recommended for security).
4. **Template**: Select `debian-12-standard` (or `ubuntu-24.04-standard`).
5. **Disks**: Set `4 GB` or `8 GB` disk size (local-lvm).
6. **CPU**: `1` vCPU (plenty for this app).
7. **Memory**: `512 MB` RAM and `512 MB` Swap (it typically uses less than 35 MB).
8. **Network**:
   - **Bridge**: `vmbr0`
   - **IPv4**: Static IP (e.g. `192.168.1.50/24`) or DHCP with gateway set to your router.
9. Click **Finish** and start the container.

---

### Step 2: Copy Files into Container
You can push the files directly from your workstation into the container using `pct`:

```bash
# On your Proxmox host or via SSH (replace 110 with your CT ID):
pct push 110 /path/to/g_till_calculator /root/g_till_calculator -r
```

*Alternatively*, open the container console (`pct enter 110`) and clone your Git repository:
```bash
pct enter 110
apt-get update && apt-get install -y git
git clone <your-repo-url> /root/g_till_calculator
```

---

### Step 3: Run the 1-Command Installer (`setup-lxc.sh`)
Inside the container terminal:

```bash
cd /root/g_till_calculator
chmod +x setup-lxc.sh
./setup-lxc.sh
```

**What this script does automatically:**
1. Installs Node.js 22 LTS and npm.
2. Creates an isolated system user `tillapp`.
3. Copies code to `/opt/g_till_calculator` with correct permissions.
4. Installs production dependencies (`npm ci --omit=dev`).
5. Generates a systemd service file at `/etc/systemd/system/till-calculator.service`.
6. Enables and starts the service automatically on container boot.

---

### Step 4: Verify the Service
Check that the service is running:
```bash
systemctl status till-calculator
```

You will see:
```
● till-calculator.service - Till Closing Calculator Service
     Loaded: loaded (/etc/systemd/system/till-calculator.service; enabled)
     Active: active (running)
```

Test access locally:
```bash
curl http://127.0.0.1:3000/api/config
```
It will return the JSON denomination list.

---

## 6. Domain, DDNS & Cloudflare Networking

You mentioned setting up a DDNS service like `ddns-updater` with a domain managed by Cloudflare. 

### Why **Cloudflare Tunnel (`cloudflared`)** is Better than DDNS:
| Feature | Traditional DDNS + Port Forwarding | Cloudflare Tunnel (`cloudflared`) ⭐ |
| :--- | :--- | :--- |
| **Router Ports** | Must open & forward ports 80/443 | **0 open ports** (completely stealth) |
| **Public IP Exposure**| Exposes home/store IP to the internet | Hidden behind Cloudflare Anycast edge |
| **CGNAT / 5G / Fiber**| Fails if ISP uses CGNAT | **Works seamlessly** anywhere |
| **SSL / HTTPS** | Must manage Certbot / Let's Encrypt | **Automatic HTTPS certificates** |
| **DDNS Client** | Requires running `ddns-updater` | **Not needed** (tunnel maintains route) |
| **Cost** | Free | **100% Free** |

---

### Recommended: Option A — Cloudflare Tunnel (`cloudflared`)

Setting up a Cloudflare Tunnel takes **3 minutes**:

1. **Log in to Cloudflare Zero Trust**:
   - Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com/).
   - In the left sidebar, navigate to **Networks** > **Tunnels**.
   - Click **Create a tunnel**.
2. **Select Cloudflare Tunnel**:
   - Choose **Cloudflared**.
   - Name your tunnel: e.g., `proxmox-till`.
3. **Install the Connector inside your LXC container**:
   - Cloudflare will provide a copy-paste command for **Debian 64-bit**, for example:
     ```bash
     curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && \
     dpkg -i cloudflared.deb && \
     cloudflared service install <YOUR_TUNNEL_TOKEN>
     ```
   - Paste and run this command inside your `till-calculator` LXC container.
4. **Route your Domain Name**:
   - In the Cloudflare Tunnel dashboard, click **Next** to configure the **Public Hostname**.
   - **Subdomain**: e.g., `till` (or `register`)
   - **Domain**: Select your domain (e.g. `yourdomain.com`).
   - **Service Type**: `HTTP`
   - **URL**: `localhost:3000`
   - Click **Save tunnel**.

**Done!** Your app is now live at `https://till.yourdomain.com` with free, automatic SSL, DDoS protection, and zero open ports on your firewall.

> [!TIP]
> **Optional Security Layer:** In the Cloudflare Zero Trust dashboard under **Access > Applications**, you can add an Access Policy requiring employees or managers to authenticate with a one-time PIN sent to your email before loading `/admin`!

---

### Alternative: Option B — DDNS (`ddns-updater`) + Port Forwarding + Reverse Proxy

If you specifically want to run direct DDNS updates to Cloudflare:

1. **Deploy `ddns-updater` in Proxmox**:
   - Run `ddns-updater` as a container (Docker or LXC).
   - In `config.json`, configure Cloudflare provider with your API Token, Zone ID, and record name (e.g. `till.yourdomain.com`).
2. **Set up a Reverse Proxy (Nginx Proxy Manager or Caddy)**:
   - Run Nginx Proxy Manager in an LXC container.
   - Forward incoming domain traffic `till.yourdomain.com` &rarr; `http://<TILL_LXC_IP>:3000`.
   - Issue a Let's Encrypt certificate with DNS or HTTP challenge.
3. **Port Forwarding**:
   - On your router, forward WAN port `443` &rarr; Reverse Proxy IP port `443`.
   - On your router, forward WAN port `80` &rarr; Reverse Proxy IP port `80`.
4. **Cloudflare DNS**:
   - Set the DNS record for `till` to **Proxied (Orange Cloud)** to mask your real IP and enable Cloudflare WAF.

---

### Alternative: Option C — Tailscale (Private VPN, Zero Exposure)

If you only want store devices (or employee phones connected to store Wi-Fi) to access the calculator with **zero exposure to the public internet**:
1. Install Tailscale in the LXC container:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   tailscale up
   ```
2. Your container gets a private Tailscale IP (e.g. `100.x.y.z`) and MagicDNS name (e.g. `http://till-calculator.your-tailnet.ts.net:3000`).
3. Only authorized devices in your Tailnet can load the app.

---

## 7. External Integrations (Google Sheets & Notion)

The application includes an asynchronous webhook engine that can push every drawer closing directly into Google Sheets or Notion without adding delay to the employee's submission.

### Google Sheets Real-Time Sync
1. Open [Google Sheets](https://sheets.new) and create a new sheet.
2. Go to **Extensions** > **Apps Script**.
3. Copy and paste the script provided in [`docs/GOOGLE_SHEETS_GUIDE.md`](file:///home/cris/Work/g_till_calculator/docs/GOOGLE_SHEETS_GUIDE.md).
4. Click **Deploy** > **New deployment** > **Web app** (Access: *Anyone*).
5. Open your Till Calculator `/admin` dashboard > click **Webhook & Google Sheets**.
6. Paste the Web App URL and click **Save** & **Test**.

Every shift closing will now immediately populate a new row with timestamp, staff name, float, deposit, discrepancy, and full denomination counts.

---

## 8. Maintenance, Backups & Troubleshooting

### Data Persistence & Backups
All closing records and settings are stored in SQLite at:
```
/opt/g_till_calculator/data/till.db
```
Because Proxmox VE natively supports scheduled container backups:
- In Proxmox, navigate to **Datacenter** > **Backup** > **Add**.
- Select the `till-calculator` LXC container.
- Schedule nightly backups to your PBS (Proxmox Backup Server), NAS, or external storage. Restores take under 10 seconds.

### Useful Systemd Commands
```bash
# Check service status
systemctl status till-calculator

# Restart application
systemctl restart till-calculator

# View live application logs
journalctl -u till-calculator -f

# Check active port binding
ss -tlpn | grep 3000
```

### Changing Settings via Environment Variables
To change the default port, admin PIN, or database path, edit `/etc/systemd/system/till-calculator.service`:
```ini
Environment=PORT=3000
Environment=ADMIN_PIN=5678
Environment=DB_PATH=/opt/g_till_calculator/data/till.db
```
Apply updates:
```bash
systemctl daemon-reload
systemctl restart till-calculator
```

### Resetting the Admin PIN
If the Manager PIN is forgotten, you can override it directly using environment variables or by removing the custom PIN in SQLite:
```bash
sqlite3 /opt/g_till_calculator/data/till.db "DELETE FROM settings WHERE key = 'admin_pin';"
```
The PIN will immediately revert to the default (`1234` or whatever is set in `ADMIN_PIN`).
