require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ORG_ID = '4160';
const PROJECT_ID = 'proj9XH3L4TM';
const SECRET = process.env.VIASOCKET_EMBED_SECRET;

// Embed token — signed HS256 JWT, no exp
app.post('/api/embed-token', (req, res) => {
  if (!SECRET) return res.status(500).json({ error: 'VIASOCKET_EMBED_SECRET not set' });
  const userId = req.body.userId || 'demo-user-001';
  const token = jwt.sign(
    { org_id: ORG_ID, project_id: PROJECT_ID, unique_identifier: userId },
    SECRET,
    { algorithm: 'HS256' }
  );
  res.json({ token });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function strHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const INDIA_CITIES = {
  bangalore: 'Bengaluru', mumbai: 'Mumbai', delhi: 'Delhi NCR',
  hyderabad: 'Hyderabad', pune: 'Pune', chennai: 'Chennai',
  kolkata: 'Kolkata', noida: 'Noida', gurgaon: 'Gurugram',
  ahmedabad: 'Ahmedabad', india: 'India', remote: 'Remote',
};

// Map Adzuna job → our common job schema (matches Remotive field names)
function mapAdzunaJob(j) {
  const salMinINR = j.salary_min || 0;
  const salMaxINR = j.salary_max || salMinINR * 1.4;
  const salStr = salMinINR
    ? `₹${Math.round(salMinINR / 100000)}–${Math.round(salMaxINR / 100000)} LPA`
    : '';
  const desc = (j.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    id: strHash(String(j.id || j.redirect_url || Math.random())),
    title: j.title || 'Untitled',
    company_name: j.company?.display_name || 'Company',
    company_logo: null,
    candidate_required_location: j.location?.display_name || 'India',
    url: j.redirect_url || '#',
    description: desc.slice(0, 400) + (desc.length > 400 ? '…' : ''),
    job_type: j.contract_type === 'permanent' ? 'full_time'
            : j.contract_type === 'contract' ? 'contract' : 'full_time',
    salary: salStr,
    publication_date: j.created || new Date().toISOString(),
    tags: [j.category?.label].filter(Boolean),
    _india: true,
  };
}

async function fetchAdzunaJobs({ search, location, jobType, limit, page = 1 }) {
  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    console.warn('Adzuna keys not configured');
    return [];
  }

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: Math.min(parseInt(limit) || 20, 50),
    'content-type': 'application/json',
  });
  if (search)   params.set('what', search);
  if (location && location !== 'remote') {
    params.set('where', INDIA_CITIES[location] || location);
  }
  if (jobType === 'contract') params.set('contract', '1');
  if (jobType === 'part_time') params.set('part_time', '1');
  if (jobType === 'full_time') params.set('permanent', '1');

  const pageNum = Math.max(1, parseInt(page) || 1);
  const url = `https://api.adzuna.com/v1/api/jobs/in/search/${pageNum}?${params}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) { console.warn(`Adzuna ${r.status} for query: ${url}`); return []; }
    const data = await r.json();
    console.log(`Adzuna page ${pageNum}: ${(data.results||[]).length} results (search="${search}" loc="${location}")`);
    return (data.results || []).map(mapAdzunaJob);
  } catch (e) {
    clearTimeout(timer);
    console.warn(`Adzuna fetch error: ${e.message}`);
    return [];
  }
}

// ─── Jobs endpoint ─────────────────────────────────────────────────────────────
app.get('/api/jobs', async (req, res) => {
  try {
    const {
      search = '',
      category = '',
      location = '',
      jobType = '',
      salMin = '',
      limit = '50',
    } = req.query;

    const fetchLimit = Math.min(parseInt(limit, 10) || 50, 50);

    // India-only: Adzuna India. Two pages for more results when no specific city filter.
    const page = parseInt(req.query.page, 10) || 1;
    const [p1, p2] = await Promise.allSettled([
      fetchAdzunaJobs({ search, location, jobType, limit: fetchLimit, page }),
      // second page for variety when limit allows and no city filter
      fetchLimit >= 30 && !location
        ? fetchAdzunaJobs({ search, location, jobType, limit: Math.floor(fetchLimit / 2), page: 2 })
        : Promise.resolve([]),
    ]);

    let jobs = p1.status === 'fulfilled' ? p1.value : [];
    const extra = p2.status === 'fulfilled' ? p2.value : [];
    // dedupe by id
    const seen = new Set(jobs.map(j => j.id));
    extra.forEach(j => { if (!seen.has(j.id)) { seen.add(j.id); jobs.push(j); } });

    // Fallback: if specific query returned nothing, try a broad search
    if (!jobs.length) {
      const broadSearch = search || 'developer';
      console.log(`Primary returned 0. Trying broad fallback: "${broadSearch}"`);
      const fallback = await fetchAdzunaJobs({ search: broadSearch, location: '', jobType: '', limit: 50, page: 1 });
      jobs = fallback;
    }

    res.json({ jobs, total: jobs.length, adzunaActive: jobs.length > 0, apiConfigured: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) });
  } catch (e) {
    res.status(500).json({ error: e.message, jobs: [] });
  }
});

// Resume parsing — multipart upload → Claude extracts job preferences
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/parse-resume', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    const client = new Anthropic({ apiKey });
    const base64 = req.file.buffer.toString('base64');
    const mime = req.file.mimetype || 'application/pdf';

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: mime, data: base64 },
          },
          {
            type: 'text',
            text: `You are a job-preference extractor. Read this resume carefully and return ONLY a valid JSON object (no markdown, no explanation) with these exact fields:
{
  "role": "<the most likely job title/role they are applying for, e.g. 'React Developer', 'Backend Engineer', 'Data Analyst'>",
  "skills": "<comma-separated list of their top 5-8 technical skills>",
  "exp": "<one of: fresher | junior | mid | senior | lead — based on years of experience>",
  "type": "<one of: full_time | contract | part_time — infer from context or leave empty string>",
  "location": "<one of: bangalore | mumbai | delhi | hyderabad | pune | chennai | kolkata | noida | gurgaon | ahmedabad | india | remote — based on their current city or preference, or empty string>",
  "salMin": "<one of: 5 | 8 | 10 | 15 | 20 | 30 | 50 — estimated minimum salary in LPA they would expect, or empty string>"
}
Return ONLY the JSON object. No other text.`,
          },
        ],
      }],
    });

    const raw = message.content.find(b => b.type === 'text')?.text || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const prefs = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    res.json({ prefs });
  } catch (e) {
    console.error('parse-resume error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HireRadar running at http://localhost:${PORT}`));
