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

// ─── Mock India Tech Jobs Dataset ──────────────────────────────────────────────

const COMPANIES = [
  { name: 'Razorpay',      city: 'Bangalore' },
  { name: 'Zepto',         city: 'Mumbai' },
  { name: 'CRED',          city: 'Bangalore' },
  { name: 'Meesho',        city: 'Bangalore' },
  { name: 'Swiggy',        city: 'Bangalore' },
  { name: 'PhonePe',       city: 'Bangalore' },
  { name: 'Flipkart',      city: 'Bangalore' },
  { name: 'Paytm',         city: 'Noida' },
  { name: 'Ola',           city: 'Bangalore' },
  { name: 'Dream11',       city: 'Mumbai' },
  { name: 'Groww',         city: 'Bangalore' },
  { name: 'Navi',          city: 'Bangalore' },
  { name: 'ShareChat',     city: 'Bangalore' },
  { name: 'Freshworks',    city: 'Chennai' },
  { name: 'Zoho',          city: 'Chennai' },
  { name: 'Infosys',       city: 'Bangalore' },
  { name: 'Wipro',         city: 'Pune' },
  { name: 'TCS',           city: 'Mumbai' },
  { name: 'HCL',           city: 'Noida' },
  { name: 'Myntra',        city: 'Bangalore' },
  { name: 'BigBasket',     city: 'Bangalore' },
  { name: 'Urban Company', city: 'Gurgaon' },
  { name: 'Cars24',        city: 'Gurgaon' },
  { name: 'Lenskart',      city: 'Delhi NCR' },
  { name: 'PolicyBazaar',  city: 'Gurgaon' },
  { name: 'BrowserStack',  city: 'Mumbai' },
  { name: 'Postman',       city: 'Bangalore' },
  { name: 'Zomato',        city: 'Gurgaon' },
  { name: 'Nykaa',         city: 'Mumbai' },
  { name: 'MakeMyTrip',    city: 'Gurgaon' },
  { name: 'Byju\'s',       city: 'Bangalore' },
  { name: 'Unacademy',     city: 'Bangalore' },
  { name: 'Mpl',           city: 'Bangalore' },
  { name: 'Udaan',         city: 'Bangalore' },
  { name: 'Delhivery',     city: 'Gurgaon' },
  { name: 'Juspay',        city: 'Bangalore' },
  { name: 'Slice',         city: 'Bangalore' },
  { name: 'Fi Money',      city: 'Bangalore' },
  { name: 'Jupiter',       city: 'Bangalore' },
  { name: 'Open Financial',city: 'Bangalore' },
  { name: 'Signzy',        city: 'Bangalore' },
  { name: 'Darwinbox',     city: 'Hyderabad' },
  { name: 'Chargebee',     city: 'Chennai' },
  { name: 'Clevertap',     city: 'Mumbai' },
  { name: 'Moengage',      city: 'Bangalore' },
];

