/**
 * Manager Admin Dashboard Logic
 */

let authToken = sessionStorage.getItem('admin_token') || '';
let closingsData = [];

// DOM Elements
const pinView = document.getElementById('pinView');
const dashboardView = document.getElementById('dashboardView');
const adminPinInput = document.getElementById('adminPinInput');
const btnLogin = document.getElementById('btnLogin');
const pinErrorMsg = document.getElementById('pinErrorMsg');
const btnLogout = document.getElementById('btnLogout');

const statClosings = document.getElementById('statClosings');
const statDeposits = document.getElementById('statDeposits');
const statTotalCash = document.getElementById('statTotalCash');

const closingsTableBody = document.getElementById('closingsTableBody');
const historyCount = document.getElementById('historyCount');
const filterInput = document.getElementById('filterInput');

const btnExportCsv = document.getElementById('btnExportCsv');
const btnOpenSettings = document.getElementById('btnOpenSettings');
const settingsPanel = document.getElementById('settingsPanel');
const btnCloseSettings = document.getElementById('btnCloseSettings');

const webhookUrlInput = document.getElementById('webhookUrlInput');
const btnSaveWebhook = document.getElementById('btnSaveWebhook');
const btnTestWebhook = document.getElementById('btnTestWebhook');
const webhookStatusMsg = document.getElementById('webhookStatusMsg');

const newPinInput = document.getElementById('newPinInput');
const btnUpdatePin = document.getElementById('btnUpdatePin');
const pinStatusMsg = document.getElementById('pinStatusMsg');

const detailModal = document.getElementById('detailModal');
const detailModalSubtitle = document.getElementById('detailModalSubtitle');
const detailModalContent = document.getElementById('detailModalContent');
const btnCloseDetail = document.getElementById('btnCloseDetail');

/**
 * Check existing authentication on load
 */
async function init() {
  if (authToken) {
    try {
      await loadDashboardData();
      showDashboard();
      return;
    } catch (e) {
      sessionStorage.removeItem('admin_token');
      authToken = '';
    }
  }
  showPinPrompt();
}

function showPinPrompt() {
  pinView.style.display = 'block';
  dashboardView.style.display = 'none';
  btnLogout.style.display = 'none';
  adminPinInput.value = '';
  adminPinInput.focus();
}

function showDashboard() {
  pinView.style.display = 'none';
  dashboardView.style.display = 'block';
  btnLogout.style.display = 'flex';
}

/**
 * Handle PIN submission
 */
async function handleLogin() {
  const pin = adminPinInput.value.trim();
  if (!pin) return;

  btnLogin.disabled = true;
  btnLogin.textContent = 'Verifying...';
  pinErrorMsg.style.display = 'none';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid PIN');
    }

    authToken = data.token;
    sessionStorage.setItem('admin_token', authToken);
    await loadDashboardData();
    showDashboard();
  } catch (err) {
    pinErrorMsg.textContent = '⚠️ ' + err.message;
    pinErrorMsg.style.display = 'block';
    adminPinInput.value = '';
    adminPinInput.focus();
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Unlock Dashboard';
  }
}

/**
 * Load dashboard stats and closings
 */
async function loadDashboardData() {
  const headers = { Authorization: `Bearer ${authToken}` };

  // 1. Fetch Stats
  const statsRes = await fetch('/api/admin/stats', { headers });
  if (!statsRes.ok) throw new Error('Auth expired');
  const stats = await statsRes.json();

  statClosings.textContent = stats.totalClosings;
  statDeposits.textContent = formatCurrency(stats.totalDeposits);
  statTotalCash.textContent = formatCurrency(stats.totalCashCounted);

  // 2. Fetch Closings
  const closingsRes = await fetch('/api/admin/closings?limit=500', { headers });
  const closingsJson = await closingsRes.json();
  closingsData = closingsJson.closings || [];

  renderTable(closingsData);

  // 3. Fetch Settings
  const settingsRes = await fetch('/api/admin/settings', { headers });
  if (settingsRes.ok) {
    const settings = await settingsRes.json();
    webhookUrlInput.value = settings.webhook_url || '';
  }
}

