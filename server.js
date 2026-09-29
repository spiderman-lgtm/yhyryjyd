require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HireRadar running at http://localhost:${PORT}`));
