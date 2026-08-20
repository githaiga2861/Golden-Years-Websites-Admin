// Vercel Serverless Function — /api/unsubscribe
// One-click unsubscribe. Deliberately permissive on CORS and requires no
// auth: the legal requirement is that opting out must always be easy.

const SITES = {
  main: {
    supabaseUrl: 'https://uldywugntkykeftuzxys.supabase.co',
    supabaseKey: 'sb_publishable_kCCHxG8VAO_APnGWxCgLDg_Wj6Vxjj7'
  },
  hcwa: {
    supabaseUrl: 'https://styzbftuzuqcnkwvwpgm.supabase.co',
    supabaseKey: 'sb_publishable_vgZaJznqe7aI_TJ8gV8ynw_UPgSsifR'
  }
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.query && req.query.token) || (req.body && req.body.token);
  const site  = (req.query && req.query.site)  || (req.body && req.body.site) || 'main';
  const cfg = SITES[site] || SITES.main;

  if (!token) return res.status(400).json({ error: 'Missing unsubscribe token.' });

  try {
    const r = await fetch(
      `${cfg.supabaseUrl}/rest/v1/subscribers?unsub_token=eq.${encodeURIComponent(token)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: cfg.supabaseKey,
          Authorization: `Bearer ${cfg.supabaseKey}`,
          'content-type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ unsubscribed: true, unsubscribed_at: new Date().toISOString() })
      }
    );

    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();

    if (!rows.length) {
      // Unknown token — still report success so no one is left stuck subscribed
      return res.status(200).json({ ok: true, alreadyDone: true });
    }
    return res.status(200).json({ ok: true, email: rows[0].email });

  } catch (e) {
    console.error('unsubscribe error:', e);
    return res.status(500).json({ error: 'Could not process the unsubscribe. Please email contact@goldenyearshomehealthllc.com and we will remove you manually.' });
  }
};
