#!/usr/bin/env node
/**
 * PathFind Photo Fetcher
 * Searches Unsplash for a photo for each trail and saves the URL to Supabase.
 *
 * Usage:
 *   UNSPLASH_KEY=your_access_key SUPABASE_SERVICE_KEY=your_service_key node scripts/fetch-photos.js
 *
 * Requires: npm install @supabase/supabase-js (already done)
 * Free Unsplash tier: 50 requests/hour demo, 5000/hour production
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rxnhkrpytxkgxszlyzva.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const UNSPLASH_KEY = process.env.UNSPLASH_KEY;
const BATCH_SIZE = 100;   // trails to fetch from DB at a time
const DELAY_MS = 300;     // ms between Unsplash requests (~3/sec, well under limit)

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Set SUPABASE_SERVICE_KEY env var');
  process.exit(1);
}
if (!UNSPLASH_KEY) {
  console.error('❌ Set UNSPLASH_KEY env var (get it from unsplash.com/developers)');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Keywords to search Unsplash for each photo_type
const PHOTO_TYPE_QUERIES = {
  waterfall_canyon: 'waterfall hiking trail nature',
  alpine_lake:      'alpine lake mountain trail',
  coastal_cliffs:   'coastal cliffs ocean trail hiking',
  desert_red:       'red rock desert canyon trail',
  mountain_snow:    'snowy mountain alpine hiking trail',
  mountain_peak:    'mountain summit peak hiking',
  rainforest:       'rainforest trail lush green',
  forest_sunlight:  'forest trail sunlight trees hiking',
  mountain_green:   'mountain trail green nature hiking',
};

// Cache so we don't hammer Unsplash with duplicate queries
const queryCache = new Map();

async function fetchUnsplashPhoto(query) {
  if (queryCache.has(query)) return queryCache.get(query);

  const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&content_filter=high`;
  const resp = await fetch(url, {
    headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` }
  });

  if (resp.status === 403) throw new Error('Unsplash API key invalid or rate limited');
  if (!resp.ok) return null;

  const data = await resp.json();
  const photoUrl = data?.urls?.regular || null;
  if (photoUrl) queryCache.set(query, photoUrl);
  return photoUrl;
}

function buildQuery(trail) {
  // Try to build a specific query from the trail name first
  const name = (trail.name || '').toLowerCase();
  const keywords = [];

  if (name.includes('waterfall') || name.includes('falls') || name.includes('cascade')) keywords.push('waterfall');
  else if (name.includes('lake') || name.includes('pond') || name.includes('tarn')) keywords.push('alpine lake');
  else if (name.includes('summit') || name.includes('peak') || name.includes('mountain')) keywords.push('mountain summit');
  else if (name.includes('coast') || name.includes('beach') || name.includes('ocean')) keywords.push('coastal trail');
  else if (name.includes('canyon') || name.includes('desert') || name.includes('mesa')) keywords.push('canyon desert');
  else if (name.includes('forest') || name.includes('redwood') || name.includes('cedar')) keywords.push('forest trail');
  else if (name.includes('glacier') || name.includes('snow') || name.includes('alpine')) keywords.push('alpine glacier');
  else {
    // Fall back to photo_type query
    return PHOTO_TYPE_QUERIES[trail.photo_type] || 'hiking trail nature';
  }

  keywords.push('hiking trail');
  return keywords.join(' ');
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n📸 PathFind Photo Fetcher');
  console.log('Fetching Unsplash photos for trails missing photo_url...\n');

  let offset = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let errors = 0;

  while (true) {
    // Fetch trails that don't have a photo_url yet
    const { data: trails, error } = await sb
      .from('trails')
      .select('id, name, photo_type, state')
      .is('photo_url', null)
      .range(offset, offset + BATCH_SIZE - 1)
      .order('id');

    if (error) { console.error('DB error:', error.message); break; }
    if (!trails || trails.length === 0) break;

    console.log(`Processing batch of ${trails.length} trails (offset ${offset})...`);

    for (const trail of trails) {
      try {
        const query = buildQuery(trail);
        const photoUrl = await fetchUnsplashPhoto(query);

        if (photoUrl) {
          await sb.from('trails').update({ photo_url: photoUrl }).eq('id', trail.id);
          totalUpdated++;
          process.stdout.write(`✓`);
        } else {
          totalSkipped++;
          process.stdout.write(`·`);
        }

        await sleep(DELAY_MS);
      } catch (err) {
        if (err.message.includes('rate limit') || err.message.includes('invalid')) {
          console.error(`\n❌ ${err.message}`);
          console.log(`\nStopped after ${totalUpdated} updates. Re-run to continue from where you left off.`);
          process.exit(1);
        }
        errors++;
        process.stdout.write(`✗`);
      }
    }

    console.log(`\n  ↳ batch done (${totalUpdated} updated so far)`);
    offset += BATCH_SIZE;
    if (trails.length < BATCH_SIZE) break; // last batch
  }

  console.log(`\n🎉 Done!`);
  console.log(`  ✓ ${totalUpdated} trails updated with photos`);
  console.log(`  · ${totalSkipped} skipped (no photo found)`);
  if (errors) console.log(`  ✗ ${errors} errors`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
