require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { createLiveSource } = require('./jobs-live');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ORG_ID = '4160';
const PROJECT_ID = 'projCdg05SQs';
const SECRET = process.env.VIASOCKET_EMBED_SECRET;

// ─── Per-user identity (one unique_identifier per browser, forever) ────────────
const UID_COOKIE = 'hr_uid';
const COOKIE_KEY = process.env.COOKIE_SECRET
  || (SECRET && crypto.createHmac('sha256', SECRET).update('hireradar-uid-cookie').digest())
  || crypto.randomBytes(32);

function signUid(uid) {
  return crypto.createHmac('sha256', COOKIE_KEY).update(uid).digest('base64url');
}

function readUid(req) {
  const raw = (req.headers.cookie || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(UID_COOKIE + '='));
  if (!raw) return null;
  const [uid, sig] = raw.slice(UID_COOKIE.length + 1).split('.');
  if (!uid || !sig || !/^hr_[0-9a-f-]{36}$/.test(uid)) return null;
  const expected = signUid(uid);
  if (sig.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? uid : null;
}

app.use('/api', (req, res, next) => {
  let uid = readUid(req);
  if (!uid) {
    uid = 'hr_' + crypto.randomUUID();
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${UID_COOKIE}=${uid}.${signUid(uid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=315360000${secure}`);
  }
  req.uid = uid;
  next();
});

// ─── User auth store ────────────────────────────────────────────────────────────
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
let usersStore = {};
try { usersStore = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch {}

function saveUsers() {
  try {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    fs.writeFileSync(USERS_FILE + '.tmp', JSON.stringify(usersStore, null, 2));
    fs.renameSync(USERS_FILE + '.tmp', USERS_FILE);
  } catch (e) { console.error('[users] save failed:', e.message); }
}

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

// Auth: protect / → serve login page if not logged in
app.get('/', (req, res, next) => {
  const uid = readUid(req);
  const email = uid && Object.values(usersStore).find(u => u.uid === uid)?.email;
  if (!email) return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  next();
});

// Signup
app.post('/auth/signup', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || password.length < 6) return res.status(400).json({ error: 'Email and password (min 6 chars) required' });
  const key = email.toLowerCase().trim();
  if (usersStore[key]) return res.status(409).json({ error: 'Email already registered' });
  const passwordHash = await bcrypt.hash(password, 10);
  const uid = 'hr_' + crypto.randomUUID();
  usersStore[key] = { uid, email: key, name: name || key.split('@')[0], role: key === ADMIN_EMAIL ? 'admin' : 'user', createdAt: new Date().toISOString(), passwordHash };
  saveUsers();
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${UID_COOKIE}=${uid}.${signUid(uid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=315360000${secure}`);
  res.json({ ok: true, name: usersStore[key].name, role: usersStore[key].role });
});

// Login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const key = email.toLowerCase().trim();
  const user = usersStore[key];
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${UID_COOKIE}=${user.uid}.${signUid(user.uid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=315360000${secure}`);
  res.json({ ok: true, name: user.name, role: user.role });
});

// Logout
app.post('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${UID_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ ok: true });
});

// Current user info
app.get('/api/auth/me', (req, res) => {
  const uid = readUid(req);
  if (!uid) return res.status(401).json({ error: 'Not logged in' });
  const user = Object.values(usersStore).find(u => u.uid === uid);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ name: user.name, email: user.email, role: user.role });
});

// Admin: list users
app.get('/api/admin/users', (req, res) => {
  const uid = readUid(req);
  const user = uid && Object.values(usersStore).find(u => u.uid === uid);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const list = Object.values(usersStore).map(u => ({
    name: u.name, email: u.email, role: u.role, createdAt: u.createdAt,
  }));
  res.json({ users: list });
});

app.post('/api/embed-token', (req, res) => {
  if (!SECRET) return res.status(500).json({ error: 'VIASOCKET_EMBED_SECRET not set' });
  const token = jwt.sign(
    { org_id: ORG_ID, project_id: PROJECT_ID, unique_identifier: req.uid },
    SECRET,
    { algorithm: 'HS256' }
  );
  res.json({ token });
});

// ─── 250+ India Company Dataset ────────────────────────────────────────────────

const COMPANIES = [
  // Fintech
  { name:'Razorpay',          city:'Bangalore' },
  { name:'PhonePe',           city:'Bangalore' },
  { name:'Paytm',             city:'Noida' },
  { name:'Groww',             city:'Bangalore' },
  { name:'Navi',              city:'Bangalore' },
  { name:'BharatPe',          city:'Delhi NCR' },
  { name:'Slice',             city:'Bangalore' },
  { name:'Fi Money',          city:'Bangalore' },
  { name:'Jupiter',           city:'Bangalore' },
  { name:'Cashfree Payments', city:'Bangalore' },
  { name:'Juspay',            city:'Bangalore' },
  { name:'Open Financial',    city:'Bangalore' },
  { name:'Perfios',           city:'Bangalore' },
  { name:'Signzy',            city:'Bangalore' },
  { name:'M2P Fintech',       city:'Chennai' },
  { name:'Mobikwik',          city:'Gurgaon' },
  { name:'Fampay',            city:'Bangalore' },
  { name:'Jar App',           city:'Bangalore' },
  { name:'Niyo',              city:'Bangalore' },
  { name:'Smallcase',         city:'Bangalore' },
  { name:'INDmoney',          city:'Gurgaon' },
  { name:'ET Money',          city:'Gurgaon' },
  { name:'KreditBee',         city:'Bangalore' },
  { name:'MoneyView',         city:'Bangalore' },
  { name:'Rupeek',            city:'Bangalore' },
  { name:'Stashfin',          city:'Delhi NCR' },
  { name:'LoanTap',           city:'Pune' },
  { name:'Pine Labs',         city:'Noida' },
  { name:'EzetapByRazorpay',  city:'Bangalore' },
  { name:'PayNearby',         city:'Mumbai' },

  // E-commerce & Quick Commerce
  { name:'Flipkart',          city:'Bangalore' },
  { name:'Meesho',            city:'Bangalore' },
  { name:'Zepto',             city:'Mumbai' },
  { name:'Nykaa',             city:'Mumbai' },
  { name:'Myntra',            city:'Bangalore' },
  { name:'BigBasket',         city:'Bangalore' },
  { name:'Blinkit',           city:'Gurgaon' },
  { name:'Snapdeal',          city:'Delhi NCR' },
  { name:'IndiaMART',         city:'Noida' },
  { name:'Udaan',             city:'Bangalore' },
  { name:'Zetwerk',           city:'Bangalore' },
  { name:'Ofbusiness',        city:'Gurgaon' },
  { name:'Moglix',            city:'Noida' },
  { name:'Infra.Market',      city:'Mumbai' },
  { name:'JioMart',           city:'Mumbai' },
  { name:'Ninjacart',         city:'Bangalore' },
  { name:'Porter',            city:'Bangalore' },
  { name:'Pepperfry',         city:'Mumbai' },
  { name:'FabIndia Digital',  city:'Delhi NCR' },
  { name:'Mamaearth',         city:'Gurgaon' },

  // Food & Delivery
  { name:'Swiggy',            city:'Bangalore' },
  { name:'Zomato',            city:'Gurgaon' },
  { name:'Dunzo',             city:'Bangalore' },
  { name:'Shadowfax',         city:'Bangalore' },
  { name:'Shiprocket',        city:'Delhi NCR' },
  { name:'Delhivery',         city:'Gurgaon' },
  { name:'BlackBuck',         city:'Bangalore' },
  { name:'Rivigo',            city:'Gurgaon' },
  { name:'FarEye',            city:'Noida' },
  { name:'Loadshare Networks',city:'Bangalore' },

  // Mobility & EV
  { name:'Ola',               city:'Bangalore' },
  { name:'Rapido',            city:'Bangalore' },
  { name:'Ola Electric',      city:'Bangalore' },
  { name:'Bounce',            city:'Bangalore' },
  { name:'Yulu',              city:'Bangalore' },
  { name:'Euler Motors',      city:'Delhi NCR' },
  { name:'Ather Energy',      city:'Bangalore' },
  { name:'Simple Energy',     city:'Bangalore' },

  // Gaming & Entertainment
  { name:'Dream11',           city:'Mumbai' },
  { name:'MPL',               city:'Bangalore' },
  { name:'Games24x7',         city:'Mumbai' },
  { name:'WinZO',             city:'Delhi NCR' },
  { name:'Nazara Technologies',city:'Mumbai' },
  { name:'GamesKraft',        city:'Bangalore' },
  { name:'Junglee Games',     city:'Bangalore' },
  { name:'InMobi',            city:'Bangalore' },
  { name:'JioSaavn',          city:'Mumbai' },
  { name:'Hungama Digital',   city:'Mumbai' },
  { name:'Dailyhunt',         city:'Bangalore' },
  { name:'ShareChat',         city:'Bangalore' },
  { name:'Koo App',           city:'Bangalore' },
  { name:'Lokal',             city:'Hyderabad' },
  { name:'Stage',             city:'Gurgaon' },

  // SaaS & Dev Tools
  { name:'Freshworks',        city:'Chennai' },
  { name:'Zoho',              city:'Chennai' },
  { name:'BrowserStack',      city:'Mumbai' },
  { name:'Postman',           city:'Bangalore' },
  { name:'Chargebee',         city:'Chennai' },
  { name:'Clevertap',         city:'Mumbai' },
  { name:'Moengage',          city:'Bangalore' },
  { name:'Darwinbox',         city:'Hyderabad' },
  { name:'LeadSquared',       city:'Bangalore' },
  { name:'Wingify',           city:'Delhi NCR' },
  { name:'WebEngage',         city:'Mumbai' },
  { name:'Netcore Cloud',     city:'Mumbai' },
  { name:'Mindtickle',        city:'Pune' },
  { name:'Icertis',           city:'Pune' },
  { name:'Capillary Technologies',city:'Bangalore' },
  { name:'BetterPlace',       city:'Bangalore' },
  { name:'HackerEarth',       city:'Bangalore' },
  { name:'Exotel',            city:'Bangalore' },
  { name:'Yellow.ai',         city:'Bangalore' },
  { name:'Gupshup',           city:'Mumbai' },
  { name:'Route Mobile',      city:'Mumbai' },
  { name:'Tanla Platforms',   city:'Hyderabad' },
  { name:'Mu Sigma',          city:'Bangalore' },
  { name:'Fractal Analytics', city:'Mumbai' },
  { name:'LatentView Analytics',city:'Chennai' },
  { name:'Subex',             city:'Bangalore' },
  { name:'Tata Communications',city:'Mumbai' },
  { name:'Airtel Digital',    city:'Gurgaon' },
  { name:'JioCloud',          city:'Mumbai' },
  { name:'Unison',            city:'Hyderabad' },

  // Edtech
  { name:"Byju's",            city:'Bangalore' },
  { name:'Unacademy',         city:'Bangalore' },
  { name:'Vedantu',           city:'Bangalore' },
  { name:'Toppr',             city:'Mumbai' },
  { name:'upGrad',            city:'Mumbai' },
  { name:'Great Learning',    city:'Bangalore' },
  { name:'Scaler',            city:'Bangalore' },
  { name:'Newton School',     city:'Bangalore' },
  { name:'Coding Ninjas',     city:'Noida' },
  { name:'InterviewBit',      city:'Bangalore' },
  { name:'Eruditus',          city:'Mumbai' },
  { name:'Physics Wallah',    city:'Noida' },
  { name:'Skill-Lync',        city:'Chennai' },

  // Healthtech
  { name:'Practo',            city:'Bangalore' },
  { name:'PharmEasy',         city:'Mumbai' },
  { name:'Tata 1mg',          city:'Gurgaon' },
  { name:'Netmeds',           city:'Chennai' },
  { name:'Cure.fit',          city:'Bangalore' },
  { name:'HealthifyMe',       city:'Bangalore' },
  { name:'Innovaccer',        city:'Noida' },
  { name:'Pristyn Care',      city:'Gurgaon' },
  { name:'Medikabazaar',      city:'Mumbai' },
  { name:'Portea Medical',    city:'Bangalore' },
  { name:'mfine',             city:'Bangalore' },
  { name:'Niramai',           city:'Bangalore' },

  // Insurtech
  { name:'PolicyBazaar',      city:'Gurgaon' },
  { name:'Acko Insurance',    city:'Bangalore' },
  { name:'Digit Insurance',   city:'Bangalore' },
  { name:'Turtlemint',        city:'Mumbai' },
  { name:'Insurance Dekho',   city:'Gurgaon' },
  { name:'Coverfox',          city:'Mumbai' },

  // Proptech
  { name:'NoBroker',          city:'Bangalore' },
  { name:'Square Yards',      city:'Gurgaon' },
  { name:'Housing.com',       city:'Mumbai' },
  { name:'MagicBricks',       city:'Noida' },
  { name:'99acres',           city:'Noida' },
  { name:'Livspace',          city:'Bangalore' },
  { name:'HomeLane',          city:'Bangalore' },

  // IT Services
  { name:'Infosys',           city:'Bangalore' },
  { name:'Wipro',             city:'Pune' },
  { name:'TCS',               city:'Mumbai' },
  { name:'HCL Technologies',  city:'Noida' },
  { name:'Tech Mahindra',     city:'Pune' },
  { name:'Mphasis',           city:'Bangalore' },
  { name:'L&T Technology',    city:'Pune' },
  { name:'Persistent Systems',city:'Pune' },
  { name:'Hexaware',          city:'Mumbai' },
  { name:'Mindtree',          city:'Bangalore' },
  { name:'Coforge',           city:'Noida' },
  { name:'KPIT Technologies', city:'Pune' },
  { name:'Tata Elxsi',        city:'Bangalore' },
  { name:'Cyient',            city:'Hyderabad' },
  { name:'Zensar Technologies',city:'Pune' },
  { name:'Birlasoft',         city:'Noida' },
  { name:'Quest Global',      city:'Bangalore' },
  { name:'Mastech Digital',   city:'Hyderabad' },
  { name:'Kellton Tech',      city:'Hyderabad' },
  { name:'NIIT Technologies', city:'Noida' },

  // Global MNCs - India offices
  { name:'Google India',      city:'Hyderabad' },
  { name:'Microsoft India',   city:'Hyderabad' },
  { name:'Amazon India',      city:'Bangalore' },
  { name:'Apple India',       city:'Hyderabad' },
  { name:'Adobe India',       city:'Noida' },
  { name:'Salesforce India',  city:'Hyderabad' },
  { name:'Oracle India',      city:'Hyderabad' },
  { name:'IBM India',         city:'Bangalore' },
  { name:'Cisco India',       city:'Bangalore' },
  { name:'Intel India',       city:'Bangalore' },
  { name:'Samsung R&D India', city:'Bangalore' },
  { name:'SAP India',         city:'Bangalore' },
  { name:'ServiceNow India',  city:'Hyderabad' },
  { name:'VMware India',      city:'Bangalore' },
  { name:'Goldman Sachs India',city:'Bangalore' },
  { name:'Morgan Stanley India',city:'Mumbai' },
  { name:'JPMorgan India',    city:'Mumbai' },
  { name:'Walmart Global Tech',city:'Bangalore' },
  { name:'Qualcomm India',    city:'Hyderabad' },
  { name:'Nvidia India',      city:'Pune' },
  { name:'Atlassian India',   city:'Bangalore' },
  { name:'Stripe India',      city:'Bangalore' },
  { name:'Twilio India',      city:'Bangalore' },
  { name:'Databricks India',  city:'Bangalore' },
  { name:'Uber India',        city:'Hyderabad' },
  { name:'PayPal India',      city:'Chennai' },
  { name:'Accenture India',   city:'Mumbai' },
  { name:'Capgemini India',   city:'Mumbai' },
  { name:'Cognizant',         city:'Chennai' },
  { name:'Deloitte India',    city:'Hyderabad' },
  { name:'EY India',          city:'Mumbai' },
  { name:'KPMG India',        city:'Gurgaon' },
  { name:'Intuit India',      city:'Bangalore' },
  { name:'Dell India',        city:'Hyderabad' },
  { name:'HP India',          city:'Bangalore' },
  { name:'NetApp India',      city:'Bangalore' },
  { name:'Bosch India',       city:'Bangalore' },
  { name:'Siemens India',     city:'Pune' },
  { name:'Honeywell India',   city:'Hyderabad' },
  { name:'GE India',          city:'Hyderabad' },
  { name:'Micron India',      city:'Hyderabad' },
  { name:'Synopsys India',    city:'Hyderabad' },
  { name:'Cadence India',     city:'Pune' },
  { name:'Texas Instruments', city:'Bangalore' },
  { name:'Broadcom India',    city:'Bangalore' },
  { name:'Marvell India',     city:'Pune' },
  { name:'Arm India',         city:'Bangalore' },
  { name:'MediaTek India',    city:'Hyderabad' },
  { name:'ASML India',        city:'Hyderabad' },
  { name:'Booking.com India', city:'Bangalore' },
  { name:'Expedia India',     city:'Gurgaon' },
  { name:'LinkedIn India',    city:'Bangalore' },
  { name:'Meta India',        city:'Hyderabad' },
  { name:'Twitter India',     city:'Delhi NCR' },
  { name:'Spotify India',     city:'Mumbai' },
  { name:'Netflix India',     city:'Mumbai' },
  { name:'Mastercard India',  city:'Gurgaon' },
  { name:'Visa India',        city:'Bangalore' },
  { name:'American Express India',city:'Gurgaon' },
  { name:'Deutsche Bank India',city:'Pune' },
  { name:'Barclays India',    city:'Pune' },
  { name:'HSBC India Tech',   city:'Hyderabad' },
  { name:'Standard Chartered India',city:'Chennai' },
  { name:'Citi India',        city:'Mumbai' },

  // Consumer & Lifestyle
  { name:'Boat',              city:'Delhi NCR' },
  { name:'Noise',             city:'Gurgaon' },
  { name:'Lenskart',          city:'Gurgaon' },
  { name:'Cars24',            city:'Gurgaon' },
  { name:'OYO',               city:'Gurgaon' },
  { name:'MakeMyTrip',        city:'Gurgaon' },
  { name:'Ixigo',             city:'Noida' },
  { name:'EaseMyTrip',        city:'Delhi NCR' },
  { name:'Yatra',             city:'Gurgaon' },
  { name:'Club Mahindra',     city:'Mumbai' },
];

const TEMPLATES = [
  { title:'Senior Frontend Engineer',    skills:['React','TypeScript','Next.js','Node.js','Tailwind'],            salMin:15, salMax:28, type:'full_time', cat:'Frontend' },
  { title:'Frontend Developer',          skills:['React','JavaScript','HTML','CSS','Redux'],                      salMin:8,  salMax:18, type:'full_time', cat:'Frontend' },
  { title:'Backend Engineer',            skills:['Node.js','Python','PostgreSQL','Redis','Docker'],               salMin:12, salMax:25, type:'full_time', cat:'Backend' },
  { title:'Full Stack Developer',        skills:['React','Node.js','MongoDB','AWS','Docker'],                     salMin:10, salMax:22, type:'full_time', cat:'Full Stack' },
  { title:'Software Developer',          skills:['Java','Spring Boot','MySQL','REST API','Git'],                  salMin:8,  salMax:16, type:'full_time', cat:'Backend' },
  { title:'Data Scientist',              skills:['Python','Machine Learning','TensorFlow','SQL','Pandas'],        salMin:14, salMax:32, type:'full_time', cat:'Data Science' },
  { title:'ML Engineer',                 skills:['Python','PyTorch','MLflow','Kubernetes','AWS'],                 salMin:18, salMax:40, type:'full_time', cat:'AI/ML' },
  { title:'DevOps Engineer',             skills:['Kubernetes','Docker','AWS','Terraform','CI/CD'],                salMin:12, salMax:28, type:'full_time', cat:'DevOps' },
  { title:'Android Developer',           skills:['Kotlin','Android SDK','MVVM','Jetpack Compose','Firebase'],     salMin:10, salMax:22, type:'full_time', cat:'Mobile' },
  { title:'iOS Developer',               skills:['Swift','SwiftUI','Xcode','CocoaPods','Firebase'],               salMin:12, salMax:25, type:'full_time', cat:'Mobile' },
  { title:'Senior Software Engineer',    skills:['Java','Microservices','Kafka','Redis','AWS'],                   salMin:20, salMax:38, type:'full_time', cat:'Backend' },
  { title:'Product Engineer',            skills:['React','TypeScript','Node.js','GraphQL','AWS'],                 salMin:15, salMax:30, type:'full_time', cat:'Full Stack' },
  { title:'SDE-II',                      skills:['Java','Python','Distributed Systems','SQL','NoSQL'],            salMin:18, salMax:35, type:'full_time', cat:'Backend' },
  { title:'Software Engineer',           skills:['Python','Django','REST API','PostgreSQL','Git'],                salMin:7,  salMax:15, type:'full_time', cat:'Backend' },
  { title:'React Developer',             skills:['React','Redux','TypeScript','CSS3','Webpack'],                  salMin:8,  salMax:18, type:'full_time', cat:'Frontend' },
  { title:'Node.js Developer',           skills:['Node.js','Express','MongoDB','Redis','Docker'],                 salMin:8,  salMax:20, type:'full_time', cat:'Backend' },
  { title:'Python Developer',            skills:['Python','FastAPI','PostgreSQL','Docker','AWS'],                 salMin:10, salMax:22, type:'full_time', cat:'Backend' },
  { title:'Cloud Engineer',              skills:['AWS','Azure','Terraform','Python','Kubernetes'],                salMin:15, salMax:32, type:'full_time', cat:'DevOps' },
  { title:'Data Engineer',               skills:['Spark','Kafka','Python','Airflow','AWS Glue'],                 salMin:14, salMax:28, type:'full_time', cat:'Data Engineering' },
  { title:'QA Automation Engineer',      skills:['Selenium','Cypress','Java','Postman','JIRA'],                   salMin:6,  salMax:14, type:'full_time', cat:'QA' },
  { title:'Tech Lead',                   skills:['System Design','React','Node.js','AWS','Team Leadership'],      salMin:25, salMax:50, type:'full_time', cat:'Leadership' },
  { title:'Senior React Developer',      skills:['React','TypeScript','Redux','GraphQL','Jest'],                  salMin:15, salMax:28, type:'full_time', cat:'Frontend' },
  { title:'Go Developer',               skills:['Go','gRPC','PostgreSQL','Docker','Kubernetes'],                 salMin:15, salMax:30, type:'full_time', cat:'Backend' },
  { title:'AI Engineer',                 skills:['Python','LangChain','OpenAI API','FastAPI','AWS'],              salMin:20, salMax:45, type:'full_time', cat:'AI/ML' },
  { title:'Site Reliability Engineer',   skills:['SRE','Prometheus','Grafana','Kubernetes','Python'],             salMin:18, salMax:35, type:'full_time', cat:'DevOps' },
  { title:'Frontend Lead',               skills:['React','Architecture','TypeScript','Web Performance','Mentoring'],salMin:22, salMax:42, type:'full_time', cat:'Frontend' },
  { title:'Software Developer (Frontend)',skills:['React','Next.js','TypeScript','GraphQL','Docker'],             salMin:18, salMax:28, type:'full_time', cat:'Frontend' },
  { title:'Senior Backend Engineer',     skills:['Python','Django','PostgreSQL','Celery','Redis'],               salMin:18, salMax:32, type:'full_time', cat:'Backend' },
  { title:'Contract React Developer',    skills:['React','JavaScript','Hooks','REST API','CSS'],                  salMin:8,  salMax:20, type:'contract',  cat:'Frontend' },
  { title:'Part-time Data Analyst',      skills:['Python','SQL','Tableau','Excel','Statistics'],                  salMin:4,  salMax:10, type:'part_time', cat:'Data Science' },
  { title:'Security Engineer',           skills:['SAST','Penetration Testing','Cloud Security','Python','Networking'],salMin:16,salMax:32,type:'full_time',cat:'Security' },
  { title:'Engineering Manager',         skills:['System Design','People Management','Agile','AWS','Roadmapping'],salMin:30, salMax:60, type:'full_time', cat:'Leadership' },
  { title:'Blockchain Developer',        skills:['Solidity','Web3.js','Ethereum','Smart Contracts','DeFi'],       salMin:18, salMax:40, type:'full_time', cat:'Blockchain' },
  { title:'Flutter Developer',           skills:['Flutter','Dart','Firebase','REST API','Git'],                   salMin:8,  salMax:20, type:'full_time', cat:'Mobile' },
  { title:'Data Analyst',                skills:['SQL','Python','Tableau','Power BI','Excel'],                    salMin:6,  salMax:14, type:'full_time', cat:'Data Science' },
  { title:'Generative AI Engineer',      skills:['Python','LLM','RAG','LangChain','Vector DB'],                  salMin:22, salMax:50, type:'full_time', cat:'AI/ML' },
  { title:'Platform Engineer',           skills:['Kubernetes','Terraform','Go','AWS','Monitoring'],               salMin:18, salMax:36, type:'full_time', cat:'DevOps' },
  { title:'Product Manager - Tech',      skills:['Agile','JIRA','SQL','API','Product Strategy'],                  salMin:20, salMax:45, type:'full_time', cat:'Product' },
  { title:'Senior Data Scientist',       skills:['Python','Deep Learning','NLP','Spark','AWS SageMaker'],         salMin:22, salMax:45, type:'full_time', cat:'Data Science' },
  { title:'API Engineer',                skills:['REST API','GraphQL','Node.js','Python','OpenAPI'],              salMin:10, salMax:22, type:'full_time', cat:'Backend' },
];

// Source distribution: LinkedIn ~34%, Naukri ~24%, Indeed ~16%, Glassdoor ~12%, Wellfound ~8%, Twitter ~6%
const SOURCE_CYCLE = [
  'linkedin','naukri','linkedin','indeed','linkedin','naukri','glassdoor','linkedin',
  'indeed','naukri','linkedin','angellist','linkedin','naukri','linkedin','indeed',
  'glassdoor','linkedin','naukri','indeed','linkedin','naukri','angellist','linkedin',
  'indeed','naukri','linkedin','glassdoor','naukri','twitter',
];

function generateMockJobs() {
  const jobs = [];
  let id = 1;
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

  COMPANIES.forEach((co, ci) => {
    const numJobs = 3 + (ci % 6); // 3–8 jobs per company
    for (let j = 0; j < numJobs; j++) {
      const tmpl = TEMPLATES[(ci * 7 + j * 11) % TEMPLATES.length];
      // Spread jobs across last 7 days deterministically
      const msPast = ((id * 7919 + j * 3571) % SEVEN_DAYS_MS);
      const source = SOURCE_CYCLE[(id - 1) % SOURCE_CYCLE.length];

      jobs.push({
        id,
        title: tmpl.title,
        company_name: co.name,
        company_logo: null,
        candidate_required_location: co.city + ', India',
        url: 'https://www.linkedin.com/jobs/search/?location=India&keywords=' + encodeURIComponent(`${tmpl.title} ${co.name}`),
        description: `${co.name} is hiring a ${tmpl.title}. Work on high-impact products used by millions across India. Strong expertise in ${tmpl.skills.slice(0, 3).join(', ')} required. We offer competitive compensation, equity, and remote-friendly culture.`,
        job_type: tmpl.type,
        salary: `₹${tmpl.salMin}L – ₹${tmpl.salMax}L`,
        publication_date: new Date(now - msPast).toISOString(),
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

// ─── Job source: live career boards when configured, else demo data ───────────
const live = createLiveSource({
  boards: process.env.JOB_BOARDS,
  indiaOnly: process.env.JOB_INDIA_ONLY !== 'false',
  refreshMinutes: parseInt(process.env.JOB_REFRESH_MINUTES, 10) || 15,
});

function getJobs() {
  const liveJobs = live.jobs();
  return liveJobs.length ? liveJobs : generateMockJobs();
}

function dataSource() {
  return live.jobs().length ? 'live' : 'demo';
}

// ─── Trend data (7-day category trends) ────────────────────────────────────────

function computeTrends() {
  const jobs = getJobs();
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;
  const categories = ['Frontend','Backend','AI/ML','Data Science','DevOps','Full Stack','Mobile'];
  const colors = { Frontend:'#2563EB', Backend:'#7C3AED', 'AI/ML':'#059669', 'Data Science':'#DC2626', DevOps:'#D97706', 'Full Stack':'#0891B2', Mobile:'#DB2777' };

  const labels = [];
  for (let d = 6; d >= 0; d--) {
    const dt = new Date(now - d * DAY);
    labels.push(dt.toLocaleDateString('en-IN', { weekday:'short', day:'numeric' }));
  }

  const series = categories.map(cat => {
    const data = [];
    for (let d = 6; d >= 0; d--) {
      const dayStart = now - (d + 1) * DAY;
      const dayEnd   = now - d * DAY;
      const count = jobs.filter(j => {
        const t = new Date(j.publication_date).getTime();
        return j.category === cat && t >= dayStart && t < dayEnd;
      }).length;
      data.push(count);
    }
    return { name: cat, data, color: colors[cat] || '#6B7280' };
  });

  return { labels, series, total: jobs.length };
}

// ─── Jobs endpoint ─────────────────────────────────────────────────────────────
app.get('/api/jobs', (req, res) => {
  try {
    const { search = '', location = '', jobType = '', salMin = '', limit = '300' } = req.query;

    let jobs = getJobs();

    if (search) {
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      jobs = jobs.filter(j => {
        const hay = `${j.title} ${j.company_name} ${(j.tags || []).join(' ')} ${j.description}`.toLowerCase();
        return words.every(w => hay.includes(w));
      });
    }

    if (location && location !== 'india') {
      const aliases = {
        bangalore: ['bangalore','bengaluru'], mumbai: ['mumbai','bombay'],
        delhi: ['delhi','ncr','new delhi','noida','gurgaon','gurugram'],
        hyderabad: ['hyderabad','hyd'], pune: ['pune'],
        chennai: ['chennai','madras'], noida: ['noida'],
        gurgaon: ['gurgaon','gurugram'], ahmedabad: ['ahmedabad'],
      };
      const locs = aliases[location] || [location];
      jobs = jobs.filter(j => {
        const jl = (j.candidate_required_location || '').toLowerCase();
        return locs.some(a => jl.includes(a));
      });
    }

    if (jobType) jobs = jobs.filter(j => j.job_type === jobType);

    if (salMin) {
      const min = parseFloat(salMin);
      jobs = jobs.filter(j => {
        const m = (j.salary || '').match(/[\d.]+/);
        return m ? parseFloat(m[0]) >= min * 0.8 : true;
      });
    }

    jobs = jobs.slice(0, Math.min(parseInt(limit, 10) || 300, 500));
    res.json({ jobs, total: jobs.length, dataSource: dataSource(), apiConfigured: true });
  } catch (e) {
    res.status(500).json({ error: e.message, jobs: [] });
  }
});

// ─── Trends endpoint ────────────────────────────────────────────────────────────
app.get('/api/trends', (req, res) => {
  try {
    res.json(computeTrends());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Resume parsing
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const RESUME_PROMPT = `Analyze this resume for Indian tech job market. Return ONLY valid JSON:
{
  "prefs": {
    "role": "<target job title>",
    "skills": "<top 6 skills comma-separated>",
    "exp": "<fresher|junior|mid|senior|lead>",
    "type": "<full_time|contract|part_time>",
    "location": "<bangalore|mumbai|delhi|hyderabad|pune|chennai|noida|gurgaon|ahmedabad|india|remote>",
    "salMin": "<5|8|10|15|20|30|50>"
  },
  "ats": {
    "score": <number 0-100>,
    "grade": "<A|B|C|D>",
    "found_skills": ["skill1","skill2"],
    "missing_skills": ["skill3","skill4"],
    "strengths": ["one line strength 1","one line strength 2"],
    "gaps": ["one line gap 1","one line gap 2"],
    "suggestions": ["actionable tip 1","actionable tip 2","actionable tip 3"],
    "sections": { "contact": <true|false>, "summary": <true|false>, "experience": <true|false>, "education": <true|false>, "skills": <true|false>, "projects": <true|false> }
  }
}`;

app.post('/api/parse-resume', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!geminiKey && !anthropicKey) return res.status(500).json({ error: 'No AI key configured. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in Railway Variables.' });

  const base64 = req.file.buffer.toString('base64');
  const mime = req.file.mimetype || 'application/pdf';

  try {
    let rawText = '';

    if (geminiKey) {
      // Use Gemini (free)
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mime, data: base64 } },
            { text: RESUME_PROMPT },
          ]}],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const d = await r.json();
      rawText = d?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    } else {
      // Fallback: Anthropic
      const client = new Anthropic({ apiKey: anthropicKey });
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 2048,
        messages: [{ role:'user', content: [
          { type:'document', source:{ type:'base64', media_type: mime, data: base64 } },
          { type:'text', text: RESUME_PROMPT },
        ]}],
      });
      rawText = message.content.find(b => b.type === 'text')?.text || '{}';
    }

    const m = rawText.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : {};

    // Save profile per user
    if (req.uid && parsed.prefs) {
      profileStore[req.uid] = { ...(profileStore[req.uid] || {}), prefs: parsed.prefs, ats: parsed.ats || null, updatedAt: new Date().toISOString() };
      saveProfiles();
    }

    res.json({ prefs: parsed.prefs || {}, ats: parsed.ats || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get saved profile
app.get('/api/resume/profile', (req, res) => {
  const p = profileStore[req.uid] || {};
  res.json({ prefs: p.prefs || null, ats: p.ats || null, updatedAt: p.updatedAt || null });
});

// ─── Automations: viaSocket webhook-trigger flows fed by HireRadar events ──────
// Webhook URLs identify viaSocket scripts, so they stay server-side: never
// returned to the browser and never logged.

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// ─── User setup profile (onboarding: resume prefs + chosen platforms) ──────────
const PROFILE_FILE = path.join(DATA_DIR, 'profiles.json');
let profileStore = {};
try { profileStore = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8')); } catch {}

let profileSaveTimer = null;
function saveProfiles() {
  clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(PROFILE_FILE + '.tmp', JSON.stringify(profileStore));
      fs.renameSync(PROFILE_FILE + '.tmp', PROFILE_FILE);
    } catch (e) { console.error('[profiles] save failed:', e.message); }
  }, 200);
}

app.get('/api/profile', (req, res) => {
  res.json(profileStore[req.uid] || { onboarded: false });
});

app.post('/api/profile', (req, res) => {
  const allowed = ['name','email','prefs','platforms','onboarded','ats_score'];
  const update = {};
  for (const k of allowed) {
    if (req.body?.[k] !== undefined) update[k] = req.body[k];
  }
  profileStore[req.uid] = { ...(profileStore[req.uid] || {}), ...update, updatedAt: new Date().toISOString() };
  saveProfiles();
  res.json({ ok: true });
});
const STORE_FILE = path.join(DATA_DIR, 'automations.json');
const WEBHOOK_HOSTS = (process.env.VIASOCKET_WEBHOOK_HOSTS || 'sokt.io,viasocket.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const JOB_CATEGORIES = [...new Set(TEMPLATES.map(t => t.cat))];
const AUTOMATION_TYPES = {
  new_job:  { label: 'New matching jobs', events: ['job.new'] },
  company:  { label: 'Company follow',    events: ['job.new'] },
  tracker:  { label: 'Save/apply tracker', events: ['job.saved', 'job.applied'] },
};
const MAX_AUTOMATIONS = 20;
const MAX_NEW_JOBS_PER_RUN = 5;

let store = { users: {}, seenJobIds: null };
try { store = { ...store, ...JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) }; } catch {}

let saveTimer = null;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STORE_FILE + '.tmp', JSON.stringify(store));
      fs.renameSync(STORE_FILE + '.tmp', STORE_FILE);
    } catch (e) { console.error('[automations] save failed:', e.code || e.message); }
  }, 200);
}

function userAutomations(uid) {
  if (!store.users[uid]) store.users[uid] = { automations: [] };
  return store.users[uid].automations;
}

function publicAutomation(a) {
  const { webhookUrl, ...rest } = a;
  return { ...rest, connected: Boolean(webhookUrl) };
}

function validWebhookUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  const host = u.hostname.toLowerCase();
  if (!WEBHOOK_HOSTS.some(h => host === h || host.endsWith('.' + h))) return null;
  return u.toString();
}

function jobPayload(job) {
  return {
    id: job.id,
    title: job.title,
    company: job.company_name,
    location: job.candidate_required_location,
    salary: job.salary,
    job_type: job.job_type,
    category: job.category,
    skills: job.tags,
    source: job._source,
    url: job.url,
    posted_at: job.publication_date,
  };
}

function matches(a, eventType, job) {
  if (!a.enabled || !a.webhookUrl) return false;
  if (!AUTOMATION_TYPES[a.type].events.includes(eventType)) return false;
  if (a.type === 'new_job') {
    if (a.filter.category && job.category !== a.filter.category) return false;
    if (a.filter.location && !job.candidate_required_location.toLowerCase().includes(a.filter.location.toLowerCase())) return false;
  }
  if (a.type === 'company' && job.company_name !== a.filter.company) return false;
  return true;
}

async function deliver(a, eventType, job, extra = {}) {
  const body = {
    event: eventType,
    automation: { id: a.id, name: a.name, template: a.template },
    job: jobPayload(job),
    sent_at: new Date().toISOString(),
    ...extra,
  };
  let status;
  try {
    const r = await fetch(a.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    status = r.ok ? 'ok' : `http_${r.status}`;
  } catch (e) {
    status = e.name === 'TimeoutError' ? 'timeout' : 'network_error';
  }
  a.lastFiredAt = body.sent_at;
  a.lastStatus = status;
  if (status === 'ok') a.fireCount = (a.fireCount || 0) + 1;
  else console.warn(`[automations] delivery ${a.id} failed: ${status}`);
  saveStore();
  return status;
}

function fanOut(eventType, job, onlyUid) {
  const uids = onlyUid ? [onlyUid] : Object.keys(store.users);
  const sends = [];
  for (const uid of uids) {
    for (const a of userAutomations(uid)) {
      if (matches(a, eventType, job)) sends.push(deliver(a, eventType, job));
    }
    // Also deliver to directly-connected apps (WhatsApp, Gmail, Sheets, Slack)
    sends.push(deliverToApps(uid, eventType, job).catch(e => console.warn('[vs-app] fanOut error:', e.message)));
  }
  return Promise.all(sends);
}

// New-job watcher: diffs the job source against what was already seen.
// Switching between demo and live data reseeds silently instead of alerting on every job.
async function checkNewJobs() {
  await live.refresh();
  const jobs = getJobs();
  const source = dataSource();
  const baseline = store.seenJobIds && store.seenSource === source;
  const seen = new Set(baseline ? store.seenJobIds : []);
  const fresh = baseline ? jobs.filter(j => !seen.has(j.id)) : [];
  store.seenJobIds = jobs.map(j => j.id);
  store.seenSource = source;
  if (fresh.length || !baseline) saveStore();
  fresh.slice(0, MAX_NEW_JOBS_PER_RUN).forEach(job => fanOut('job.new', job));
}
checkNewJobs().catch(e => console.error('[jobs] watcher failed:', e.message));
setInterval(() => checkNewJobs().catch(e => console.error('[jobs] watcher failed:', e.message)), (parseInt(process.env.JOB_WATCH_MINUTES, 10) || 10) * 60 * 1000);

function findJob(id) {
  return getJobs().find(j => j.id === Number(id));
}

function cleanText(v, max) {
  return String(v || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

app.get('/api/automations', (req, res) => {
  res.json({
    automations: userAutomations(req.uid).map(publicAutomation),
    categories: JOB_CATEGORIES,
  });
});

app.post('/api/automations', (req, res) => {
  const list = userAutomations(req.uid);
  if (list.length >= MAX_AUTOMATIONS) return res.status(400).json({ error: `Max ${MAX_AUTOMATIONS} automations allowed` });

  const { type, template, name } = req.body || {};
  if (!AUTOMATION_TYPES[type]) return res.status(400).json({ error: 'Unknown automation type' });

  const webhookUrl = validWebhookUrl(req.body.webhookUrl);
  if (!webhookUrl) return res.status(400).json({ error: `Paste the https webhook URL from your viaSocket flow's Webhook trigger (allowed hosts: ${WEBHOOK_HOSTS.join(', ')})` });

  const filter = {};
  if (type === 'new_job') {
    const category = cleanText(req.body.filter?.category, 40);
    if (category && !JOB_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Unknown category' });
    if (category) filter.category = category;
    const location = cleanText(req.body.filter?.location, 40);
    if (location) filter.location = location;
  }
  if (type === 'company') {
    const company = cleanText(req.body.filter?.company, 80);
    if (!getJobs().some(j => j.company_name === company)) return res.status(400).json({ error: 'Unknown company' });
    filter.company = company;
  }

  const a = {
    id: 'au_' + crypto.randomBytes(6).toString('hex'),
    type,
    template: ['whatsapp', 'sheets', 'company', 'custom'].includes(template) ? template : 'custom',
    name: cleanText(name, 60) || AUTOMATION_TYPES[type].label,
    filter,
    webhookUrl,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastFiredAt: null,
    lastStatus: null,
    fireCount: 0,
  };
  list.push(a);
  saveStore();
  res.status(201).json({ automation: publicAutomation(a) });
});

app.patch('/api/automations/:id', (req, res) => {
  const a = userAutomations(req.uid).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (typeof req.body?.enabled === 'boolean') a.enabled = req.body.enabled;
  saveStore();
  res.json({ automation: publicAutomation(a) });
});

app.delete('/api/automations/:id', (req, res) => {
  const list = userAutomations(req.uid);
  const i = list.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  list.splice(i, 1);
  saveStore();
  res.json({ ok: true });
});

const lastTest = new Map();
app.post('/api/automations/:id/test', async (req, res) => {
  const a = userAutomations(req.uid).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const now = Date.now();
  if (now - (lastTest.get(a.id) || 0) < 10000) return res.status(429).json({ error: 'Wait a few seconds before testing again' });
  lastTest.set(a.id, now);

  const jobs = getJobs();
  const eventType = AUTOMATION_TYPES[a.type].events[0];
  const job = jobs.find(j => matches({ ...a, enabled: true }, eventType, j)) || jobs[0];
  const status = await deliver(a, eventType, job, { test: true });
  res.json({ status, automation: publicAutomation(a) });
});

app.get('/api/sources', (req, res) => {
  res.json({ dataSource: dataSource(), configured: live.configured, boards: live.status() });
});

app.post('/api/events', (req, res) => {
  const { type, jobId } = req.body || {};
  if (!['job.saved', 'job.applied'].includes(type)) return res.status(400).json({ error: 'Unknown event' });
  const job = findJob(jobId);
  if (!job) return res.status(404).json({ error: 'Unknown job' });
  fanOut(type, job, req.uid);
  res.status(202).json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HireRadar running at http://localhost:${PORT}`));

// ─── viaSocket Direct App Connections ─────────────────────────────────────────
// Each user can connect WhatsApp / Gmail / Google Sheets / Slack directly.
// auth_id and script_id stay server-side — never sent to the browser.

const CONN_FILE = path.join(DATA_DIR, 'connections.json');
let connStore = { users: {} };
try { connStore = { ...connStore, ...JSON.parse(fs.readFileSync(CONN_FILE, 'utf8')) }; } catch {}

let connSaveTimer = null;
function saveConnStore() {
  clearTimeout(connSaveTimer);
  connSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CONN_FILE + '.tmp', JSON.stringify(connStore));
      fs.renameSync(CONN_FILE + '.tmp', CONN_FILE);
    } catch (e) { console.error('[connections] save failed:', e.message); }
  }, 200);
}

function userConns(uid) {
  if (!connStore.users[uid]) connStore.users[uid] = {};
  return connStore.users[uid];
}

const VS_API = 'https://flow-api.viasocket.com';
const VS_RUN = 'https://flow.sokt.io/func';
const VS_DOC_BASE = 'https://flow.viasocket.com/documentation';
const VS_SEARCH = 'https://flow.sokt.io/func/scri12BSufQM';

function makeVsToken(uid) {
  return jwt.sign(
    { org_id: ORG_ID, project_id: PROJECT_ID, unique_identifier: uid },
    SECRET, { algorithm: 'HS256' }
  );
}

// Cache for service IDs and action_version_ids
const vsSearchCache = new Map();
const vsDocCache = new Map();

async function vsSearch(q) {
  if (vsSearchCache.has(q)) return vsSearchCache.get(q);
  const r = await fetch(`${VS_SEARCH}?key=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`VS search HTTP ${r.status}`);
  const data = await r.json();
  const result = Array.isArray(data?.data) ? data.data : [];
  vsSearchCache.set(q, result);
  return result;
}

async function vsAppDoc(serviceId) {
  if (vsDocCache.has(serviceId)) return vsDocCache.get(serviceId);
  const url = `${VS_DOC_BASE}/${serviceId}.md?format=http&org=${ORG_ID}&project=${PROJECT_ID}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const text = await r.text();
  vsDocCache.set(serviceId, text);
  return text;
}

function extractActionVerId(doc, keywords) {
  if (!doc) return null;
  const lines = doc.split('\n');
  let inSection = false;
  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      inSection = keywords.some(k => line.toLowerCase().includes(k));
    }
    if (inSection) {
      const m = line.match(/action_version_id[`:\s*]+([A-Za-z0-9_-]+)/i) ||
                line.match(/`(actver_[A-Za-z0-9_-]+)`/);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

// App metadata — service_id from viaSocket skill docs; actionKw guides action_version_id extraction
const APP_META = {
  // service_ids from viaSocket skill docs
  whatsapp: { label: 'WhatsApp',      icon: '💬', color: '#25D366', service_id: 'row3icnwu2su', q: 'whatsapp',      actionKw: ['send message','send text','send template'] },
  gmail:    { label: 'Gmail',         icon: '📧', color: '#EA4335', service_id: 'rowo0bqrhj5g', q: 'gmail',          actionKw: ['send email','send mail','compose'] },
  sheets:   { label: 'Google Sheets', icon: '📊', color: '#0F9D58', service_id: null,            q: 'google sheets',  actionKw: ['add row','append row','insert row'] },
  slack:    { label: 'Slack',         icon: '💼', color: '#4A154B', service_id: null,            q: 'slack',          actionKw: ['send message','post message','post to channel'] },
};

// Build viaSocket inputData per app + template
function buildVsInputData(appLabel, conn, eventType, job, tmplId) {
  const jp = {
    title: job.title, company: job.company_name,
    location: job.candidate_required_location || 'India',
    salary: job.salary || 'Not disclosed', url: job.url || '',
    category: job.category || 'Tech', event: eventType,
    date: new Date().toLocaleDateString('en-IN'),
  };
  const cfg = conn.config || {};

  // Per-template message text
  const waMsg = {
    wa_new_job:   `🔔 *New Job Alert!*\n📌 ${jp.title} @ ${jp.company}\n📍 ${jp.location} · 💰 ${jp.salary}\n\n👉 Apply: ${jp.url}`,
    wa_expiry:    `⏰ *Expiring Soon — Apply Today!*\n📌 ${jp.title} @ ${jp.company}\nPosted weeks ago — closing soon!\n\n👉 Apply now: ${jp.url}`,
    wa_followup:  `📬 *Follow-Up Reminder*\nYou applied to ${jp.company} (${jp.title}) 7 days ago.\n\n💡 Tip: Email the hiring manager directly.`,
    wa_interview: `🎯 *Interview Reminder!*\n🏢 ${jp.company} — ${jp.title}\n\n✅ Review: DSA, System Design, HR questions\n📄 Your resume is ready`,
    wa_weekly:    `☀️ *Weekly Job Digest*\nTop matches for you this week — check HireRadar for the full list!`,
    linkedin_wa:  `🔗 *LinkedIn Job Alert*\n📌 ${jp.title} @ ${jp.company}\n📍 ${jp.location} · 💰 ${jp.salary}\nVia LinkedIn · ${jp.url}`,
    naukri_wa:    `📋 *Naukri Job Alert*\n📌 ${jp.title} @ ${jp.company}\n📍 ${jp.location} · 💰 ${jp.salary}\nVia Naukri · ${jp.url}`,
  };
  const gmailSubj = {
    gmail_new_job:  `🔔 New Match: ${jp.title} @ ${jp.company} (${jp.salary})`,
    gmail_daily:    `☀️ Your Daily Job Digest — HireRadar`,
    gmail_applied:  `✅ Applied — ${jp.title} @ ${jp.company}`,
    gmail_followup: `Following up — ${jp.title} Application`,
  };
  const gmailBody = {
    gmail_new_job:  `Hi,\n\nA new job matching your profile just dropped:\n\n📌 ${jp.title}\n🏢 ${jp.company}\n📍 ${jp.location}\n💰 ${jp.salary}\n\n👉 Apply here: ${jp.url}\n\n— HireRadar`,
    gmail_daily:    `Good morning!\n\nHere are your top matching jobs today. Log into HireRadar to see the full list.\n\n— HireRadar`,
    gmail_applied:  `You applied to ${jp.title} at ${jp.company} today.\n\n💡 Follow up in 7 days if you don't hear back.\n📧 Check their careers page for the hiring manager's contact.\n\n— HireRadar`,
    gmail_followup: `Dear Hiring Manager,\n\nI applied for the ${jp.title} role at ${jp.company} approximately 7 days ago and wanted to follow up.\n\nI remain very interested in this opportunity and would love to discuss how my skills can contribute.\n\nBest regards`,
  };
  const slackText = {
    slack_new_job:  `🔔 *New job match!*\n*${jp.title}* @ ${jp.company}\n📍 ${jp.location} · 💰 ${jp.salary}\n<${jp.url}|Apply Now>`,
    slack_applied:  `✅ Applied to *${jp.title} @ ${jp.company}*\n📅 Today · Status: Under review\n_Follow up after 7 days_`,
    slack_expiry:   `⏰ *Saved jobs expiring soon — apply now!*\n• ${jp.title} @ ${jp.company}`,
  };

  switch (appLabel) {
    case 'whatsapp': return {
      action_version_id: conn.action_version_id,
      inputData: {
        phone: cfg.phone || '',
        message: waMsg[tmplId] || waMsg.wa_new_job,
      },
    };
    case 'gmail': return {
      action_version_id: conn.action_version_id,
      inputData: {
        to: cfg.to || '',
        subject: gmailSubj[tmplId] || `HireRadar: ${jp.title} @ ${jp.company}`,
        body: gmailBody[tmplId] || `Job: ${jp.title} at ${jp.company}\nSalary: ${jp.salary}\nApply: ${jp.url}`,
      },
    };
    case 'sheets': return {
      action_version_id: conn.action_version_id,
      inputData: {
        spreadsheet_id: cfg.spreadsheet_id || '',
        range: cfg.sheet_name ? `${cfg.sheet_name}!A:H` : 'Sheet1!A:H',
        values: [[jp.title, jp.company, jp.location, jp.salary, eventType, jp.url, jp.date, tmplId || '']],
      },
    };
    case 'slack': return {
      action_version_id: conn.action_version_id,
      inputData: {
        channel: cfg.channel || '',
        text: slackText[tmplId] || `*Job Alert:* ${jp.title} @ *${jp.company}*\n📍 ${jp.location}  💰 ${jp.salary}\n🔗 ${jp.url}`,
      },
    };
    default: return { action_version_id: conn.action_version_id, inputData: { ...jp, tmplId } };
  }
}

// Deliver event to all connected apps for a user
async function deliverToApps(uid, eventType, job) {
  if (!SECRET) return;
  const conns = userConns(uid);
  const autoCfg = userAutoCfg(uid);
  const sends = [];
  // Find enabled automation templates that match this eventType
  const activeTmpls = AUTO_TEMPLATES.filter(t =>
    t.trigger === eventType &&
    autoCfg[t.id]?.enabled &&
    conns[t.app]?.enabled &&
    conns[t.app]?.script_id &&
    conns[t.app]?.action_version_id
  );
  for (const tmpl of activeTmpls) {
    const conn = conns[tmpl.app];
    const payload = buildVsInputData(tmpl.app, conn, eventType, job, tmpl.id);
    sends.push(
      fetch(`${VS_RUN}/${conn.script_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      }).then(r => console.log(`[vs-app] ${tmpl.id} → ${r.status}`))
        .catch(e => console.warn(`[vs-app] ${tmpl.id} failed: ${e.message}`))
    );
  }
  return Promise.all(sends);
}

// Return known hardcoded service_ids + fallback via search
app.get('/api/vs/service-ids', async (req, res) => {
  const ids = {};
  const searches = [];
  for (const [key, meta] of Object.entries(APP_META)) {
    if (meta.service_id) { ids[key] = meta.service_id; }
    else { searches.push(vsSearch(meta.q).then(r => { if (r[0]?.service_id) ids[key] = r[0].service_id; }).catch(() => {})); }
  }
  await Promise.all(searches);
  res.json(ids);
});

// Proxy: search viaSocket app catalog
app.get('/api/vs/find-app', async (req, res) => {
  if (!SECRET) return res.status(500).json({ error: 'VIASOCKET_EMBED_SECRET not set' });
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (!q) return res.status(400).json({ error: 'Missing q' });
  try { res.json({ data: await vsSearch(q) }); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

// Connect an app: user sends auth_id from popup, server enables + stores
app.post('/api/vs/connect', async (req, res) => {
  if (!SECRET) return res.status(500).json({ error: 'VIASOCKET_EMBED_SECRET not set' });
  const { app_label, auth_id } = req.body || {};
  let { service_id } = req.body || {};
  if (!APP_META[app_label]) return res.status(400).json({ error: 'Unknown app' });
  if (!auth_id || typeof auth_id !== 'string') return res.status(400).json({ error: 'Missing auth_id' });
  // Use hardcoded service_id from APP_META when available (more reliable than client-provided)
  if (APP_META[app_label].service_id) service_id = APP_META[app_label].service_id;
  if (!service_id) {
    // Fall back to dynamic lookup
    const results = await vsSearch(APP_META[app_label].q).catch(() => []);
    service_id = results[0]?.service_id || null;
  }
  if (!service_id) return res.status(400).json({ error: 'Could not resolve service_id for ' + app_label });

  try {
    const token = makeVsToken(req.uid);
    const enRes = await fetch(`${VS_API}/embed/enable/${encodeURIComponent(service_id)}/${encodeURIComponent(auth_id)}`, {
      method: 'POST',
      headers: { authorization: token },
      signal: AbortSignal.timeout(12000),
    });
    if (!enRes.ok) {
      const body = await enRes.text().catch(() => '');
      return res.status(502).json({ error: `viaSocket enable failed (${enRes.status}): ${body.slice(0, 200)}` });
    }
    const enData = await enRes.json();
    const script_id = enData?.data?.script_id || enData?.script_id;
    if (!script_id) return res.status(502).json({ error: 'No script_id from viaSocket' });

    // Try to get action_version_id from documentation
    const doc = await vsAppDoc(service_id).catch(() => null);
    const action_version_id = extractActionVerId(doc, APP_META[app_label].actionKw);

    const conns = userConns(req.uid);
    conns[app_label] = {
      app_label, service_id, auth_id, script_id,
      action_version_id: action_version_id || null,
      config: {},
      enabled: true,
      connectedAt: new Date().toISOString(),
    };
    saveConnStore();
    res.json({ ok: true, has_action: Boolean(action_version_id) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// List connections (safe — no auth_id/script_id sent to browser)
app.get('/api/vs/connections', (req, res) => {
  const conns = userConns(req.uid);
  const safe = {};
  for (const [k, v] of Object.entries(conns)) {
    const { auth_id, script_id, ...rest } = v;
    safe[k] = { ...rest, has_action: Boolean(v.action_version_id) };
  }
  const appDefs = Object.fromEntries(
    Object.entries(APP_META).map(([k, v]) => [k, { label: v.label, icon: v.icon, color: v.color }])
  );
  res.json({ connections: safe, appDefs });
});

// Update config or toggle enabled
app.patch('/api/vs/connections/:app', (req, res) => {
  const conns = userConns(req.uid);
  const conn = conns[req.params.app];
  if (!conn) return res.status(404).json({ error: 'Not connected' });
  if (req.body?.config && typeof req.body.config === 'object') {
    conn.config = { ...conn.config, ...req.body.config };
  }
  if (typeof req.body?.enabled === 'boolean') conn.enabled = req.body.enabled;
  saveConnStore();
  res.json({ ok: true });
});

// Disconnect an app
app.delete('/api/vs/connections/:app', (req, res) => {
  const conns = userConns(req.uid);
  delete conns[req.params.app];
  saveConnStore();
  res.json({ ok: true });
});

// Test a connected app
app.post('/api/vs/connections/:app/test', async (req, res) => {
  if (!SECRET) return res.status(500).json({ error: 'VIASOCKET_EMBED_SECRET not set' });
  const conns = userConns(req.uid);
  const conn = conns[req.params.app];
  if (!conn) return res.status(404).json({ error: 'Not connected' });
  if (!conn.script_id) return res.status(400).json({ error: 'Not fully set up' });
  if (!conn.action_version_id) return res.status(400).json({ error: 'action_version_id not found — check viaSocket docs' });
  const job = getJobs()[0] || { title: 'Test Job', company_name: 'Test Co', candidate_required_location: 'Bangalore', salary: '₹15L', url: 'https://example.com', category: 'Backend', publication_date: new Date().toISOString() };
  try {
    const payload = buildVsInputData(req.params.app, conn, 'job.new', job);
    const r = await fetch(`${VS_RUN}/${conn.script_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    res.json({ ok: r.ok, status: r.status });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── AI Intelligence Endpoints ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const aiClient = new Anthropic();

async function aiJson(prompt, max_tokens = 1024) {
  const msg = await aiClient.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = msg.content.find(b => b.type === 'text')?.text || '{}';
  const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return m ? JSON.parse(m[0]) : JSON.parse(text);
}

// ── 1. Resume Auto-Tailor ─────────────────────────────────────────────────
app.post('/api/ai/tailor', async (req, res) => {
  const { jobTitle, company, description, currentSummary, skills } = req.body || {};
  if (!jobTitle) return res.status(400).json({ error: 'jobTitle required' });
  try {
    const result = await aiJson(`You are a resume expert for Indian tech jobs.
Job: "${jobTitle}" at ${company || 'a company'}
JD excerpt: ${(description || '').slice(0, 800)}
Candidate skills: ${skills || 'not provided'}
Current summary: ${currentSummary || 'none'}

Return ONLY valid JSON:
{
  "tailored_summary": "<2-3 sentence professional summary that mirrors JD keywords and shows match. Max 60 words.>",
  "keywords_matched": ["kw1","kw2","kw3"],
  "keywords_missing": ["kw4","kw5"],
  "match_score": <0-100>,
  "tips": ["tip1","tip2"]
}`, 800);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 2. Salary Intelligence ────────────────────────────────────────────────
app.post('/api/ai/salary', async (req, res) => {
  const { title, location, exp, postedSalary } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const result = await aiJson(`You are a salary intelligence engine for Indian tech jobs (2025 data).
Role: "${title}", Location: ${location || 'India'}, Experience: ${exp || 'mid'}, Posted salary: ${postedSalary || 'not disclosed'}

Return ONLY valid JSON:
{
  "market_min": <number in LPA>,
  "market_median": <number in LPA>,
  "market_max": <number in LPA>,
  "posted_vs_market": "<below|at|above>",
  "percentile": <0-100>,
  "verdict": "<one line: e.g. 18% above market median>",
  "trending": "<up|down|stable>",
  "top_paying_companies": ["co1","co2","co3"]
}`, 512);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 3. Rejection Pattern Analysis ────────────────────────────────────────
app.post('/api/ai/rejection', async (req, res) => {
  const { applications } = req.body || {};
  if (!Array.isArray(applications) || applications.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 applications to analyse' });
  }
  const summary = applications.slice(0, 30).map(a =>
    `${a.title} @ ${a.company} — ${a.status}${a.notes ? ' ('+a.notes+')' : ''}`
  ).join('\n');
  try {
    const result = await aiJson(`You are a career coach analysing an Indian tech job-seeker's application history.
Applications:
${summary}

Find patterns in rejections. Return ONLY valid JSON:
{
  "rejection_rate": <0-100>,
  "top_patterns": ["pattern1","pattern2","pattern3"],
  "root_cause": "<1-2 sentence honest assessment>",
  "strengths": ["str1","str2"],
  "quick_fixes": ["fix1","fix2","fix3"],
  "recommended_action": "<single most impactful thing to do next>",
  "stage_breakdown": { "no_reply": <n>, "rejected_after_cv": <n>, "rejected_after_interview": <n>, "offer": <n> }
}`, 900);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 4. Offer Comparison ───────────────────────────────────────────────────
app.post('/api/ai/offer-compare', async (req, res) => {
  const { offers } = req.body || {};
  if (!Array.isArray(offers) || offers.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 offers' });
  }
  const offerText = offers.map((o, i) =>
    `Offer ${i+1}: ${o.company} — CTC ₹${o.ctc}L, Role: ${o.role||'?'}, Location: ${o.location||'?'}, ${o.wfh?'Remote/Hybrid':'On-site'}, Equity: ${o.equity||'none'}, Notes: ${o.notes||'-'}`
  ).join('\n');
  try {
    const result = await aiJson(`You are a compensation expert for Indian tech professionals.
${offerText}

Compare these offers holistically. Return ONLY valid JSON:
{
  "winner": "<company name>",
  "winner_reason": "<2 sentences why>",
  "scores": [<score 0-100 per offer in order>],
  "breakdown": {
    "compensation": [<score per offer>],
    "growth": [<score per offer>],
    "stability": [<score per offer>],
    "culture": [<score per offer>]
  },
  "pros_cons": [
    { "company": "<name>", "pros": ["p1","p2"], "cons": ["c1","c2"] }
  ],
  "negotiation_tip": "<which offer to negotiate and how>"
}`, 900);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 5. Referral Finder + Intro Draft ─────────────────────────────────────
app.post('/api/ai/referral', async (req, res) => {
  const { jobTitle, company, userRole, userSkills, linkedinUrl } = req.body || {};
  if (!jobTitle || !company) return res.status(400).json({ error: 'jobTitle and company required' });
  try {
    const result = await aiJson(`You are a networking coach for Indian tech professionals.
Target job: "${jobTitle}" at ${company}
Candidate: ${userRole || 'software engineer'}, skills: ${userSkills || 'fullstack'}
LinkedIn: ${linkedinUrl || 'not provided'}

Return ONLY valid JSON:
{
  "search_queries": ["LinkedIn search query 1","query 2","query 3"],
  "outreach_message": "<60-80 word LinkedIn connection request message — warm, specific, not spammy>",
  "email_template": "<subject line and 3-paragraph cold email for mutual connection introduction>",
  "platforms_to_check": ["LinkedIn","Blind","Discord communities","Twitter/X"],
  "referral_tip": "<single best tip to get a referral at this company>"
}`, 900);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 6. Weekly Market Pulse ────────────────────────────────────────────────
app.get('/api/market-pulse', async (req, res) => {
  const jobs = getJobs ? getJobs() : [];
  const topRoles = {};
  const topSkills = {};
  jobs.slice(0, 200).forEach(j => {
    const cat = j.category || 'Other';
    topRoles[cat] = (topRoles[cat] || 0) + 1;
    ((j.candidate_required_skills || '').split(',').map(s => s.trim().toLowerCase())).forEach(s => {
      if (s.length > 2) topSkills[s] = (topSkills[s] || 0) + 1;
    });
  });
  const topRolesSorted = Object.entries(topRoles).sort((a,b) => b[1]-a[1]).slice(0,6);
  const topSkillsSorted = Object.entries(topSkills).sort((a,b) => b[1]-a[1]).slice(0,8);

  try {
    const result = await aiJson(`You are a tech job market analyst for India (2025).
Live data snapshot — Top categories: ${topRolesSorted.map(([k,v])=>`${k}(${v})`).join(', ')}
Top skills: ${topSkillsSorted.map(([k,v])=>`${k}(${v})`).join(', ')}

Return ONLY valid JSON:
{
  "week_summary": "<2 sentences on Indian tech market this week>",
  "hottest_roles": [{"role":"<name>","demand":"<high|medium>","trend":"<up|down|stable>","avg_salary":"<Xk-Yk LPA>"}],
  "hot_skills": [{"skill":"<name>","momentum":"<rising|peak|declining>","reason":"<1 line>"}],
  "cold_skills": ["skill1","skill2"],
  "cities_hiring": [{"city":"<name>","count":<n>,"dominant_role":"<role>"}],
  "job_seeker_tip": "<actionable tip for this week>",
  "generated_at": "<ISO timestamp>"
}`, 1024);
    result.generated_at = new Date().toISOString();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 7. Profile Completeness Score ─────────────────────────────────────────
app.get('/api/profile-score', (req, res) => {
  const profile = profileStore[req.uid] || {};
  const prefs = profile.prefs || {};
  const checks = [
    { key: 'name',     label: 'Name',             weight: 10, done: !!profile.name },
    { key: 'email',    label: 'Email',             weight: 10, done: !!profile.email },
    { key: 'role',     label: 'Target role',       weight: 20, done: !!prefs.role },
    { key: 'skills',   label: 'Skills',            weight: 20, done: !!(prefs.skills && prefs.skills.split(',').filter(Boolean).length >= 3) },
    { key: 'location', label: 'Location',          weight: 10, done: !!prefs.location },
    { key: 'exp',      label: 'Experience level',  weight: 10, done: !!prefs.exp },
    { key: 'salary',   label: 'Salary expectation',weight: 10, done: !!prefs.salMin },
    { key: 'ats',      label: 'Resume uploaded',   weight: 10, done: !!profile.ats_score },
  ];
  const score = checks.filter(c => c.done).reduce((s,c) => s + c.weight, 0);
  const missing = checks.filter(c => !c.done).map(c => ({ key: c.key, label: c.label, impact: `+${c.weight}% score` }));
  res.json({ score, checks, missing });
});

// ── 8. Interview Scheduler helper (slot suggestions) ──────────────────────
app.post('/api/ai/interview-slots', async (req, res) => {
  const { hrMessage, timezone } = req.body || {};
  if (!hrMessage) return res.status(400).json({ error: 'hrMessage required' });
  const now = new Date();
  try {
    const result = await aiJson(`Today is ${now.toDateString()}. Timezone: ${timezone || 'IST (UTC+5:30)'}.
HR message: "${hrMessage.slice(0, 400)}"

Suggest 3 interview slots that work for an Indian candidate. Return ONLY valid JSON:
{
  "suggested_slots": [
    {"date":"<Day, DD Mon>","time":"<HH:MM IST>","label":"<e.g. Tomorrow morning>"},
    {"date":"<Day, DD Mon>","time":"<HH:MM IST>","label":"<label>"},
    {"date":"<Day, DD Mon>","time":"<HH:MM IST>","label":"<label>"}
  ],
  "reply_email": "<professional 3-4 sentence email reply with the slots>",
  "calendar_tip": "<tip about blocking calendar, sending invite, etc.>"
}`, 700);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── 18 Automation Templates ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const AUTO_TEMPLATES = [
  // ── WhatsApp ──────────────────────────────────────────────────────────
  {
    id: 'wa_new_job',     app: 'whatsapp', appLabel: 'WhatsApp',   trigger: 'job.new',
    icon: '💬', title: 'New matching job → WhatsApp alert',
    desc: 'Instant message the moment a job matching your skills appears',
    preview: '🔔 *New Job Alert!*\n📌 Senior React Developer @ Razorpay\n📍 Bangalore · ₹25-35 LPA\n\n👉 Apply: hire.radar/j/123',
    appColor: '#25D366', category: 'whatsapp',
  },
  {
    id: 'wa_expiry',      app: 'whatsapp', appLabel: 'WhatsApp',   trigger: 'job.expiry',
    icon: '⏰', title: 'Expiring job → WhatsApp urgent nudge',
    desc: 'Alert when a saved job is 25+ days old — apply before it closes',
    preview: '⏰ *Urgent — Apply Today!*\n📌 Backend Engineer @ Swiggy\nPosted 26 days ago — closing soon!\n\n👉 Apply now: hire.radar/j/456',
    appColor: '#25D366', category: 'whatsapp',
  },
  {
    id: 'wa_followup',    app: 'whatsapp', appLabel: 'WhatsApp',   trigger: 'job.followup',
    icon: '🔁', title: 'No reply 7 days → WhatsApp follow-up nudge',
    desc: 'Auto-remind yourself to follow up when HR ghosts you',
    preview: '📬 *Follow-Up Reminder*\nYou applied to Zepto (SDE-2) 7 days ago.\n\n💡 Tip: Email the hiring manager directly.\n\n📧 careers@zepto.co.in',
    appColor: '#25D366', category: 'whatsapp',
  },
  {
    id: 'wa_interview',   app: 'whatsapp', appLabel: 'WhatsApp',   trigger: 'job.interview',
    icon: '📅', title: 'Interview scheduled → WhatsApp reminder',
    desc: '1 hour before your interview — get a prep reminder on WhatsApp',
    preview: '🎯 *Interview in 1 Hour!*\n🏢 CRED — Product Engineer\n⏰ 3:00 PM IST · Google Meet\n\n✅ Review: DSA, System Design\n📄 Resume saved ↗',
    appColor: '#25D366', category: 'whatsapp',
  },
  {
    id: 'wa_weekly',      app: 'whatsapp', appLabel: 'WhatsApp',   trigger: 'weekly',
    icon: '📊', title: 'Sunday digest → WhatsApp top 5 jobs',
    desc: 'Every Sunday morning — top 5 matching jobs of the week',
    preview: '☀️ *This Week\'s Top Jobs*\n1. Staff Eng @ PhonePe — ₹40L\n2. EM @ Meesho — ₹45L\n3. SDE3 @ CRED — ₹38L\n...\n\n👉 Full list: hire.radar/week',
    appColor: '#25D366', category: 'whatsapp',
  },
  // ── Gmail ─────────────────────────────────────────────────────────────
  {
    id: 'gmail_new_job',  app: 'gmail',    appLabel: 'Gmail',      trigger: 'job.new',
    icon: '📧', title: 'New matching job → Gmail alert',
    desc: 'Rich email with full job details, salary, and direct apply link',
    preview: 'Subject: 🔔 New Match: Senior React Dev @ Razorpay (₹30L)\n\nHi there,\nA job matching your profile just dropped...',
    appColor: '#EA4335', category: 'gmail',
  },
  {
    id: 'gmail_daily',    app: 'gmail',    appLabel: 'Gmail',      trigger: 'daily',
    icon: '☀️', title: 'Daily job digest → Gmail',
    desc: 'Every morning at 8 AM — all new matching jobs from last 24 hours',
    preview: 'Subject: ☀️ Your Daily Jobs — 12 new matches today\n\nGood morning! Here are your matches...',
    appColor: '#EA4335', category: 'gmail',
  },
  {
    id: 'gmail_applied',  app: 'gmail',    appLabel: 'Gmail',      trigger: 'job.applied',
    icon: '✅', title: 'Job applied → Gmail confirmation',
    desc: 'Application confirmation email with company info and follow-up tips',
    preview: 'Subject: ✅ Applied — Backend Eng @ Swiggy\n\nYou applied today. Follow up in 7 days if no response...',
    appColor: '#EA4335', category: 'gmail',
  },
  {
    id: 'gmail_followup', app: 'gmail',    appLabel: 'Gmail',      trigger: 'job.followup',
    icon: '📝', title: 'No reply 7 days → Gmail draft follow-up',
    desc: 'Auto-draft a professional follow-up email for you to review & send',
    preview: 'Subject: Following up — Backend Engineer Application\n\nDear Hiring Manager,\nI applied 7 days ago and wanted to follow up...',
    appColor: '#EA4335', category: 'gmail',
  },
  // ── Slack ─────────────────────────────────────────────────────────────
  {
    id: 'slack_new_job',  app: 'slack',    appLabel: 'Slack',      trigger: 'job.new',
    icon: '💼', title: 'New matching job → Slack post',
    desc: 'Post to your #jobs channel instantly when a match appears',
    preview: '🔔 *New job match!*\n*Senior Backend Eng* @ Meesho\n📍 Bangalore · 💰 ₹28-38 LPA\n<https://hire.radar/j/789|Apply Now>',
    appColor: '#4A154B', category: 'slack',
  },
  {
    id: 'slack_applied',  app: 'slack',    appLabel: 'Slack',      trigger: 'job.applied',
    icon: '📨', title: 'Job applied → Slack notification',
    desc: 'Log every application to Slack for accountability & tracking',
    preview: '✅ Applied to *SDE-2 @ Zepto*\n📅 Today · Status: Under review\n_You can follow up after 7 days_',
    appColor: '#4A154B', category: 'slack',
  },
  {
    id: 'slack_expiry',   app: 'slack',    appLabel: 'Slack',      trigger: 'weekly',
    icon: '⚡', title: 'Expiring saved jobs → Slack weekly alert',
    desc: 'Sunday Slack message listing all saved jobs about to expire',
    preview: '⏰ *3 saved jobs expiring this week — apply now!*\n• Staff Eng @ CRED (28d)\n• ML Eng @ Juspay (26d)\n• SDE @ Ditto (25d)',
    appColor: '#4A154B', category: 'slack',
  },
  // ── Google Sheets ─────────────────────────────────────────────────────
  {
    id: 'sheets_applied', app: 'sheets',   appLabel: 'Google Sheets', trigger: 'job.applied',
    icon: '📊', title: 'Job applied → Google Sheets row',
    desc: 'Auto-add every application to your Sheets tracker — title, company, date, status',
    preview: 'Row added → A2: "Senior React Dev" | B2: "Razorpay" | C2: "Bangalore" | D2: "Applied" | E2: "26 Jan 2026"',
    appColor: '#0F9D58', category: 'sheets',
  },
  {
    id: 'sheets_saved',   app: 'sheets',   appLabel: 'Google Sheets', trigger: 'job.saved',
    icon: '🔖', title: 'Job saved → Google Sheets row',
    desc: 'Every bookmarked job lands in Sheets — never lose a good lead',
    preview: 'Row added → A5: "EM @ PhonePe" | B5: "₹45 LPA" | C5: "Saved" | D5: "Hyderabad"',
    appColor: '#0F9D58', category: 'sheets',
  },
  {
    id: 'sheets_status',  app: 'sheets',   appLabel: 'Google Sheets', trigger: 'job.status',
    icon: '🔄', title: 'Status change → Sheets update',
    desc: 'When you update to Interviewing/Offered/Rejected — Sheets row updates automatically',
    preview: 'Row D7 updated: "Applied" → "Interviewing" | E7: "Updated 27 Jan 2026"',
    appColor: '#0F9D58', category: 'sheets',
  },
  // ── Calendar ──────────────────────────────────────────────────────────
  {
    id: 'cal_interview',  app: 'calendar', appLabel: 'Calendar',   trigger: 'job.interview',
    icon: '📅', title: 'Interview scheduled → Google Calendar event',
    desc: 'Auto-create calendar event with company name, role, and Meet/Zoom link',
    preview: '📅 Event created:\nCRED — Product Eng Interview\n📆 Fri, 30 Jan · 3:00–4:00 PM IST\n🔗 meet.google.com/xyz-abc',
    appColor: '#1967D2', category: 'calendar',
  },
  {
    id: 'cal_followup',   app: 'calendar', appLabel: 'Calendar',   trigger: 'job.followup',
    icon: '🔔', title: 'No reply 7 days → Calendar reminder',
    desc: 'Block time in your calendar to send the follow-up email',
    preview: '📅 Reminder added:\n"Follow up — Swiggy Backend Eng"\n📆 Mon, 3 Feb · 10:00 AM IST',
    appColor: '#1967D2', category: 'calendar',
  },
  // ── LinkedIn + Naukri source ───────────────────────────────────────────
  {
    id: 'linkedin_wa',    app: 'whatsapp', appLabel: 'WhatsApp',   trigger: 'job.new',
    icon: '🔗', title: 'New LinkedIn job → WhatsApp alert',
    desc: 'Only LinkedIn-sourced matches → instant WhatsApp (filter by source)',
    preview: '🔗 *LinkedIn Job Alert*\n📌 Principal Eng @ Flipkart\n📍 Bangalore · ₹50L+\nVia LinkedIn · Easy Apply ✅',
    appColor: '#0077B5', category: 'linkedin',
  },
  {
    id: 'naukri_wa',      app: 'whatsapp', appLabel: 'WhatsApp',   trigger: 'job.new',
    icon: '📋', title: 'New Naukri job → WhatsApp alert',
    desc: 'Only Naukri-sourced matches → instant WhatsApp (filter by source)',
    preview: '📋 *Naukri Job Alert*\n📌 SDE-3 @ Amazon\n📍 Hyderabad · ₹35-50 LPA\nVia Naukri.com ✅',
    appColor: '#FF7555', category: 'naukri',
  },
];

// Automation config store (per user, per template id)
const AUTO_CFG_FILE = path.join(DATA_DIR, 'auto-config.json');
let autoCfgStore = {};
try { autoCfgStore = JSON.parse(fs.readFileSync(AUTO_CFG_FILE, 'utf8')); } catch {}

function saveAutoCfg() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUTO_CFG_FILE + '.tmp', JSON.stringify(autoCfgStore));
    fs.renameSync(AUTO_CFG_FILE + '.tmp', AUTO_CFG_FILE);
  } catch (e) { console.error('[auto-cfg] save failed:', e.message); }
}

function userAutoCfg(uid) {
  if (!autoCfgStore[uid]) autoCfgStore[uid] = {};
  return autoCfgStore[uid];
}

// GET /api/auto-templates — static template list
app.get('/api/auto-templates', (req, res) => {
  res.json(AUTO_TEMPLATES.map(t => ({
    id: t.id, app: t.app, appLabel: t.appLabel, trigger: t.trigger,
    icon: t.icon, title: t.title, desc: t.desc, preview: t.preview,
    appColor: t.appColor, category: t.category,
  })));
});

// GET /api/auto-config — user's enabled map
app.get('/api/auto-config', (req, res) => {
  res.json(userAutoCfg(req.uid));
});

// POST /api/auto-config/:id — toggle on/off
app.post('/api/auto-config/:id', (req, res) => {
  const { id } = req.params;
  const tmpl = AUTO_TEMPLATES.find(t => t.id === id);
  if (!tmpl) return res.status(400).json({ error: 'Unknown template' });
  const { enabled } = req.body || {};
  const cfg = userAutoCfg(req.uid);
  cfg[id] = { ...( cfg[id] || {} ), enabled: Boolean(enabled), updatedAt: new Date().toISOString() };
  saveAutoCfg();
  res.json({ ok: true });
});

// POST /api/vs/register-flow — called when viaSocket embed fires a 'flow' event
// The flow object shape comes from viaSocket's embed SDK; we log it and extract what we can
app.post('/api/vs/register-flow', (req, res) => {
  const { app_label, flow } = req.body || {};
  console.log('[vs-register-flow] uid:', req.uid, 'app:', app_label, 'flow:', JSON.stringify(flow));
  if (!app_label || !APP_META[app_label]) return res.status(400).json({ error: 'Unknown app' });

  // Extract useful fields — viaSocket flow event shape may vary; capture everything
  const script_id = flow?.script_id || flow?.scriptId || flow?.flow_id || flow?._id || null;
  const action_version_id = flow?.action_version_id || flow?.actionVersionId || null;
  const auth_id = flow?.auth_id || flow?.authId || flow?.account_id || flow?.accountId || null;
  const service_id = flow?.service_id || flow?.serviceId || flow?.service?.id || null;

  const conns = userConns(req.uid);
  // Merge — preserve fields already stored unless overridden
  conns[app_label] = {
    ...(conns[app_label] || {}),
    app_label,
    ...(service_id      ? { service_id }      : {}),
    ...(auth_id         ? { auth_id }         : {}),
    ...(script_id       ? { script_id }       : {}),
    ...(action_version_id ? { action_version_id } : {}),
    enabled: true,
    connectedAt: new Date().toISOString(),
  };
  saveConnStore();
  res.json({ ok: true, script_id, action_version_id, auth_id });
});

// POST /api/auto-test/:id — fire a test delivery for an enabled automation
app.post('/api/auto-test/:id', async (req, res) => {
  const { id } = req.params;
  const tmpl = AUTO_TEMPLATES.find(t => t.id === id);
  if (!tmpl) return res.status(400).json({ error: 'Unknown template' });
  const autoCfg = userAutoCfg(req.uid);
  if (!autoCfg[id]?.enabled) return res.status(400).json({ error: 'Automation not enabled' });
  const conns = userConns(req.uid);
  const conn = conns[tmpl.app];
  if (!conn?.script_id || !conn?.action_version_id) return res.status(400).json({ error: 'App not connected' });
  const testJob = {
    title: 'Senior Software Engineer (Test)', company: 'Acme Corp', location: 'Bangalore',
    salary: '₹20-30 LPA', url: 'https://example.com/job/test', category: 'Engineering',
    id: 'test-' + Date.now(),
  };
  try {
    const payload = buildVsInputData(tmpl.app, conn, tmpl.trigger, testJob, tmpl.id);
    const r = await fetch(`${VS_RUN}/${conn.script_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(12000),
    });
    const status = r.status;
    console.log(`[vs-test] ${id} → ${status}`);
    if (status >= 200 && status < 300) return res.json({ ok: true, status });
    const body = await r.text();
    return res.status(502).json({ error: `viaSocket returned ${status}`, body: body.slice(0, 200) });
  } catch(e) {
    console.warn(`[vs-test] ${id} failed: ${e.message}`);
    return res.status(502).json({ error: e.message });
  }
});
