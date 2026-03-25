#!/usr/bin/env node
/**
 * PathFind Trail Importer
 * Fetches hiking trails from OpenStreetMap Overpass API for all 50 US states
 * and upserts them into Supabase. Run once to seed the database.
 *
 * Usage:
 *   node scripts/import-trails.js
 *
 * Requires Node 18+ (for native fetch).
 * Install deps first: npm install @supabase/supabase-js
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rxnhkrpytxkgxszlyzva.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // set this env var
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const BATCH_SIZE = 500;   // trails per Supabase upsert
const RESULTS_PER_STATE = 500; // max trails to fetch per state
const DELAY_MS = 3000;    // ms between Overpass requests (be polite)

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Set SUPABASE_SERVICE_KEY env var (get it from Supabase → Project Settings → API → service_role key)');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// US state bounding boxes [south, west, north, east]
const STATES = {
  AL: { bbox: [30.2,-88.5,35.0,-84.9], name:'Alabama' },
  AK: { bbox: [54.6,-163.0,71.5,-130.0], name:'Alaska' },
  AZ: { bbox: [31.3,-114.8,37.0,-109.0], name:'Arizona' },
  AR: { bbox: [33.0,-94.6,36.5,-89.6], name:'Arkansas' },
  CA: { bbox: [32.5,-124.5,42.0,-114.1], name:'California' },
  CO: { bbox: [37.0,-109.1,41.0,-102.0], name:'Colorado' },
  CT: { bbox: [41.0,-73.7,42.1,-71.8], name:'Connecticut' },
  DE: { bbox: [38.4,-75.8,39.8,-75.0], name:'Delaware' },
  FL: { bbox: [24.5,-87.6,31.0,-80.0], name:'Florida' },
  GA: { bbox: [30.4,-85.6,35.0,-80.8], name:'Georgia' },
  HI: { bbox: [18.9,-160.2,22.2,-154.8], name:'Hawaii' },
  ID: { bbox: [42.0,-117.2,49.0,-111.0], name:'Idaho' },
  IL: { bbox: [36.9,-91.5,42.5,-87.5], name:'Illinois' },
  IN: { bbox: [37.8,-88.1,41.8,-84.8], name:'Indiana' },
  IA: { bbox: [40.4,-96.6,43.5,-90.1], name:'Iowa' },
  KS: { bbox: [37.0,-102.1,40.0,-94.6], name:'Kansas' },
  KY: { bbox: [36.5,-89.6,39.1,-81.9], name:'Kentucky' },
  LA: { bbox: [28.9,-94.0,33.0,-89.0], name:'Louisiana' },
  ME: { bbox: [43.1,-71.1,47.5,-67.0], name:'Maine' },
  MD: { bbox: [37.9,-79.5,39.7,-75.1], name:'Maryland' },
  MA: { bbox: [41.5,-73.5,42.9,-69.9], name:'Massachusetts' },
  MI: { bbox: [41.7,-90.4,48.3,-82.4], name:'Michigan' },
  MN: { bbox: [43.5,-97.2,49.4,-89.5], name:'Minnesota' },
  MS: { bbox: [30.2,-91.7,35.0,-88.1], name:'Mississippi' },
  MO: { bbox: [36.0,-95.8,40.6,-89.1], name:'Missouri' },
  MT: { bbox: [44.4,-116.0,49.0,-104.1], name:'Montana' },
  NE: { bbox: [40.0,-104.1,43.0,-95.3], name:'Nebraska' },
  NV: { bbox: [35.0,-120.0,42.0,-114.0], name:'Nevada' },
  NH: { bbox: [42.7,-72.6,45.3,-70.6], name:'New Hampshire' },
  NJ: { bbox: [38.9,-75.6,41.4,-74.0], name:'New Jersey' },
  NM: { bbox: [31.3,-109.1,37.0,-103.0], name:'New Mexico' },
  NY: { bbox: [40.5,-79.8,45.0,-71.9], name:'New York' },
  NC: { bbox: [33.8,-84.3,36.6,-75.5], name:'North Carolina' },
  ND: { bbox: [45.9,-104.1,49.0,-96.6], name:'North Dakota' },
  OH: { bbox: [38.4,-84.8,42.0,-80.5], name:'Ohio' },
  OK: { bbox: [33.6,-103.0,37.0,-94.4], name:'Oklahoma' },
  OR: { bbox: [42.0,-124.6,46.3,-116.5], name:'Oregon' },
  PA: { bbox: [39.7,-80.5,42.3,-74.7], name:'Pennsylvania' },
  RI: { bbox: [41.1,-71.9,42.0,-71.1], name:'Rhode Island' },
  SC: { bbox: [32.0,-83.4,35.2,-78.5], name:'South Carolina' },
  SD: { bbox: [42.5,-104.1,45.9,-96.4], name:'South Dakota' },
  TN: { bbox: [34.9,-90.3,36.7,-81.6], name:'Tennessee' },
  TX: { bbox: [25.8,-106.7,36.5,-93.5], name:'Texas' },
  UT: { bbox: [37.0,-114.1,42.0,-109.0], name:'Utah' },
  VT: { bbox: [42.7,-73.4,45.0,-71.5], name:'Vermont' },
  VA: { bbox: [36.5,-83.7,39.5,-75.2], name:'Virginia' },
  WA: { bbox: [45.5,-124.7,49.0,-116.9], name:'Washington' },
  WV: { bbox: [37.2,-82.6,40.6,-77.7], name:'West Virginia' },
  WI: { bbox: [42.5,-92.9,47.1,-86.8], name:'Wisconsin' },
  WY: { bbox: [41.0,-111.1,45.0,-104.1], name:'Wyoming' },
};

const PHOTO_MAP = {
  fall: 'forest_sunlight', cascade: 'waterfall_canyon', creek: 'waterfall_canyon',
  river: 'waterfall_canyon', waterfall: 'waterfall_canyon', lake: 'alpine_lake',
  pond: 'alpine_lake', tarn: 'alpine_lake', coast: 'coastal_cliffs',
  beach: 'coastal_cliffs', ocean: 'coastal_cliffs', desert: 'desert_red',
  canyon: 'desert_red', mesa: 'desert_red', glacier: 'mountain_snow',
  snow: 'mountain_snow', alpine: 'mountain_snow', peak: 'mountain_peak',
  summit: 'mountain_peak', mountain: 'mountain_peak', rain: 'rainforest',
  forest: 'forest_sunlight', redwood: 'forest_sunlight', national: 'mountain_green',
};

function guessPhotoType(name = '', desc = '') {
  const hay = (name + ' ' + desc).toLowerCase();
  for (const [kw, type] of Object.entries(PHOTO_MAP)) {
    if (hay.includes(kw)) return type;
  }
  return 'mountain_green';
}

function guessDifficulty(tags = {}) {
  const sac = tags.sac_scale || '';
  if (sac.includes('alpine') || sac.includes('demanding')) return 'hard';
  if (sac.includes('mountain')) return 'moderate';
  if (sac === 'hiking') return 'easy';
  // fallback: use distance
  const dist = parseFloat(tags.distance || tags.length || 0);
  if (dist > 12) return 'hard';
  if (dist > 5) return 'moderate';
  return 'easy';
}

function guessDistanceMi(tags = {}) {
  const raw = tags.distance || tags.length || '';
  const val = parseFloat(raw);
  if (!val) return null;
  if ((raw + '').toLowerCase().includes('km') || val > 50) return Math.round(val * 0.621 * 10) / 10;
  return Math.round(val * 10) / 10;
}

function buildTrailTags(tags = {}, difficulty) {
  const result = [];
  if (difficulty === 'easy') result.push('Easy');
  if (difficulty === 'moderate') result.push('Moderate');
  if (difficulty === 'hard') result.push('Challenging');
  if (tags.dog?.toLowerCase().includes('yes') || tags.dog === 'leashed') result.push('Dogs OK');
  if (tags.bicycle?.toLowerCase().includes('yes')) result.push('Bikes OK');
  if (tags.horse?.toLowerCase().includes('yes')) result.push('Horses OK');
  if (tags.operator?.toLowerCase().includes('national park') || tags.operator?.toLowerCase().includes('nps')) result.push('National Park');
  if (tags.operator?.toLowerCase().includes('forest service') || tags.operator?.toLowerCase().includes('usfs')) result.push('National Forest');
  const name = (tags.name || '').toLowerCase();
  if (name.includes('loop')) result.push('Loop');
  if (name.includes('summit') || name.includes('peak')) result.push('Summit');
  if (name.includes('waterfall') || name.includes('falls')) result.push('Waterfall');
  if (name.includes('lake') || name.includes('pond')) result.push('Lake');
  return result;
}

async function fetchStateTrails(stateCode, bbox, attempt = 1) {
  const [s, w, n, e] = bbox;
  const query = `[out:json][timeout:60];
relation["route"="hiking"]["name"](${s},${w},${n},${e});
out ${RESULTS_PER_STATE} tags center;`;

  try {
    const resp = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(75000), // 75s client-side timeout
    });
    if (!resp.ok) throw new Error(`Overpass ${resp.status}`);
    const data = await resp.json();
    return data.elements || [];
  } catch (err) {
    if (attempt < 4) {
      const wait = attempt * 8000; // 8s, 16s, 24s between retries
      process.stdout.write(`⏳ retry ${attempt}/3 (waiting ${wait/1000}s)... `);
      await sleep(wait);
      return fetchStateTrails(stateCode, bbox, attempt + 1);
    }
    throw err;
  }
}

function parseElements(elements, stateCode, stateName) {
  return elements
    .filter(el => el.center && el.tags?.name)
    .map(el => {
      const tags = el.tags;
      const lat = el.center.lat;
      const lng = el.center.lon;
      const difficulty = guessDifficulty(tags);
      const distMi = guessDistanceMi(tags);
      const trailTags = buildTrailTags(tags, difficulty);
      const city = tags['addr:city'] || tags.locality || stateName;
      return {
        id: `osm-${el.id}`,
        name: tags.name,
        location: `${city}, ${stateCode}`,
        state: stateCode,
        lat,
        lng,
        distance_mi: distMi,
        elevation_ft: null,
        difficulty,
        tags: trailTags,
        description: tags.description?.slice(0, 300) || null,
        photo_type: guessPhotoType(tags.name, tags.description),
        source: 'osm',
      };
    });
}

async function upsertBatch(trails) {
  const { error } = await sb.from('trails').upsert(trails, { onConflict: 'id' });
  if (error) throw new Error(`Supabase upsert error: ${error.message}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function stateHasTrails(stateCode) {
  const { data } = await sb.from('trails').select('id').eq('state', stateCode).limit(1);
  return data && data.length > 0;
}

async function main() {
  const states = Object.entries(STATES);
  let totalInserted = 0;
  const failed = [];

  console.log(`\n🏔  PathFind Trail Importer`);
  console.log(`📦  Fetching trails for ${states.length} US states from OpenStreetMap\n`);

  for (let i = 0; i < states.length; i++) {
    const [code, { bbox, name }] = states[i];

    // Check this specific state before importing
    const already = await stateHasTrails(code);
    if (already) {
      console.log(`[${i+1}/${states.length}] ${name} (${code})... ⏭  already imported`);
      continue;
    }

    process.stdout.write(`[${i+1}/${states.length}] ${name} (${code})... `);

    try {
      const elements = await fetchStateTrails(code, bbox);
      const trails = parseElements(elements, code, name);

      if (trails.length > 0) {
        for (let j = 0; j < trails.length; j += BATCH_SIZE) {
          await upsertBatch(trails.slice(j, j + BATCH_SIZE));
        }
        totalInserted += trails.length;
        console.log(`✅ ${trails.length} trails`);
      } else {
        console.log(`⚠️  0 trails found`);
      }
    } catch (err) {
      console.log(`❌ Failed: ${err.message}`);
      failed.push(code);
    }

    if (i < states.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n🎉 Done! Newly imported: ${totalInserted.toLocaleString()} trails`);

  if (failed.length > 0) {
    console.log(`⚠️  ${failed.length} states failed after retries: ${failed.join(', ')}`);
    console.log(`   Re-run the script to retry just those states.`);
  }

  const { count } = await sb.from('trails').select('*', { count: 'exact', head: true });
  console.log(`📊 Total trails in database: ${count?.toLocaleString()}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
