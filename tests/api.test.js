const assert = require('node:assert');
const http = require('node:http');

// Set in-memory or test database path
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PIN = '7788';
process.env.PORT = '0'; // ephemeral port

const app = require('../server');

let server;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (e) {
            // Not JSON
          }
          resolve({ status: res.statusCode, headers: res.headers, text: data, json });
        });
      }
    );

    req.on('error', reject);

    if (options.body) {
      if (typeof options.body === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(options.body));
      } else {
        req.write(options.body);
      }
    }

    req.end();
  });
}

async function runTests() {
  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  console.log(`Testing server on ${baseUrl}`);

  try {
    // 1. Test GET /api/config
    const configRes = await request('/api/config');
    assert.strictEqual(configRes.status, 200);
    assert.strictEqual(configRes.json.denominations.length, 10);
    assert.strictEqual(configRes.json.coinRolls.length, 4);
    assert.strictEqual(configRes.json.defaultDrawerFloat, 200);
    console.log('✓ /api/config verified (including coinRolls)');

    // 2. Test POST /api/closings validation: employee name required
    const missingNameRes = await request('/api/closings', {
      method: 'POST',
      body: { drawer_float: 200, breakdown: {} },
    });
    assert.strictEqual(missingNameRes.status, 400);
    assert(missingNameRes.json.error.includes('Employee name'));
    console.log('✓ Employee name requirement verified');

    // 3. Test POST /api/closings validation: invalid multiple rejection
    const invalidMultipleRes = await request('/api/closings', {
      method: 'POST',
      body: {
        employee_name: 'Alex',
        drawer_float: 200,
        breakdown: {
          bill_20: { amount: 35 }, // 35 is not a multiple of 20
        },
      },
    });
    assert.strictEqual(invalidMultipleRes.status, 400);
    assert(invalidMultipleRes.json.error.includes('Must be an exact multiple of $20'));

    const invalidRollRes = await request('/api/closings', {
      method: 'POST',
      body: {
        employee_name: 'Alex',
        drawer_float: 200,
        breakdown: {
          roll_25: { amount: 25 }, // 25 is not a multiple of 10
        },
      },
    });
    assert.strictEqual(invalidRollRes.status, 400);
    assert(invalidRollRes.json.error.includes('Must be an exact multiple of $10 Roll'));
    console.log('✓ Denomination and coin roll multiple validation verified ($35 rejected for $20 bill, $25 rejected for $10 roll)');

    // 4. Test valid POST /api/closings with bills, loose coins, and coin rolls
    const validClosingRes = await request('/api/closings', {
      method: 'POST',
      body: {
        employee_name: 'Jordan',
        drawer_float: 200,
        expected_amount: 200.15,
        cash_tips: 45.25,
        breakdown: {
          bill_100: { count: 3, amount: 300 },
          bill_50: { count: 2, amount: 100 },
          bill_20: { count: 10, amount: 200 },
          bill_10: { count: 4, amount: 40 },
          bill_5: { count: 2, amount: 10 },
          bill_1: { count: 5, amount: 5 },
          coin_25: { count: 4, amount: 1.0 },
          coin_10: { count: 5, amount: 0.5 },
          coin_5: { count: 2, amount: 0.1 },
          coin_1: { count: 40, amount: 0.4 },
          // Coin rolls:
          roll_25: { count: 2, amount: 20 },
          roll_10: { count: 2, amount: 10 },
        },
        notes: 'End of evening shift',
      },
    });
    assert.strictEqual(validClosingRes.status, 201);
    assert.strictEqual(validClosingRes.json.success, true);
    // Total cash: 300+100+200+40+10+5+1+0.5+0.1+0.4 + 20 + 10 = $687.00
    // Float: 200.00
    // Deposit: 487.00
    // Expected: 200.15
    // Discrepancy: 200.00 - 200.15 = -0.15
    assert.strictEqual(validClosingRes.json.closing.total_cash, 687.0);
    assert.strictEqual(validClosingRes.json.closing.deposit_amount, 487.0);
    assert.strictEqual(validClosingRes.json.closing.expected_amount, 200.15);
    assert.strictEqual(validClosingRes.json.closing.discrepancy, -0.15);
    assert.strictEqual(validClosingRes.json.closing.cash_tips, 45.25);
    assert.strictEqual(validClosingRes.json.closing.notes, 'End of evening shift');
    console.log('✓ Valid closing submission and calculation verified (including cash_tips & coin rolls)');

    // 5. Test Employee Privacy / Admin Access Protection
    const unauthorizedAdminRes = await request('/api/admin/closings');
    assert.strictEqual(unauthorizedAdminRes.status, 401);
    console.log('✓ Admin route protected against unauthorized access (401)');

    // 6. Test Admin Login
    const wrongPinRes = await request('/api/admin/login', {
      method: 'POST',
      body: { pin: '0000' },
    });
    assert.strictEqual(wrongPinRes.status, 401);

    const rightPinRes = await request('/api/admin/login', {
      method: 'POST',
      body: { pin: '7788' },
    });
    assert.strictEqual(rightPinRes.status, 200);
    assert(rightPinRes.json.token);
    const token = rightPinRes.json.token;
    console.log('✓ Admin PIN login verified');

    // 7. Test Admin Closings with Token
    const adminClosingsRes = await request('/api/admin/closings', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(adminClosingsRes.status, 200);
    assert.strictEqual(adminClosingsRes.json.closings.length, 1);
    assert.strictEqual(adminClosingsRes.json.closings[0].employee_name, 'Jordan');
    assert.strictEqual(adminClosingsRes.json.closings[0].count_100, 3);
    assert.strictEqual(adminClosingsRes.json.closings[0].roll_25, 2);
    assert.strictEqual(adminClosingsRes.json.closings[0].roll_10, 2);
    console.log('✓ Admin closings list retrieved successfully (with roll columns)');

    // 8. Test Admin Stats
    const statsRes = await request('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(statsRes.status, 200);
    assert.strictEqual(statsRes.json.totalClosings, 1);
    assert.strictEqual(statsRes.json.totalCashCounted, 687.0);
    assert.strictEqual(statsRes.json.totalDeposits, 487.0);
    assert.strictEqual(statsRes.json.totalCashTips, 45.25);
    console.log('✓ Admin stats verified (including totalCashTips & roll values)');

    // 9. Test CSV Export
    const csvRes = await request('/api/admin/export.csv', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(csvRes.status, 200);
    assert(csvRes.headers['content-type'].includes('text/csv'));
    assert(csvRes.text.includes('"Jordan"'));
    assert(csvRes.text.includes('"687.00"'));
    assert(csvRes.text.includes('"45.25"'));
    assert(csvRes.text.includes('"487.00"'));
    assert(csvRes.text.includes('"Quarter Rolls ($10)"'));
    console.log('✓ CSV export generated and verified (including Cash Tips & Coin Roll columns)');

    console.log('\nALL API INTEGRATION TESTS PASSED! 🎉\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
