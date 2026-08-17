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

// Curated, pre-verified Unsplash photos so every auto-generated article
// gets a real, relevant image — never an empty card.
const CARD_IMAGES = {
  main: [
    'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1573497491208-6b1acb260507?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1551601651-2a8555f1a136?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=1200&q=80'
  ],
  hcwa: [
    'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1551601651-2a8555f1a136?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=1200&q=80'
  ]
};

function pickCardImage(site, recentImages){
  var pool = CARD_IMAGES[site] || CARD_IMAGES.main;
  var unused = pool.filter(function(url){ return recentImages.indexOf(url) === -1; });
  var choices = unused.length ? unused : pool; // if all recently used, just cycle again
  return choices[Math.floor(Math.random() * choices.length)];
}

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
    // 1) Pull recent article titles + images (avoid repeating topics AND images)
    const recentRes = await fetch(
      `${cfg.url}/rest/v1/articles?select=title,card_image&order=created_at.desc&limit=15`,
      { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` } }
    );
    const recentArticles = recentRes.ok ? await recentRes.json() : [];
    const recentTitles = recentArticles.map(a => a.title).join('; ') || 'none yet';
    const recentImages = recentArticles.map(a => a.card_image).filter(Boolean);
    const chosenImage = pickCardImage(site, recentImages);

    // 2) Pick a topic seed not obviously already covered
    const seeds = TOPIC_SEEDS[site];
    const topic = seeds[Math.floor(Math.random() * seeds.length)];

    // 3) Ask the model to write the article
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

    // Gemini structured output: responseSchema forces valid JSON back,
    // the same guarantee tool-calling gave us before.
    const MODEL = 'gemini-3.6-flash';
    const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const genRes = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 3000,
          temperature: 0.9,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              subtitle: { type: 'STRING' },
              body: { type: 'STRING' }
            },
            required: ['title', 'subtitle', 'body']
          }
        }
      })
    });

    if (!genRes.ok) {
      const errText = await genRes.text();
      console.error('Gemini API error (article gen):', genRes.status, errText);
      return res.status(502).json({ error: 'Article generation failed at the model call.' });
    }

    const genData = await genRes.json();
    const rawText =
      (genData.candidates &&
       genData.candidates[0] &&
       genData.candidates[0].content &&
       genData.candidates[0].content.parts &&
       genData.candidates[0].content.parts[0] &&
       genData.candidates[0].content.parts[0].text) || '';

    let article;
    try {
      article = JSON.parse(rawText);
    } catch (e) {
      console.error('Could not parse article JSON:', rawText.slice(0, 400));
      return res.status(502).json({ error: 'Model did not return a structured article.' });
    }

    if (!article || !article.title || !article.body) {
      console.error('Article missing required fields:', JSON.stringify(article).slice(0, 300));
      return res.status(502).json({ error: 'Model did not return a structured article.' });
    }

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
        card_image: chosenImage,
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
