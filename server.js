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

// Returns a signed embed token for the authenticated user.
// In production: gate this behind your own session/auth middleware so only
// logged-in users get a token for their own unique_identifier.
app.post('/api/embed-token', (req, res) => {
  if (!SECRET) {
    return res.status(500).json({ error: 'VIASOCKET_EMBED_SECRET not set in .env' });
  }

  // Replace with your own user identity — a stable id from your auth system.
  // Here we accept it from the request body for demo purposes only.
  const userId = req.body.userId || 'demo-user-001';

  const token = jwt.sign(
    { org_id: ORG_ID, project_id: PROJECT_ID, unique_identifier: userId },
    SECRET,
    { algorithm: 'HS256' }
    // No exp — tokens are valid until the secret rotates (by design)
  );

  res.json({ token });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HireRadar running at http://localhost:${PORT}`));
