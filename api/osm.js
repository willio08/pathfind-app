// api/osm.js — Serverless proxy for OSM Overpass API with edge caching
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lng, radiusMi, maxResults } = req.body || req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const radiusM = Math.min(Math.round((parseFloat(radiusMi) || 50) * 1609), 402000);
  const limit = Math.min(parseInt(maxResults) || 60, 100);

  const query = `[out:json][timeout:25];
relation["route"="hiking"]["name"](around:${radiusM},${parseFloat(lat)},${parseFloat(lng)});
out ${limit} tags center;`;

  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    });
    if (!r.ok) throw new Error(`Overpass returned ${r.status}`);
    const data = await r.json();

    // Cache results for 2 hours on Vercel's edge CDN
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