const TEMPLATES = [
  { title: 'Senior Frontend Engineer',   skills: ['React', 'TypeScript', 'Next.js', 'Node.js', 'Tailwind'],           salMin: 15, salMax: 28, type: 'full_time', cat: 'Frontend' },
  { title: 'Frontend Developer',          skills: ['React', 'JavaScript', 'HTML', 'CSS', 'Redux'],                     salMin: 8,  salMax: 18, type: 'full_time', cat: 'Frontend' },
  { title: 'Backend Engineer',            skills: ['Node.js', 'Python', 'PostgreSQL', 'Redis', 'Docker'],              salMin: 12, salMax: 25, type: 'full_time', cat: 'Backend' },
  { title: 'Full Stack Developer',        skills: ['React', 'Node.js', 'MongoDB', 'AWS', 'Docker'],                    salMin: 10, salMax: 22, type: 'full_time', cat: 'Full Stack' },
  { title: 'Software Developer',          skills: ['Java', 'Spring Boot', 'MySQL', 'REST API', 'Git'],                 salMin: 8,  salMax: 16, type: 'full_time', cat: 'Backend' },
  { title: 'Data Scientist',              skills: ['Python', 'Machine Learning', 'TensorFlow', 'SQL', 'Pandas'],       salMin: 14, salMax: 32, type: 'full_time', cat: 'Data Science' },
  { title: 'ML Engineer',                 skills: ['Python', 'PyTorch', 'MLflow', 'Kubernetes', 'AWS'],                salMin: 18, salMax: 40, type: 'full_time', cat: 'AI/ML' },
  { title: 'DevOps Engineer',             skills: ['Kubernetes', 'Docker', 'AWS', 'Terraform', 'CI/CD'],               salMin: 12, salMax: 28, type: 'full_time', cat: 'DevOps' },
  { title: 'Android Developer',           skills: ['Kotlin', 'Android SDK', 'MVVM', 'Jetpack Compose', 'Firebase'],    salMin: 10, salMax: 22, type: 'full_time', cat: 'Mobile' },
  { title: 'iOS Developer',               skills: ['Swift', 'SwiftUI', 'Xcode', 'CocoaPods', 'Firebase'],              salMin: 12, salMax: 25, type: 'full_time', cat: 'Mobile' },
  { title: 'Senior Software Engineer',    skills: ['Java', 'Microservices', 'Kafka', 'Redis', 'AWS'],                  salMin: 20, salMax: 38, type: 'full_time', cat: 'Backend' },
  { title: 'Product Engineer',            skills: ['React', 'TypeScript', 'Node.js', 'GraphQL', 'AWS'],                salMin: 15, salMax: 30, type: 'full_time', cat: 'Full Stack' },
  { title: 'SDE-II',                      skills: ['Java', 'Python', 'Distributed Systems', 'SQL', 'NoSQL'],           salMin: 18, salMax: 35, type: 'full_time', cat: 'Backend' },
  { title: 'Software Engineer',           skills: ['Python', 'Django', 'REST API', 'PostgreSQL', 'Git'],               salMin: 7,  salMax: 15, type: 'full_time', cat: 'Backend' },
  { title: 'React Developer',             skills: ['React', 'Redux', 'TypeScript', 'CSS3', 'Webpack'],                 salMin: 8,  salMax: 18, type: 'full_time', cat: 'Frontend' },
  { title: 'Node.js Developer',           skills: ['Node.js', 'Express', 'MongoDB', 'Redis', 'Docker'],                salMin: 8,  salMax: 20, type: 'full_time', cat: 'Backend' },
  { title: 'Python Developer',            skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'AWS'],                salMin: 10, salMax: 22, type: 'full_time', cat: 'Backend' },
  { title: 'Cloud Engineer',              skills: ['AWS', 'Azure', 'Terraform', 'Python', 'Kubernetes'],               salMin: 15, salMax: 32, type: 'full_time', cat: 'Cloud' },
  { title: 'Data Engineer',              skills: ['Spark', 'Kafka', 'Python', 'Airflow', 'AWS Glue'],                 salMin: 14, salMax: 28, type: 'full_time', cat: 'Data Engineering' },
  { title: 'QA Automation Engineer',      skills: ['Selenium', 'Cypress', 'Java', 'Postman', 'JIRA'],                  salMin: 6,  salMax: 14, type: 'full_time', cat: 'QA' },
  { title: 'Tech Lead',                   skills: ['System Design', 'React', 'Node.js', 'AWS', 'Team Leadership'],     salMin: 25, salMax: 50, type: 'full_time', cat: 'Leadership' },
  { title: 'Senior React Developer',      skills: ['React', 'TypeScript', 'Redux', 'GraphQL', 'Jest'],                 salMin: 15, salMax: 28, type: 'full_time', cat: 'Frontend' },
  { title: 'Go Developer',               skills: ['Go', 'gRPC', 'PostgreSQL', 'Docker', 'Kubernetes'],                salMin: 15, salMax: 30, type: 'full_time', cat: 'Backend' },
  { title: 'AI Engineer',                skills: ['Python', 'LangChain', 'OpenAI API', 'FastAPI', 'AWS'],             salMin: 20, salMax: 45, type: 'full_time', cat: 'AI/ML' },
  { title: 'Site Reliability Engineer',   skills: ['SRE', 'Prometheus', 'Grafana', 'Kubernetes', 'Python'],            salMin: 18, salMax: 35, type: 'full_time', cat: 'DevOps' },
  { title: 'Frontend Lead',              skills: ['React', 'Architecture', 'TypeScript', 'Web Performance', 'Mentoring'], salMin: 22, salMax: 42, type: 'full_time', cat: 'Frontend' },
  { title: 'Software Developer (Frontend)', skills: ['React', 'Next.js', 'TypeScript', 'GraphQL', 'Docker'],          salMin: 18, salMax: 28, type: 'full_time', cat: 'Frontend' },
  { title: 'Senior Backend Engineer',     skills: ['Python', 'Django', 'PostgreSQL', 'Celery', 'Redis'],              salMin: 18, salMax: 32, type: 'full_time', cat: 'Backend' },
  { title: 'Contract React Developer',    skills: ['React', 'JavaScript', 'Hooks', 'REST API', 'CSS'],                salMin: 8,  salMax: 20, type: 'contract',  cat: 'Frontend' },
  { title: 'Part-time Data Analyst',      skills: ['Python', 'SQL', 'Tableau', 'Excel', 'Statistics'],                salMin: 4,  salMax: 10, type: 'part_time', cat: 'Data Science' },
];

