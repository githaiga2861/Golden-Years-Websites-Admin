// Vercel Serverless Function — /api/generate-article
// Triggered automatically once a day by Vercel Cron (see vercel.json).
// Writes ONE fresh draft article into the correct site's Supabase 'articles'
// table (as unpublished — it lands in the normal admin approval queue).

const SUPABASE_CONFIG = {
  main: {
    url: 'https://uldywugntkykeftuzxys.supabase.co',
    key: 'sb_publishable_kCCHxG8VAO_APnGWxCgLDg_Wj6Vxjj7'
  },
  hcwa: {
    url: 'https://styzbftuzuqcnkwvwpgm.supabase.co',
    key: 'sb_publishable_vgZaJznqe7aI_TJ8gV8ynw_UPgSsifR'
  }
};

const TOPIC_SEEDS = {
  main: [
    'skilled nursing at home', 'wound care basics for families', 'medication management for seniors',
    'chronic disease management tips', 'recovering safely after surgery', 'signs a loved one needs nursing support',
    'understanding nurse delegation in Washington State', 'catheter care at home', 'managing diabetes safely',
    'fall prevention for seniors', 'preparing for a home health nurse visit', 'caregiver burnout and respite care',
    'supported living vs assisted living', 'HIPAA and your family\'s privacy', 'RN visitation explained',
    'enteral feeding and G-tube care basics', 'coordinating care between doctors and family',
    'home health vs hospital recovery', 'hiring a caregiver: what to ask', 'understanding Medicare home health coverage'
  ],
  hcwa: [
    'signs your parent needs help at home', 'companionship and senior loneliness', 'home safety checklist for seniors',
    'meal planning for aging loved ones', 'respite care for family caregivers', 'transportation help for seniors',
    'medication reminders that actually work', 'staying independent at home', '24-hour care: what it really means',
    'talking to a parent about needing help', 'home care vs moving to a facility', 'the benefits of one-on-one caregiving',
    'keeping seniors socially active', 'home care for dementia and memory loss', 'building trust with a new caregiver',
    'seasonal safety tips for seniors at home', 'balancing work and caregiving', 'what a free care consultation involves',
    'small home modifications that help a lot', 'recognizing caregiver stress in yourself'
  ]
};

const SITE_INFO = {
  main: {
    name: 'Golden Years Home Health Supported Living LLC',
    voice: 'a nurse-led home health agency in Sumner, Washington, serving Pierce, King, Thurston, Lewis, Pacific, Clallam, and Jefferson Counties',
    author: 'Rose Mbote, BSN, RN'
  },
  hcwa: {
    name: 'Golden Years Home Care WA',
    voice: 'a non-medical home care service in Washington State, a sister company of the nurse-led Golden Years Home Health',
    author: 'The Golden Years Care Team'
  }
};

module.exports = async function handler(req, res) {
  // Only Vercel Cron (or someone with the secret) may trigger this
  const authHeader = req.headers['authorization'] || '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const site = (req.query.site === 'hcwa') ? 'hcwa' : 'main';
  const cfg = SUPABASE_CONFIG[site];
  const info = SITE_INFO[site];

  try {
    // 1) Pull recent article titles to avoid repeating topics
    const recentRes = await fetch(
      `${cfg.url}/rest/v1/articles?select=title&order=created_at.desc&limit=15`,
      { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` } }
    );
    const recentArticles = recentRes.ok ? await recentRes.json() : [];
    const recentTitles = recentArticles.map(a => a.title).join('; ') || 'none yet';

    // 2) Pick a topic seed not obviously already covered
    const seeds = TOPIC_SEEDS[site];
    const topic = seeds[Math.floor(Math.random() * seeds.length)];

    // 3) Ask Claude to write the article
    const prompt = `Write one original, helpful blog article for ${info.name}, ${info.voice}.

Suggested topic direction: "${topic}" — but feel free to give it a fresh, specific angle.

Recently published article titles (do NOT repeat these or write something too similar): ${recentTitles}

Requirements:
- 700-1000 words, warm and genuinely helpful tone, written for a worried family member or someone researching care options — not clinical or salesy.
- Structure with a short intro, 3-5 sections each with a clear <h3> heading, and a brief closing paragraph.
- Use simple HTML only: <p>, <h3>, <ul>, <li>, <strong>. No <html>, <head>, or <body> tags.
- End with a warm, brief call to action mentioning our phone number (206) 717-1234, WITHOUT being pushy.
- Do NOT give specific medical advice, diagnoses, or dosing — general education only.

Respond with ONLY valid JSON in this exact shape, nothing else, no markdown fences:
{"title": "...", "subtitle": "...", "body": "<p>...</p>..."}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
        tools: [{
          name: 'save_article',
          description: 'Save the finished blog article.',
          input_schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'The article title.' },
              subtitle: { type: 'string', description: 'A one-sentence subtitle/summary.' },
              body: { type: 'string', description: 'The full article body as simple HTML using only <p>, <h3>, <ul>, <li>, <strong> tags.' }
            },
            required: ['title', 'subtitle', 'body']
          }
        }],
        tool_choice: { type: 'tool', name: 'save_article' }
      })
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Anthropic API error (article gen):', claudeRes.status, errText);
      return res.status(502).json({ error: 'Article generation failed at the model call.' });
    }

    const claudeData = await claudeRes.json();
    const toolBlock = (claudeData.content || []).find(b => b.type === 'tool_use' && b.name === 'save_article');

    if (!toolBlock || !toolBlock.input) {
      console.error('No tool_use block in response:', JSON.stringify(claudeData).slice(0, 500));
      return res.status(502).json({ error: 'Model did not return a structured article.' });
    }

    const article = toolBlock.input;

    if (!article.title || !article.body) {
      return res.status(502).json({ error: 'Generated article missing required fields.' });
    }

    // 4) Insert as an unpublished draft (goes into the normal approval queue)
    const insertRes = await fetch(`${cfg.url}/rest/v1/articles`, {
      method: 'POST',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'content-type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        title: article.title,
        subtitle: article.subtitle || '',
        body: article.body,
        author: info.author,
        published: true
      })
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error('Supabase insert error:', insertRes.status, errText);
      return res.status(502).json({ error: 'Failed to save the generated article.' });
    }

    const saved = await insertRes.json();
    console.log(`Article generated for ${site}: "${article.title}"`);
    return res.status(200).json({ ok: true, site, title: article.title, id: saved[0] && saved[0].id });

  } catch (e) {
    console.error('generate-article handler error:', e);
    return res.status(500).json({ error: 'Unexpected error generating article.' });
  }
};
