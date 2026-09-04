# 💵 Till Closing Calculator

A lightweight, mobile-optimized web application designed for retail and store staff to quickly balance cash drawers at shift close. It features bi-directional denomination reactivity, strict validation, automatic bank deposit calculations, append-only security, CSV export, and instant Google Sheets sync.

Designed for self-hosting on **Proxmox VE LXC containers** with a tiny memory footprint (~30 MB RAM).

---

## ✨ Features

- **📱 Mobile-First Phone UI**:
  - Clean, touch-friendly 3-column layout: **Denomination**, **Quantity**, **Total ($)**.
  - Formatted for all 10 standard currency denominations:
    - **Bills**: `$100`, `$50`, `$20`, `$10`, `$5`, `$1`
    - **Coins**: `$0.25` (Quarters), `$0.10` (Dimes), `$0.05` (Nickels), `$0.01` (Pennies)
  - Numeric keyboard triggering on mobile (`inputmode="numeric"` / `inputmode="decimal"`).
- **⚡ Bi-Directional Auto-Populate**:
  - Enter **Quantity** &rarr; **Total ($)** auto-calculates (e.g. 5 of $100 &rarr; $500).
  - Enter **Total ($)** &rarr; **Quantity** auto-calculates (e.g. $100 of $20 &rarr; 5).
- **🛡️ Strict Denomination Multiple Validation**:
  - Prevents impossible amounts (e.g., entering $30 in the $20 bill row).
  - Displays inline warning badge and disables the Save button until corrected.
- **💰 Smart Drawer Math**:
  - **Total Cash Counted**: Live sum of all bills and coins.
  - **Cash Stays in Drawer (Float)**: Editable, defaults to **$200.00**.
  - **Cash to Deposit**: Automatically calculated (`Total Cash Counted - Drawer Float`) with clear action callout for the employee.
  - **Register Expected**: Input for expected ending drawer cash after deposit.
  - **Discrepancy (Over/Short)**: Real-time comparison between **Cash Stays in Drawer** and **Register Expected** (e.g., if drawer float is $200.00 and register expected is $200.15, shows `-$0.15 SHORT`).
- **🔒 Append-Only Privacy & Security**:
  - Employees only see the entry calculator and a submission confirmation receipt.
  - Employees **cannot** view, browse, or edit prior closings.
- **📊 Manager Admin Dashboard (`/admin`)**:
  - Protected by Manager PIN (default: `1234`).
  - Total closings count, total bank deposits, and total cash stats.
  - Complete history log with searchable employee filter and expandable denomination breakdowns.
  - **📥 One-Click CSV Export**: Downloads complete RFC-4180 CSV spreadsheet.
  - **🔗 Google Sheets Webhook**: Real-time push to Google Sheets or Notion via Google Apps Script.

---

## 🚀 Quick Start (Local Run)

### 1. Install dependencies
```bash
npm install
```

### 2. Run the tests
```bash
npm test
```

### 3. Start the application
```bash
npm start
```

Access in your browser:
- **Employee App**: [http://localhost:3000](http://localhost:3000)
- **Manager Admin**: [http://localhost:3000/admin](http://localhost:3000/admin) *(Default PIN: `1234`)*

---

## 📦 Proxmox VE LXC Deployment

The application runs natively inside any Debian or Ubuntu LXC container using systemd, consuming only ~30 MB of RAM:

```bash
# Inside your LXC container:
cd /opt/g_till_calculator
chmod +x setup-lxc.sh
./setup-lxc.sh
```

Or deploy using Docker Compose:
```bash
docker compose up -d --build
```

See the full [Proxmox LXC Guide](docs/PROXMOX_LXC_GUIDE.md) for step-by-step Proxmox instructions.

---

## 📈 Google Sheets Sync

Connect your till calculator to Google Sheets in 2 minutes:
1. Create a blank Google Sheet.
2. Paste the provided Google Apps Script in **Extensions > Apps Script**.
3. Deploy as Web App and paste the URL into **Admin > Webhook & Google Sheets**.

See the detailed [Google Sheets Guide](docs/GOOGLE_SHEETS_GUIDE.md).

---

## 🧪 Testing

The repository contains automated unit and integration test suites:

- `tests/calculator.test.js`: Integer cents math, rounding prevention, bi-directional sync, multiple validation ($30 on $20 bill rejection), deposit & discrepancy calculation.
- `tests/api.test.js`: Endpoint validation, unauthorized admin blocking (401), PIN authentication, append-only SQLite persistence, and CSV generation.

Run tests anytime with:
```bash
npm test
```