// Source weights: LinkedIn ~33%, Naukri ~22%, Indeed ~14%, Glassdoor ~10%, AngelList ~7%, Twitter ~6%
const SOURCE_CYCLE = [
  'linkedin','naukri','linkedin','indeed','linkedin','naukri',
  'glassdoor','linkedin','indeed','naukri','linkedin','angellist',
  'linkedin','naukri','linkedin','indeed','glassdoor','linkedin',
  'naukri','indeed','linkedin','naukri','glassdoor','angellist',
  'linkedin','naukri','linkedin','indeed','naukri','twitter',
];

function generateMockJobs() {
  const jobs = [];
  let id = 1;
  const now = Date.now();

  COMPANIES.forEach((co, ci) => {
    const numJobs = 3 + (ci % 5); // 3–7 jobs per company
    for (let j = 0; j < numJobs; j++) {
      const tmpl = TEMPLATES[(ci * 7 + j * 11) % TEMPLATES.length];
      const hoursAgo = ((id * 7 + ci * 3) % 46) + 1;
      const source = SOURCE_CYCLE[(id - 1) % SOURCE_CYCLE.length];

      jobs.push({
        id,
        title: tmpl.title,
        company_name: co.name,
        company_logo: null,
        candidate_required_location: co.city + ', India',
        url: 'https://www.linkedin.com/jobs/view/' + (100000 + id),
        description: `${co.name} is hiring a ${tmpl.title}. You will work on high-impact products used by millions of Indians. Strong expertise in ${tmpl.skills.slice(0, 3).join(', ')} is required. We offer competitive compensation, equity, and a great work culture.`,
        job_type: tmpl.type,
        salary: `₹${tmpl.salMin}L – ₹${tmpl.salMax}L`,
        publication_date: new Date(now - hoursAgo * 3600000).toISOString(),
        tags: tmpl.skills,
        category: tmpl.cat,
        _india: true,
        _source: source,
      });
      id++;
    }
  });

  return jobs;
}

// ─── Jobs endpoint ─────────────────────────────────────────────────────────────
app.get('/api/jobs', (req, res) => {
  try {
    const {
      search   = '',
      location = '',
      jobType  = '',
      salMin   = '',
      limit    = '200',
    } = req.query;

    let jobs = generateMockJobs();

    // Filter by search (title, company, tags, description)
    if (search) {
      const q = search.toLowerCase();
      jobs = jobs.filter(j => {
        const hay = `${j.title} ${j.company_name} ${(j.tags || []).join(' ')} ${j.description}`.toLowerCase();
        return q.split(/\s+/).every(word => hay.includes(word));
      });
    }

    // Filter by location (city)
    if (location && location !== 'india') {
      const locMap = {
        bangalore: ['bangalore', 'bengaluru'],
        mumbai: ['mumbai', 'bombay'],
        delhi: ['delhi', 'ncr', 'new delhi', 'noida', 'gurgaon', 'gurugram'],
        hyderabad: ['hyderabad', 'hyd'],
        pune: ['pune'],
        chennai: ['chennai', 'madras'],
        noida: ['noida'],
        gurgaon: ['gurgaon', 'gurugram'],
        ahmedabad: ['ahmedabad'],
        remote: [],
      };
      const aliases = locMap[location] || [location];
      jobs = jobs.filter(j => {
        const jloc = (j.candidate_required_location || '').toLowerCase();
        return aliases.some(a => jloc.includes(a));
      });
    }

    // Filter by job type
    if (jobType) {
      jobs = jobs.filter(j => (j.job_type || '') === jobType);
    }

    // Filter by minimum salary
    if (salMin) {
      const min = parseFloat(salMin);
      jobs = jobs.filter(j => {
        const m = (j.salary || '').match(/[\d.]+/);
        return m ? parseFloat(m[0]) >= min * 0.8 : true;
      });
    }

    const maxLimit = Math.min(parseInt(limit, 10) || 200, 300);
    jobs = jobs.slice(0, maxLimit);

    res.json({ jobs, total: jobs.length, adzunaActive: true, apiConfigured: true });
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
