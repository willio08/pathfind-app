// api/search-trails.js — Search trails from Supabase database
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, state, lat, lng, radius, difficulty, limit = 60, count } = req.query;
  const cap = Math.min(parseInt(limit), 100);

  // Count-only mode for homepage badge
  if (count === '1') {
    const { count: total, error } = await sb.from('trails').select('*', { count: 'exact', head: true });
    if (error) return res.status(500).json({ error: error.message });
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ total: total || 0 });
  }

  try {
    let query = sb.from('trails').select('*').limit(cap);

    // Full text search
    if (q && q.trim()) {
      query = query.textSearch('name', q.trim().split(/\s+/).join(' | '), {
        type: 'websearch', config: 'english'
      });
    }

    // State filter
    if (state) query = query.eq('state', state.toUpperCase());

    // Difficulty filter
    if (difficulty && difficulty !== 'all') query = query.eq('difficulty', difficulty);

    // Geographic filter — bounding box around lat/lng
    if (lat && lng && radius) {
      const radiusMi = parseFloat(radius);
      const latDeg = radiusMi / 69;
      const lngDeg = radiusMi / (69 * Math.cos(parseFloat(lat) * Math.PI / 180));
      const latF = parseFloat(lat), lngF = parseFloat(lng);
      query = query
        .gte('lat', latF - latDeg).lte('lat', latF + latDeg)
        .gte('lng', lngF - lngDeg).lte('lng', lngF + lngDeg);
    }

    const { data, error } = await query.order('name');
    if (error) throw error;

    // If geo search, compute distances and sort by proximity
    if (lat && lng && data?.length) {
      const latF = parseFloat(lat), lngF = parseFloat(lng);
      const withDist = data.map(t => ({
        ...t,
        _dist: haversine(latF, lngF, t.lat, t.lng)
      })).sort((a, b) => a._dist - b._dist);
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
      return res.status(200).json({ trails: withDist });
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    res.status(200).json({ trails: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
