// Vercel Serverless Function — /api/chat
// Holds the Anthropic API key SERVER-SIDE only. Never exposed to the browser.
// Both websites call this endpoint; it never talks to Anthropic client-side.

const ALLOWED_ORIGINS = [
  'https://goldenyearshomehealthllc.com',
  'https://www.goldenyearshomehealthllc.com',
  'https://goldenyearshomecarewa.com',
  'https://www.goldenyearshomecarewa.com'
];

// Very simple in-memory rate limiter (best-effort only — resets on cold start,
// not shared across serverless instances). Good enough to blunt casual abuse;
// for real protection at scale, move to Vercel KV or similar later.
const rateMap = new Map();
const RATE_LIMIT = 12;          // max messages
const RATE_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes, per IP

const SYSTEM_PROMPTS = {
  main: `You are the friendly virtual assistant for Golden Years Home Health Supported Living LLC, a nurse-led home health agency based in Sumner, Washington, founded by Rose Mbote, BSN, RN, RND, PDN.

FACTS ABOUT US:
- Phone: (206) 717-1234. Email: contact@goldenyearshomehealthllc.com. Address: 614 Harrison St, Suite C, Sumner, WA 98390.
- We serve Pierce, King, Thurston, Lewis, Pacific, Clallam, and Jefferson Counties, Washington.
- Services: Skilled Nursing, Private Duty Nursing, Personal Care, Medication Management, Chronic Disease Management, Respite Care, Post-Surgery Care, Catheter Care, Enteral Feeds/G-Tube, Nurse Delegation, Caregiver/HCA Training, Supported Living, Care Coordination, RN Visitation, and Adult Family Home placement support.
- We also hire: Registered Nurses, CNAs, HCAs, Physical Therapists, and Occupational Therapists — see our Careers page.
- Office hours: Monday–Friday, 8am–6pm.

HOW TO BEHAVE:
- Be warm, brief, and clear — this is a stressed family member or a job seeker, not a chatbot demo.
- You can explain our services in general terms, but you are NOT a medical professional — never give medical advice, diagnoses, or clinical recommendations. For anything clinical, direct them to call and speak with our nursing team.
- You cannot book appointments, check specific availability, or access any client records — always direct real inquiries to the "Request a Consultation" button, the contact form, or a phone call.
- If asked about pricing, explain that costs vary by service and insurance/payment situation, and a consultation call is the best way to get a real answer.
- Keep answers short — 2-4 sentences unless more detail is truly needed.
- Never invent information you don't have. If unsure, say so and point them to a phone call.`,

  hcwa: `You are the friendly virtual assistant for Golden Years Home Care WA, a non-medical home care service based in Sumner, Washington — a sister company of the nurse-led Golden Years Home Health Supported Living LLC.

FACTS ABOUT US:
- Phone: (206) 717-1234. Email: contact@goldenyearshomehealthllc.com.
- We serve families across Washington State.
- Services: Personal Care, Companionship, Homemaking & Meals, Respite Care, Errands & Transportation, Medication Reminders, and 24-Hour Care. This is NON-MEDICAL home care — for skilled nursing or clinical needs, we refer people to our sister site, Golden Years Home Health.
- We focus on helping seniors stay safely and comfortably in their own homes.

HOW TO BEHAVE:
- Be warm, brief, and reassuring — this is often a worried family member looking into care options for the first time.
- You are NOT a medical professional — never give medical advice. If someone describes a clinical/medical need (wound care, medication management by a nurse, etc.), gently let them know that's handled by our sister company Golden Years Home Health, and suggest they mention it when they call.
- You cannot book care, check caregiver availability, or access client records — always direct real inquiries to the "Get Care Now" button, the contact form, or a phone call.
- Keep answers short — 2-4 sentences unless more detail is truly needed.
- Never invent information you don't have. If unsure, say so and point them to a phone call.`
};

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit by IP
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count++;
  rateMap.set(ip, entry);
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many messages. Please try again in a few minutes, or call (206) 717-1234.' });
  }

  const { site, messages } = req.body || {};
  if (!site || !SYSTEM_PROMPTS[site]) {
    return res.status(400).json({ error: 'Invalid or missing site parameter.' });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing messages.' });
  }

  // Cap conversation length sent to the model (keeps cost predictable)
  const trimmedMessages = messages.slice(-10).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 1500)
  }));

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system: SYSTEM_PROMPTS[site],
        messages: trimmedMessages
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error:', apiRes.status, errText);
      return res.status(502).json({ error: 'Our assistant is having trouble right now — please call (206) 717-1234.' });
    }

    const data = await apiRes.json();
    const reply = (data.content && data.content[0] && data.content[0].text) || "Sorry, I didn't catch that — could you rephrase?";
    return res.status(200).json({ reply });

  } catch (e) {
    console.error('Chat handler error:', e);
    return res.status(500).json({ error: 'Something went wrong — please call (206) 717-1234.' });
  }
};
