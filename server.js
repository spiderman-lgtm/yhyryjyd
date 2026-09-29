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

// Live jobs — proxy to Remotive, with India-aware search + preference filters
app.get('/api/jobs', async (req, res) => {
  try {
    const {
      search = '',
      category = '',
      location = '',   // Indian city or 'remote'
      jobType = '',    // full_time | part_time | contract
      salMin = '',     // LPA min (informational — used for client hint)
      limit = '50',
    } = req.query;

    // Build a smarter search query:
    // role keywords + city name + "india" so Remotive full-text hits India-relevant jobs
    const parts = [];
    if (search) parts.push(search.trim());
    if (location && location !== 'remote') {
      parts.push(location);
      if (!parts.join(' ').toLowerCase().includes('india')) parts.push('india');
    }
    const searchQuery = parts.join(' ');

    // Fetch from Remotive (free, no auth)
    let url = `https://remotive.com/api/remote-jobs?limit=${parseInt(limit, 10) || 50}`;
    if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
    if (category)    url += `&category=${encodeURIComponent(category)}`;

    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Remotive returned ${r.status}`);
    const data = await r.json();
    let jobs = data.jobs || [];

    // Server-side filter by job_type when specified
    if (jobType) {
      const needle = jobType.replace(/_/g, ' ').toLowerCase(); // "full_time" → "full time"
      jobs = jobs.filter(j => (j.job_type || '').toLowerCase().replace(/_/g, ' ').includes(needle));
    }

    res.json({ jobs, total: jobs.length });
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
