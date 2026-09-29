require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const crypto = require('crypto');
const fs = require('fs');
const { createLiveSource } = require('./jobs-live');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ORG_ID = '4160';
const PROJECT_ID = 'proj9XH3L4TM';
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
      messages: [{ role:'user', content: [
        { type:'document', source:{ type:'base64', media_type:mime, data:base64 } },
        { type:'text', text:`Extract job preferences from this resume as JSON only:
{"role":"<job title>","skills":"<top 6 skills comma-separated>","exp":"<fresher|junior|mid|senior|lead>","type":"<full_time|contract|part_time>","location":"<bangalore|mumbai|delhi|hyderabad|pune|chennai|noida|gurgaon|ahmedabad|india|remote>","salMin":"<5|8|10|15|20|30|50>"}
Return ONLY valid JSON.` },
      ]}],
    });

    const raw = message.content.find(b => b.type === 'text')?.text || '{}';
    const m = raw.match(/\{[\s\S]*\}/);
    res.json({ prefs: m ? JSON.parse(m[0]) : {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Automations: viaSocket webhook-trigger flows fed by HireRadar events ──────
// Webhook URLs identify viaSocket scripts, so they stay server-side: never
// returned to the browser and never logged.

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
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
