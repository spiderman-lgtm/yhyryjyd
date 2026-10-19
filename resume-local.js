// Resume analysis without an AI key: text extraction + rule-based scoring.
// Returns the same { prefs, ats } shape as the AI prompt in server.js.

const { PDFParse } = require('pdf-parse');

async function extractText(buffer, mime, filename = '') {
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(filename) || buffer.subarray(0, 5).toString() === '%PDF-';
  if (!isPdf) return buffer.toString('utf8');
  const parser = new PDFParse({ data: buffer });
  try { return (await parser.getText()).text || ''; }
  finally { await parser.destroy().catch(() => {}); }
}

const TRACKS = {
  'Frontend Developer':     ['React', 'Angular', 'Vue', 'Next.js', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Tailwind', 'Redux'],
  'Backend Developer':      ['Node.js', 'Java', 'Spring', 'Python', 'Django', 'FastAPI', 'Go', 'SQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka', 'REST', 'Microservices'],
  'Full Stack Developer':   ['React', 'Node.js', 'JavaScript', 'TypeScript', 'SQL', 'MongoDB', 'REST', 'Docker'],
  'Data Scientist':         ['Python', 'Pandas', 'NumPy', 'Scikit-learn', 'SQL', 'Statistics', 'Tableau', 'Power BI', 'Machine Learning'],
  'ML Engineer':            ['Python', 'PyTorch', 'TensorFlow', 'Machine Learning', 'Deep Learning', 'NLP', 'LLM', 'MLOps'],
  'Data Engineer':          ['Python', 'SQL', 'Spark', 'Airflow', 'Kafka', 'Snowflake', 'ETL', 'AWS'],
  'DevOps Engineer':        ['Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Terraform', 'Jenkins', 'CI/CD', 'Linux', 'Ansible'],
  'Mobile Developer':       ['Android', 'Kotlin', 'Swift', 'iOS', 'Flutter', 'React Native', 'Dart'],
  'QA Engineer':            ['Selenium', 'Cypress', 'Playwright', 'Jest', 'Test Automation', 'API Testing', 'JMeter'],
};

const ALL_SKILLS = [...new Set(Object.values(TRACKS).flat().concat(['C++', 'C#', '.NET', 'Rust', 'PHP', 'Laravel', 'Ruby', 'GraphQL', 'Git', 'MySQL', 'Firebase', 'Figma']))];

const CITIES = [
  ['bangalore', /\b(bangalore|bengaluru)\b/], ['mumbai', /\b(mumbai|navi mumbai|thane)\b/],
  ['delhi', /\b(new delhi|delhi)\b/], ['hyderabad', /\bhyderabad\b/], ['pune', /\bpune\b/],
  ['chennai', /\bchennai\b/], ['noida', /\bnoida\b/], ['gurgaon', /\b(gurgaon|gurugram)\b/],
  ['ahmedabad', /\bahmedabad\b/], ['remote', /\bremote\b/],
];

const SECTIONS = {
  summary:    /\b(summary|profile|objective|about me)\b/i,
  experience: /\b(experience|employment|work history|internships?)\b/i,
  education:  /\b(education|academic|qualifications?)\b/i,
  skills:     /\b(skills|technologies|tech stack|technical proficiency)\b/i,
  projects:   /\bprojects?\b/i,
};

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); }

function hasSkill(low, skill) {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(skill.toLowerCase())}($|[^a-z0-9+#])`).test(low);
}

function yearsOfExperience(text) {
  const stated = [...text.matchAll(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs)/gi)].map(m => parseFloat(m[1])).filter(n => n < 40);
  if (stated.length) return Math.max(...stated);
  // fall back to summing date ranges such as "2019 - 2022" or "Jan 2021 – Present"
  const now = new Date().getFullYear();
  let total = 0;
  const EDU = /\b(b\.?\s?tech|b\.?e\b|m\.?\s?tech|bachelor|master|mba|bca|mca|b\.?sc|m\.?sc|degree|university|college|school|cgpa|gpa|class (x|xii|10|12))/i;
  for (const m of text.matchAll(/\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current|now)\b/gi)) {
    if (EDU.test(text.slice(Math.max(0, m.index - 150), m.index + 60))) continue;
    const from = +m[1], to = /^\d/.test(m[2]) ? +m[2] : now;
    if (to >= from && to - from < 15) total += to - from;
  }
  return total;
}