/**
 * Render history table rows
 */
function renderTable(rows) {
  historyCount.textContent = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`;

  if (rows.length === 0) {
    closingsTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">
          No till closings found.
        </td>
      </tr>
    `;
    return;
  }

  closingsTableBody.innerHTML = rows
    .map(c => {
      const dateStr = new Date(c.created_at).toLocaleString();
      let discClass = 'balanced';
      let discText = '$0.00';

      if (c.discrepancy > 0) {
        discClass = 'over';
        discText = `+${formatCurrency(c.discrepancy)}`;
      } else if (c.discrepancy < 0) {
        discClass = 'short';
        discText = `-${formatCurrency(Math.abs(c.discrepancy))}`;
      }

      return `
        <tr>
          <td><strong>${dateStr}</strong></td>
          <td>${escapeHtml(c.employee_name)}</td>
          <td>${formatCurrency(c.total_cash)}</td>
          <td>${formatCurrency(c.drawer_float)}</td>
          <td style="color: var(--primary); font-weight: 800;">${formatCurrency(c.deposit_amount)}</td>
          <td>${formatCurrency(c.expected_amount)}</td>
          <td>
            <span class="discrepancy-badge ${discClass}" style="font-size: 0.75rem; padding: 2px 8px;">
              ${discText}
            </span>
          </td>
          <td>
            <button class="btn-header" style="padding: 4px 8px; font-size: 0.75rem;" onclick="viewDetail(${c.id})">
              Details
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

/**
 * View detailed denomination breakdown
 */
window.viewDetail = function (id) {
  const closing = closingsData.find(c => c.id === id);
  if (!closing) return;

  const dateStr = new Date(closing.created_at).toLocaleString();
  detailModalSubtitle.textContent = `${closing.employee_name} — ${dateStr}`;

  let breakdown = {};
  try {
    breakdown = JSON.parse(closing.breakdown_json || '{}');
  } catch (e) {
    breakdown = {};
  }

  const denomRows = [
    { label: '$100 Bills', count: closing.count_100, val: closing.count_100 * 100 },
    { label: '$50 Bills',  count: closing.count_50,  val: closing.count_50 * 50 },
    { label: '$20 Bills',  count: closing.count_20,  val: closing.count_20 * 20 },
    { label: '$10 Bills',  count: closing.count_10,  val: closing.count_10 * 10 },
    { label: '$5 Bills',   count: closing.count_5,   val: closing.count_5 * 5 },
    { label: '$1 Bills',   count: closing.count_1,   val: closing.count_1 * 1 },
    { label: 'Quarters ($0.25)', count: closing.count_025, val: closing.count_025 * 0.25 },
    { label: 'Dimes ($0.10)',    count: closing.count_010, val: closing.count_010 * 0.10 },
    { label: 'Nickels ($0.05)',  count: closing.count_005, val: closing.count_005 * 0.05 },
    { label: 'Pennies ($0.01)',  count: closing.count_001, val: closing.count_001 * 0.01 },
  ];

  let breakdownHtml = denomRows
    .map(
      d => `
      <div class="receipt-line" style="font-size: 0.82rem;">
        <span>${d.label} (×${d.count}):</span>
        <strong>${formatCurrency(d.val)}</strong>
      </div>
    `
    )
    .join('');

  detailModalContent.innerHTML = `
    <div style="margin-bottom: 12px; font-weight: 700; color: #475569; font-size: 0.85rem; text-transform: uppercase;">
      Denomination Breakdown
    </div>
    ${breakdownHtml}
    
    <div class="receipt-line bold" style="margin-top: 10px;">
      <span>Total Cash Counted:</span>
      <strong>${formatCurrency(closing.total_cash)}</strong>
    </div>
    <div class="receipt-line">
      <span>Drawer Float Kept:</span>
      <strong>${formatCurrency(closing.drawer_float)}</strong>
    </div>
    <div class="receipt-line highlight">
      <span>Bank Deposit Amount:</span>
      <span>${formatCurrency(closing.deposit_amount)}</span>
    </div>
    <div class="receipt-line">
      <span>Register Expected:</span>
      <strong>${formatCurrency(closing.expected_amount)}</strong>
    </div>
    <div class="receipt-line" style="font-weight: 700;">
      <span>Discrepancy:</span>
      <span>${closing.discrepancy >= 0 ? '+' : ''}${formatCurrency(closing.discrepancy)}</span>
    </div>
    ${
      closing.notes
        ? `<div style="margin-top: 10px; font-size: 0.8rem; background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0;"><strong>Notes:</strong> ${escapeHtml(closing.notes)}</div>`
        : ''
    }
  `;

  detailModal.classList.add('active');
};

/**
 * Filter table by employee name
 */
filterInput.addEventListener('input', e => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderTable(closingsData);
    return;
  }
  const filtered = closingsData.filter(c =>
    c.employee_name.toLowerCase().includes(query)
  );
  renderTable(filtered);
});

/**
 * Trigger CSV Download with Auth Header
 */
btnExportCsv.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/admin/export.csv', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error('Failed to download CSV');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `till_closings_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error exporting CSV: ' + err.message);
  }
});

