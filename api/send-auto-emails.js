// Vercel Serverless Function — /api/send-auto-emails
// Triggered by Vercel Cron every 2 days. For each active subscriber who
// hasn't been emailed in the last 2+ days, drafts a short, genuinely
// personalised nurture email (using their category/notes/contact-time as
// context) and sends it — no manual admin action required.

const SITES = {
  main: {
    supabaseUrl: 'https://uldywugntkykeftuzxys.supabase.co',
    supabaseKey: 'sb_publishable_kCCHxG8VAO_APnGWxCgLDg_Wj6Vxjj7',
    name: 'Golden Years Home Health Supported Living LLC',
    shortName: 'Golden Years Home Health',
    origin: 'https://goldenyearshomehealthllc.com',
    fromEmail: 'contact@goldenyearshomehealthllc.com',
    voice: 'a nurse-led home health agency in Sumner, Washington'
  },
  hcwa: {
    supabaseUrl: 'https://styzbftuzuqcnkwvwpgm.supabase.co',
    supabaseKey: 'sb_publishable_vgZaJznqe7aI_TJ8gV8ynw_UPgSsifR',
    name: 'Golden Years Home Care WA',
    shortName: 'Golden Years Home Care',
    origin: 'https://goldenyearshomecarewa.com',
    fromEmail: 'updates@goldenyearshomecarewa.com',
    voice: 'a non-medical home care service in Washington State, a sister company of the nurse-led Golden Years Home Health'
  }
};

const POSTAL_ADDRESS = '614 Harrison St, Suite C, Sumner, WA 98390';
const PHONE = '(206) 717-1234';
const MAX_PER_SITE_PER_RUN = 60;     // safety ceiling, well inside Brevo's free daily cap
const MIN_DAYS_BETWEEN_EMAILS = 2;
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 1500;

function esc(s){ return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function buildEmail(cfg, sub, htmlBody, subject) {
  const firstName = (sub.name || '').trim().split(/\s+/)[0] || 'there';
  const unsubUrl = `${cfg.origin}/unsubscribe.html?token=${sub.unsub_token}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f9fc;font-family:Arial,Helvetica,sans-serif;color:#122236">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(10,30,60,.08)">
  <tr><td style="background:#041e4f;padding:22px 28px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:12px;vertical-align:middle"><img src="https://goldenyearshomehealthllc.com/images/logo.png" width="40" height="40" alt="${esc(cfg.shortName)} logo" style="display:block;border-radius:8px;background:#ffffff"></td>
      <td style="vertical-align:middle">
        <div style="color:#ffffff;font-size:19px;font-weight:bold">${esc(cfg.shortName)}</div>
        <div style="color:#c6a256;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;margin-top:3px">Compassionate Care, Dignified Living</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px;font-size:15px;line-height:1.65;color:#122236">
    <p style="margin:0 0 16px">Hi ${esc(firstName)},</p>
    ${htmlBody}
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

async function draftForSubscriber(cfg, sub) {
  const context = [
    `Category / interest: ${sub.category || sub.interest || 'General'}`,
    sub.best_contact_time ? `Best time to contact them: ${sub.best_contact_time}` : null,
    sub.notes ? `Notes on this contact: ${sub.notes}` : null,
    sub.source ? `They first reached out via: ${sub.source}` : null
  ].filter(Boolean).join('\n');

  const prompt = `Write one short, warm nurture email for a subscriber of ${cfg.name}, ${cfg.voice}.

Subscriber context:
${context}

Requirements:
- 80-140 words. Genuinely useful or reassuring, not a generic newsletter blast.
- Tailor the content specifically to their category/interest above — do not write something generic.
- Simple HTML only: <p>, <strong>, <ul>, <li>. No headers, no signature, no address, no unsubscribe text (added automatically).
- Address the reader as {{first_name}} once near the start.
- End with one soft, natural next step (not pushy) relevant to their situation.
- Do not give medical advice.

Respond with ONLY valid JSON, no markdown fences: {"subject": "...", "body": "<p>...</p>"}`;

  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + process.env.GEMINI_API_KEY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        thinkingConfig: { thinkingLevel: 'low' },
        maxOutputTokens: 900,
        temperature: 0.85,
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { subject: { type: 'STRING' }, body: { type: 'STRING' } }, required: ['subject', 'body'] }
      }
    })
  });
  if (!r.ok) throw new Error(`Gemini error ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const draft = JSON.parse(text);
  if (!draft.subject || !draft.body) throw new Error('Model returned incomplete draft.');
  return draft;
}

async function processSite(site) {
  const cfg = SITES[site];
  const cutoff = new Date(Date.now() - MIN_DAYS_BETWEEN_EMAILS * 24 * 60 * 60 * 1000).toISOString();

  const listRes = await fetch(
    `${cfg.supabaseUrl}/rest/v1/subscribers?unsubscribed=eq.false&or=(last_emailed_at.is.null,last_emailed_at.lt.${cutoff})&select=email,name,interest,category,best_contact_time,notes,source,unsub_token&limit=${MAX_PER_SITE_PER_RUN}`,
    { headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` } }
  );
  if (!listRes.ok) throw new Error(`Could not load subscribers for ${site}: ${await listRes.text()}`);
  const subs = await listRes.json();

  let sent = 0, failed = 0;
  for (let i = 0; i < subs.length; i += BATCH_SIZE) {
    const batch = subs.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(async (sub) => {
      const draft = await draftForSubscriber(cfg, sub);
      const personalisedBody = draft.body.replace(/\{\{\s*first_name\s*\}\}/gi, esc((sub.name || '').split(/\s+/)[0] || 'there'));
      const html = buildEmail(cfg, sub, personalisedBody, draft.subject);

      const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: cfg.shortName, email: cfg.fromEmail },
          to: [{ email: sub.email, name: sub.name || undefined }],
          subject: draft.subject,
          htmlContent: html,
          headers: { 'List-Unsubscribe': `<${cfg.origin}/unsubscribe.html?token=${sub.unsub_token}>` }
        })
      });
      if (!emailRes.ok) throw new Error(`Brevo error ${emailRes.status}: ${await emailRes.text()}`);

      await fetch(`${cfg.supabaseUrl}/rest/v1/subscribers?email=eq.${encodeURIComponent(sub.email)}`, {
        method: 'PATCH',
        headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ last_emailed_at: new Date().toISOString() })
      }).catch(() => {});

      await fetch(`${cfg.supabaseUrl}/rest/v1/sent_emails`, {
        method: 'POST',
        headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          subscriber_email: sub.email, subscriber_name: sub.name || null,
          subject: draft.subject, body_preview: personalisedBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160),
          send_type: 'ai-auto', status: 'sent'
        })
      }).catch(() => {});
    })).then(results => {
      results.forEach(r => r.status === 'fulfilled' ? sent++ : (failed++, console.error(`[${site}] auto-send failed:`, r.reason?.message || r.reason)));
    });
    if (i + BATCH_SIZE < subs.length) await sleep(BATCH_PAUSE_MS);
  }
  return { site, eligible: subs.length, sent, failed };
}

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.BREVO_API_KEY) return res.status(500).json({ error: 'BREVO_API_KEY is not configured.' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });

  try {
    const results = [];
    for (const site of Object.keys(SITES)) {
      results.push(await processSite(site));
    }
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    console.error('send-auto-emails error:', e);
    return res.status(500).json({ error: 'Auto-send run failed: ' + e.message });
  }
};