function level(years) {
  if (years < 1) return 'fresher';
  if (years < 3) return 'junior';
  if (years < 6) return 'mid';
  if (years < 10) return 'senior';
  return 'lead';
}

const SALARY_BY_LEVEL = { fresher: '5', junior: '8', mid: '15', senior: '20', lead: '30' };

function analyzeResume(text) {
  const low = text.toLowerCase();
  const found = ALL_SKILLS.filter(s => hasSkill(low, s));

  const ranked = Object.entries(TRACKS)
    .map(([role, skills]) => ({ role, hits: skills.filter(s => found.includes(s)).length, skills }))
    .sort((a, b) => b.hits - a.hits);
  const fe = ranked.find(r => r.role === 'Frontend Developer').hits;
  const be = ranked.find(r => r.role === 'Backend Developer').hits;
  const track = fe >= 3 && be >= 3 ? ranked.find(r => r.role === 'Full Stack Developer') : ranked[0];
  const role = track.hits ? track.role : 'Software Engineer';
  const missing = track.skills.filter(s => !found.includes(s)).slice(0, 4);
  const topSkills = [...track.skills.filter(s => found.includes(s)), ...found.filter(s => !track.skills.includes(s))];

  const years = yearsOfExperience(text);
  const exp = level(years);
  const location = CITIES.find(([, re]) => re.test(low))?.[0] || 'india';

  const sections = {
    contact: /[\w.+-]+@[\w-]+\.[\w.]+/.test(text) && /(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/.test(text),
    ...Object.fromEntries(Object.entries(SECTIONS).map(([k, re]) => [k, re.test(text)])),
  };
  const metrics = (text.match(/\d+\s*%|\d+x\b|\d+\+?\s*(users|customers|clients|requests)/gi) || []).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  const hasLinks = /linkedin\.com|github\.com/i.test(text);

  const sectionCount = Object.values(sections).filter(Boolean).length;
  const score = Math.min(100, Math.round(
    sectionCount * 7 +                       // up to 42
    Math.min(found.length, 12) * 2.5 +       // up to 30
    Math.min(metrics, 4) * 3 +               // up to 12
    (words >= 250 && words <= 1100 ? 8 : 3) +
    (hasLinks ? 8 : 0)
  ));
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D';

  const strengths = [];
  if (found.length >= 8) strengths.push(`Strong skill coverage: ${found.length} relevant technologies listed`);
  if (metrics >= 2) strengths.push('Achievements are backed by numbers');
  if (sections.projects) strengths.push('Projects section shows hands-on work');
  if (hasLinks) strengths.push('LinkedIn/GitHub links are present');
  if (sectionCount >= 5) strengths.push('All the standard resume sections are present');

  const gaps = [];
  const suggestions = [];
  for (const [k, ok] of Object.entries(sections)) {
    if (!ok) { gaps.push(`No ${k} section found`); suggestions.push(`Add a clear "${k[0].toUpperCase() + k.slice(1)}" heading so ATS can parse it`); }
  }
  if (metrics < 2) { gaps.push('Few measurable results'); suggestions.push('Quantify impact, e.g. "cut API latency by 40%" or "served 10k users"'); }
  if (missing.length) suggestions.push(`Add ${role} keywords you know: ${missing.join(', ')}`);
  if (!hasLinks) suggestions.push('Add your LinkedIn and GitHub profile links');
  if (words > 1100) suggestions.push('Trim to 1–2 pages; recruiters skim');
  if (words < 250) suggestions.push('Add more detail on your work and projects');

  return {
    prefs: {
      role,
      skills: topSkills.slice(0, 6).join(', '),
      exp,
      type: 'full_time',
      location,
      salMin: SALARY_BY_LEVEL[exp],
    },
    ats: {
      score, grade,
      found_skills: topSkills.slice(0, 12),
      missing_skills: missing,
      strengths: strengths.slice(0, 3).length ? strengths.slice(0, 3) : ['Resume text is readable by ATS'],
      gaps: gaps.slice(0, 3),
      suggestions: suggestions.slice(0, 4),
      sections,
    },
  };
}

module.exports = { extractText, analyzeResume };
