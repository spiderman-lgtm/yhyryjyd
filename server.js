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

// Live jobs — proxy to Remotive public API (no auth, CORS-friendly)
app.get('/api/jobs', async (req, res) => {
  try {
    const { search = '', category = '', limit = '30' } = req.query;
    let url = `https://remotive.com/api/remote-jobs?limit=${parseInt(limit, 10) || 30}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`Remotive returned ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message, jobs: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HireRadar running at http://localhost:${PORT}`));
