const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const {
  DENOMINATIONS,
  calculateClosingTotals,
  amountToCount,
} = require('./src/calculator');
const {
  insertClosing,
  getAllClosings,
  getClosingStats,
  getSetting,
  setSetting,
} = require('./src/db');
const { dispatchWebhook, formatWebhookPayload } = require('./src/webhook');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

// In-memory active admin session tokens (valid for 24 hours)
const activeSessions = new Map();

// Helper to clean up expired sessions
const sessionTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, data] of activeSessions.entries()) {
    if (now - data.createdAt > 24 * 60 * 60 * 1000) {
      activeSessions.delete(token);
    }
  }
}, 60 * 60 * 1000);
sessionTimer.unref();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Admin authentication middleware
function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const pinHeader = req.headers['x-admin-pin'];

  // Direct PIN header check (convenient for API or curl)
  const currentPin = getSetting('admin_pin') || ADMIN_PIN;
  if (pinHeader && pinHeader === currentPin) {
    return next();
  }

  // Bearer token check
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (activeSessions.has(token)) {
      const session = activeSessions.get(token);
      if (Date.now() - session.createdAt < 24 * 60 * 60 * 1000) {
        return next();
      }
      activeSessions.delete(token);
    }
  }

  return res.status(401).json({ error: 'Unauthorized. Admin PIN or session token required.' });
}

// ----------------------------------------------------
// Public / Employee API Routes
// ----------------------------------------------------

/**
 * GET /api/config
 * Returns public configuration and denominations
 */
app.get('/api/config', (req, res) => {
  res.json({
    denominations: DENOMINATIONS,
    defaultDrawerFloat: 200.0,
  });
});

/**
 * POST /api/closings
 * Append-only endpoint for employees to submit a drawer closing.
 * Note: Employees CANNOT view prior submissions via this or any public endpoint.
 */
app.post('/api/closings', (req, res) => {
  try {
    const { employee_name, drawer_float, expected_amount, breakdown, notes } = req.body;

    if (!employee_name || typeof employee_name !== 'string' || !employee_name.trim()) {
      return res.status(400).json({ error: 'Employee name is required.' });
    }

    const drawerFloat = drawer_float !== undefined && drawer_float !== '' ? Number(drawer_float) : 200.0;
    if (isNaN(drawerFloat) || drawerFloat < 0) {
      return res.status(400).json({ error: 'Drawer float must be a non-negative number.' });
    }

    const expectedAmount = expected_amount !== undefined && expected_amount !== '' ? Number(expected_amount) : 0.0;
    if (isNaN(expectedAmount) || expectedAmount < 0) {
      return res.status(400).json({ error: 'Expected register amount must be a non-negative number.' });
    }

    // Validate breakdown and check denomination multiples
    const inputBreakdown = breakdown || {};
    for (const denom of DENOMINATIONS) {
      const item = inputBreakdown[denom.id];
      if (item && item.amount !== undefined && item.amount !== '' && Number(item.amount) > 0) {
        const check = amountToCount(denom, item.amount);
        if (!check.valid) {
          return res.status(400).json({
            error: `Invalid amount for ${denom.label}: $${item.amount}. Must be an exact multiple of ${denom.label}.`,
          });
        }
      }
    }

    // Recalculate server-side to guarantee precision and integrity
    const calculated = calculateClosingTotals(inputBreakdown, drawerFloat, expectedAmount);

    const saved = insertClosing({
      employee_name: employee_name.trim(),
      drawer_float: calculated.drawerFloat,
      expected_amount: calculated.expected,
      total_cash: calculated.totalCash,
      deposit_amount: calculated.deposit,
      discrepancy: calculated.discrepancy,
      breakdown: calculated.breakdown,
      notes: notes || '',
    });

    // Fire webhook asynchronously
    dispatchWebhook({
      ...saved,
      breakdown: calculated.breakdown,
      notes: notes || '',
    }).catch(err => console.error('[Webhook error]:', err));

    return res.status(201).json({
      success: true,
      message: 'Drawer closing saved successfully.',
      closing: saved,
    });
  } catch (err) {
    console.error('Error saving closing:', err);
    return res.status(500).json({ error: 'Failed to save drawer closing.' });
  }
});

// ----------------------------------------------------
// Admin API Routes (PIN-protected)
// ----------------------------------------------------

/**
 * POST /api/admin/login
 * Verify admin PIN and generate session token
 */
