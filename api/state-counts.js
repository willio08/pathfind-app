// api/state-counts.js — Returns trail counts per US state
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const ALL_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Run all 50 count queries in parallel — each is a lightweight HEAD request
    const results = await Promise.all(
      ALL_STATES.map(async state => {
        const { count } = await sb
          .from('trails')
          .select('*', { count: 'exact', head: true })
          .eq('state', state);
        return { state, count: count || 0 };
      })
    );

    const counts = {};
    results.forEach(({ state, count }) => { counts[state] = count; });

    // Cache for 1 hour — counts don't change often
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
