// api/nps.js — Serverless proxy for NPS API (keeps key server-side)
export default async function handler(req, res) {
  // CORS headers so the frontend can call this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { stateCode } = req.query;
  if (!stateCode) return res.status(400).json({ error: 'stateCode required' });

  const key = process.env.NPS_API_KEY;
  if (!key) return res.status(500).json({ error: 'NPS API key not configured' });

  try {
    const url = `https://developer.nps.gov/api/v1/parks?stateCode=${stateCode}&limit=50&fields=images,activities&api_key=${key}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`NPS API returned ${r.status}`);
    const data = await r.json();

    // Cache for 1 day on Vercel's edge CDN
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