app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  const currentPin = getSetting('admin_pin') || ADMIN_PIN;

  if (!pin || String(pin).trim() !== String(currentPin)) {
    return res.status(401).json({ error: 'Invalid admin PIN' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, { createdAt: Date.now() });

  res.json({
    success: true,
    token,
    message: 'Authenticated successfully',
  });
});

/**
 * GET /api/admin/closings
 * View all previous drawer closings
 */
app.get('/api/admin/closings', requireAdmin, (req, res) => {
  try {
    const limit = Math.min(1000, parseInt(req.query.limit, 10) || 500);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const rows = getAllClosings(limit, offset);
    res.json({ closings: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch closings.' });
  }
});

/**
 * GET /api/admin/stats
 * Summary statistics for manager
 */
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const stats = getClosingStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

/**
 * GET /api/admin/export.csv
 * One-click CSV export of drawer closings
 */
app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  try {
    const closings = getAllClosings(5000, 0);

    const headers = [
      'ID',
      'Date & Time (UTC)',
      'Employee Name',
      'Total Cash Counted',
      'Drawer Float (Kept)',
      'Deposit Amount (Bank)',
      'Register Expected',
      'Discrepancy (Over/Short)',
      '$100 Bills',
      '$50 Bills',
      '$20 Bills',
      '$10 Bills',
      '$5 Bills',
      '$1 Bills',
      'Quarters ($0.25)',
      'Dimes ($0.10)',
      'Nickels ($0.05)',
      'Pennies ($0.01)',
      'Notes',
    ];

    const escapeCsv = val => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.map(escapeCsv).join(',')];

    for (const c of closings) {
      csvRows.push(
        [
          c.id,
          c.created_at,
          c.employee_name,
          c.total_cash.toFixed(2),
          c.drawer_float.toFixed(2),
          c.deposit_amount.toFixed(2),
          c.expected_amount.toFixed(2),
          c.discrepancy.toFixed(2),
          c.count_100,
          c.count_50,
          c.count_20,
          c.count_10,
          c.count_5,
          c.count_1,
          c.count_025,
          c.count_010,
          c.count_005,
          c.count_001,
          c.notes || '',
        ]
          .map(escapeCsv)
          .join(',')
      );
    }

    const csvContent = csvRows.join('\r\n');
    const filename = `till_closings_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).send('Failed to generate CSV export.');
  }
});

/**
 * GET /api/admin/settings
 */
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({
    webhook_url: getSetting('webhook_url') || process.env.WEBHOOK_URL || '',
    has_custom_pin: Boolean(getSetting('admin_pin')),
  });
});

/**
 * POST /api/admin/settings
 */
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { webhook_url, new_pin } = req.body;

  if (webhook_url !== undefined) {
    setSetting('webhook_url', webhook_url.trim());
  }

  if (new_pin && String(new_pin).trim().length >= 4) {
    setSetting('admin_pin', String(new_pin).trim());
  }

  res.json({ success: true, message: 'Settings updated successfully' });
});

/**
 * POST /api/admin/test-webhook
 */
app.post('/api/admin/test-webhook', requireAdmin, async (req, res) => {
  const testData = {
    id: 99999,
    created_at: new Date().toISOString(),
    employee_name: 'Test Manager',
    total_cash: 550.0,
    drawer_float: 200.0,
    deposit_amount: 350.0,
    expected_amount: 350.0,
    discrepancy: 0.0,
    notes: 'Test webhook verification',
    count_100: 2,
    count_50: 2,
    count_20: 10,
    count_10: 4,
    count_5: 2,
    count_1: 0,
    count_025: 0,
    count_010: 0,
    count_005: 0,
    count_001: 0,
    breakdown: {
      bill_100: { count: 2, amount: 200.0 },
      bill_50: { count: 2, amount: 100.0 },
      bill_20: { count: 10, amount: 200.0 },
      bill_10: { count: 4, amount: 40.0 },
      bill_5: { count: 2, amount: 10.0 },
    },
  };

  const result = await dispatchWebhook(testData);
  res.json(result);
});

// HTML Page routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Fallback route for SPA / employee app
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server if run directly
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`  G-Till Calculator Running               `);
    console.log(`  Port: ${PORT}                           `);
    console.log(`  Employee App: http://0.0.0.0:${PORT}/   `);
    console.log(`  Admin Dashboard: http://0.0.0.0:${PORT}/admin `);
    console.log(`  Default Admin PIN: ${ADMIN_PIN}         `);
    console.log(`=========================================`);
  });
}

module.exports = app;
