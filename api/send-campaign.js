// Vercel Serverless Function — /api/send-campaign
// Sends a campaign to one site's subscriber list.
// Every email is personalised, carries a working unsubscribe link and the
// business postal address (both legally required for commercial email).

const SITES = {
  main: {
    supabaseUrl: 'https://uldywugntkykeftuzxys.supabase.co',
    supabaseKey: 'sb_publishable_kCCHxG8VAO_APnGWxCgLDg_Wj6Vxjj7',
    name: 'Golden Years Home Health Supported Living LLC',
    shortName: 'Golden Years Home Health',
    origin: 'https://goldenyearshomehealthllc.com',
    fromEmail: 'contact@goldenyearshomehealthllc.com'
  },
  hcwa: {
    supabaseUrl: 'https://styzbftuzuqcnkwvwpgm.supabase.co',
    supabaseKey: 'sb_publishable_vgZaJznqe7aI_TJ8gV8ynw_UPgSsifR',
    name: 'Golden Years Home Care WA',
    shortName: 'Golden Years Home Care',
    origin: 'https://goldenyearshomecarewa.com',
    fromEmail: 'contact@goldenyearshomehealthllc.com'
  }
};

const POSTAL_ADDRESS = '614 Harrison St, Suite C, Sumner, WA 98390';
const PHONE = '(206) 717-1234';
const BATCH_SIZE = 40;          // Brevo free tier is 300/day — pace it
const BATCH_PAUSE_MS = 1200;

function esc(s){
  return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Wraps the campaign body in a branded, compliant shell. */
function buildEmail(cfg, sub, htmlBody, subject) {
  const firstName = (sub.name || '').trim().split(/\s+/)[0] || 'there';
  const unsubUrl = `${cfg.origin}/unsubscribe.html?token=${sub.unsub_token}`;
  const personalised = String(htmlBody)
    .replace(/\{\{\s*first_name\s*\}\}/gi, esc(firstName))
    .replace(/\{\{\s*name\s*\}\}/gi, esc(sub.name || 'there'))
    .replace(/\{\{\s*interest\s*\}\}/gi, esc(sub.interest || 'home care'));

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f9fc;font-family:Arial,Helvetica,sans-serif;color:#122236">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(10,30,60,.08)">
  <tr><td style="background:#041e4f;padding:22px 28px">
    <div style="color:#ffffff;font-size:19px;font-weight:bold">${esc(cfg.shortName)}</div>
    <div style="color:#c6a256;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;margin-top:3px">Compassionate Care, Dignified Living</div>
  </td></tr>
  <tr><td style="padding:28px;font-size:15px;line-height:1.65;color:#122236">
    <p style="margin:0 0 16px">Hi ${esc(firstName)},</p>
    ${personalised}
  </td></tr>
  <tr><td style="padding:0 28px 26px">
    <a href="${cfg.origin}" style="display:inline-block;background:#0b5394;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:50px;font-weight:bold;font-size:14px">Visit Our Website</a>
  </td></tr>
  <tr><td style="background:#f0f4f9;padding:20px 28px;font-size:12px;line-height:1.6;color:#4a5b70">
    <div style="font-weight:bold;color:#122236">${esc(cfg.name)}</div>
    <div>${esc(POSTAL_ADDRESS)}</div>
    <div>${esc(PHONE)} &middot; <a href="${cfg.origin}" style="color:#0b5394">${cfg.origin.replace('https://','')}</a></div>
    <div style="margin-top:14px;color:#8195aa">
      You are receiving this because you asked for updates from ${esc(cfg.shortName)}.<br>
      <a href="${unsubUrl}" style="color:#0b5394;text-decoration:underline">Unsubscribe instantly</a> &mdash; we will stop emailing you right away.
    </div>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { site, subject, htmlBody, segment, testTo } = req.body || {};
  const cfg = SITES[site];
  if (!cfg) return res.status(400).json({ error: 'Unknown site.' });
  if (!subject || !htmlBody) return res.status(400).json({ error: 'Subject and body are required.' });
  if (!process.env.BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY is not configured.' });

  async function sendOne(sub) {
    const html = buildEmail(cfg, sub, htmlBody, subject);
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        sender: { name: cfg.shortName, email: cfg.fromEmail },
        to: [{ email: sub.email, name: sub.name || undefined }],
        subject,
        htmlContent: html,
        headers: { 'List-Unsubscribe': `<${cfg.origin}/unsubscribe.html?token=${sub.unsub_token}>` }
      })
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  }

  try {
    // Test send — one email to a given address, list untouched
    if (testTo) {
      await sendOne({ email: testTo, name: 'Test Recipient', interest: 'home care', unsub_token: 'test-token' });
      return res.status(200).json({ ok: true, test: true, sentTo: testTo });
    }

    let query = `${cfg.supabaseUrl}/rest/v1/subscribers?unsubscribed=eq.false&select=email,name,interest,unsub_token`;
    if (segment) query += `&interest=eq.${encodeURIComponent(segment)}`;

    const listRes = await fetch(query, {
      headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` }
    });
    if (!listRes.ok) throw new Error('Could not load subscriber list.');
    const subs = await listRes.json();
    if (!subs.length) return res.status(200).json({ ok: true, sent: 0, message: 'No active subscribers match that segment.' });

    let sent = 0, failed = 0;
    for (let i = 0; i < subs.length; i += BATCH_SIZE) {
      const batch = subs.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(sendOne));
      results.forEach(r => r.status === 'fulfilled' ? sent++ : (failed++, console.error('Send failed:', r.reason)));
      if (i + BATCH_SIZE < subs.length) await sleep(BATCH_PAUSE_MS);
    }

    await fetch(`${cfg.supabaseUrl}/rest/v1/campaigns`, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseKey,
        Authorization: `Bearer ${cfg.supabaseKey}`,
        'content-type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        subject, html_body: htmlBody, segment: segment || null,
        sent_at: new Date().toISOString(), sent_count: sent, failed_count: failed
      })
    }).catch(e => console.error('Campaign log failed:', e));

    return res.status(200).json({ ok: true, sent, failed, total: subs.length });

  } catch (e) {
    console.error('send-campaign error:', e);
    return res.status(500).json({ error: 'Campaign send failed: ' + e.message });
  }
};
