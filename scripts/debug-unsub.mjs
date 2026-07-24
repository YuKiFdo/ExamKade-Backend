/**
 * Debug script to test different unsubscribe approaches for stuck legacy users.
 * Run with: node scripts/debug-unsub.mjs <mobile>
 * Example:  node scripts/debug-unsub.mjs 94740344050
 */

const APP_ID = 'APP_068091';
const PASSWORD = '29e94776258bd4dede4554bd5183fdb8';
const mobile = process.argv[2] || '94740344050';

async function tryUnsubscribe(label, url, payload) {
  console.log(`\n=== ${label} ===`);
  console.log('URL:', url);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(body, null, 2));
    return body;
  } catch (err) {
    console.log('Error:', err.message);
    return null;
  }
}

async function tryGetStatus(label, url, payload) {
  console.log(`\n=== ${label} ===`);
  console.log('URL:', url);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(body, null, 2));
    return body;
  } catch (err) {
    console.log('Error:', err.message);
    return null;
  }
}

console.log('Testing unsubscribe for mobile:', mobile);

// 1. Check subscription status first (Dialog endpoint)
await tryGetStatus(
  'Check Status - dialog.lk',
  'https://api.dialog.lk/subscription/getStatus',
  {
    applicationId: APP_ID,
    password: PASSWORD,
    subscriberId: `tel:${mobile}`,
  }
);

// 2. Check subscription status (ideamart endpoint)
await tryGetStatus(
  'Check Status - ideamart.io',
  'https://api.ideamart.io/subscription/getStatus',
  {
    applicationId: APP_ID,
    password: PASSWORD,
    subscriberId: `tel:${mobile}`,
  }
);

// 3. Unsubscribe via dialog.lk with raw MSISDN
await tryUnsubscribe(
  'Unsubscribe - dialog.lk (raw MSISDN)',
  'https://api.dialog.lk/subscription/send',
  {
    applicationId: APP_ID,
    password: PASSWORD,
    version: '1.0',
    action: '0',
    subscriberId: `tel:${mobile}`,
  }
);

// 4. Unsubscribe via ideamart.io with raw MSISDN
await tryUnsubscribe(
  'Unsubscribe - ideamart.io (raw MSISDN)',
  'https://api.ideamart.io/subscription/send',
  {
    applicationId: APP_ID,
    password: PASSWORD,
    version: '1.0',
    action: '0',
    subscriberId: `tel:${mobile}`,
  }
);

console.log('\n=== Done ===');