/**
 * Save Webhook URL
 */
btnSaveWebhook.addEventListener('click', async () => {
  const url = webhookUrlInput.value.trim();
  webhookStatusMsg.textContent = '';

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ webhook_url: url }),
    });

    const data = await res.json();
    if (res.ok) {
      webhookStatusMsg.style.color = 'var(--primary)';
      webhookStatusMsg.textContent = '✓ Webhook URL saved successfully!';
    } else {
      throw new Error(data.error || 'Failed to save');
    }
  } catch (err) {
    webhookStatusMsg.style.color = 'var(--danger)';
    webhookStatusMsg.textContent = '⚠️ ' + err.message;
  }
});

/**
 * Test Webhook Trigger
 */
btnTestWebhook.addEventListener('click', async () => {
  webhookStatusMsg.style.color = 'var(--text-muted)';
  webhookStatusMsg.textContent = 'Sending test payload...';

  try {
    const res = await fetch('/api/admin/test-webhook', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();

    if (data.success) {
      webhookStatusMsg.style.color = 'var(--primary)';
      webhookStatusMsg.textContent = `✓ Test delivered successfully (HTTP ${data.status})!`;
    } else if (data.skipped) {
      webhookStatusMsg.style.color = 'var(--warning)';
      webhookStatusMsg.textContent = '⚠️ Please enter and save a valid Webhook URL first.';
    } else {
      webhookStatusMsg.style.color = 'var(--danger)';
      webhookStatusMsg.textContent = `⚠️ Delivery failed: ${data.error || 'Check URL'}`;
    }
  } catch (err) {
    webhookStatusMsg.style.color = 'var(--danger)';
    webhookStatusMsg.textContent = '⚠️ Error: ' + err.message;
  }
});

/**
 * Update Manager Password / PIN
 */
btnUpdatePin.addEventListener('click', async () => {
  const newPin = newPinInput.value.trim();
  if (newPin.length < 4) {
    pinStatusMsg.style.color = 'var(--danger)';
    pinStatusMsg.textContent = '⚠️ Password must be at least 4 characters.';
    return;
  }

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ new_pin: newPin }),
    });

    if (res.ok) {
      pinStatusMsg.style.color = 'var(--primary)';
      pinStatusMsg.textContent = '✓ Manager password updated successfully!';
      newPinInput.value = '';
    } else {
      throw new Error('Failed to update password');
    }
  } catch (err) {
    pinStatusMsg.style.color = 'var(--danger)';
    pinStatusMsg.textContent = '⚠️ ' + err.message;
  }
});

// UI Toggles
btnOpenSettings.addEventListener('click', () => {
  settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
});
btnCloseSettings.addEventListener('click', () => {
  settingsPanel.style.display = 'none';
});
btnCloseDetail.addEventListener('click', () => {
  detailModal.classList.remove('active');
});

// Login / Logout
btnLogin.addEventListener('click', handleLogin);
adminPinInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});
btnLogout.addEventListener('click', () => {
  sessionStorage.removeItem('admin_token');
  authToken = '';
  showPinPrompt();
});

function formatCurrency(num) {
  return '$' + Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Start
init();
