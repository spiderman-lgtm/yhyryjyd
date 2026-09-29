// Live jobs from companies' public career boards (Greenhouse, Lever).
// These are the boards' official public APIs for embedding job listings; no key needed.
// Configure with JOB_BOARDS, e.g. "lever:cred,greenhouse:postman".

const crypto = require('crypto');

const INDIA_WORDS = [
  'india', 'bangalore', 'bengaluru', 'mumbai', 'pune', 'hyderabad', 'chennai', 'delhi',
  'gurgaon', 'gurugram', 'noida', 'kolkata', 'ahmedabad', 'jaipur', 'kochi', 'indore',
  'chandigarh', 'coimbatore', 'thiruvananthapuram', 'mysore', 'mysuru',
];

const CATEGORY_RULES = [
  ['AI/ML',        /\b(machine learning|ml|ai|llm|genai|generative|nlp|computer vision|deep learning)\b/i],
  ['Data Science', /\b(data scien|data analy|analytics|business intelligence|bi analyst)\w*/i],
  ['Data Engineering', /\bdata engineer/i],
  ['DevOps',       /\b(devops|sre|site reliability|platform engineer|infrastructure|cloud engineer|kubernetes)\b/i],
  ['Security',     /\b(security|appsec|infosec|penetration)\b/i],
  ['Mobile',       /\b(android|ios|mobile|flutter|react native)\b/i],
  ['Frontend',     /\b(front[\s-]?end|ui engineer|react developer|web developer)\b/i],
  ['Full Stack',   /\bfull[\s-]?stack\b/i],
  ['Backend',      /\b(back[\s-]?end|java|golang|python developer|node|api engineer|server)\b/i],
  ['Product',      /\bproduct manager\b/i],
  ['QA',           /\b(qa|quality|sdet|test engineer|automation test)\b/i],
];

const SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Vue', 'Angular', 'Node.js', 'Python', 'Java',
  'Go', 'Golang', 'Kotlin', 'Swift', 'Flutter', 'React Native', 'Rust', 'C++', 'Scala', 'Ruby',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Kafka', 'Spark', 'Airflow', 'AWS', 'GCP',
  'Azure', 'Docker', 'Kubernetes', 'Terraform', 'GraphQL', 'Django', 'Spring', 'FastAPI',
  'TensorFlow', 'PyTorch', 'LLM', 'Machine Learning', 'Tableau', 'Power BI',
];

function numericId(key) {
  return parseInt(crypto.createHash('sha1').update(key).digest('hex').slice(0, 12), 16);
}

function plainText(html) {
  return String(html || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function categorize(title) {
  const hit = CATEGORY_RULES.find(([, re]) => re.test(title));
  return hit ? hit[0] : 'Other';
}

function skillsIn(text) {
  const low = ` ${text.toLowerCase()} `;
  return SKILLS.filter(s => {
    const k = s.toLowerCase().replace(/[.+]/g, m => '\\' + m);
    return new RegExp(`[^a-z]${k}[^a-z]`).test(low);
  }).slice(0, 6);
}

function jobType(commitment) {
  const c = String(commitment || '').toLowerCase();
  if (c.includes('contract')) return 'contract';
  if (c.includes('part')) return 'part_time';
  if (c.includes('intern')) return 'internship';
  return 'full_time';
}

function prettyCompany(slug) {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function normalize({ key, title, company, location, url, description, commitment, postedAt }) {
  const text = plainText(description);
  return {
    id: numericId(key),
    title,
    company_name: company,
    company_logo: null,
    candidate_required_location: location || 'Not specified',
    url,
    description: text.slice(0, 600),
    job_type: jobType(commitment),
    salary: '',
    publication_date: new Date(postedAt || Date.now()).toISOString(),
    tags: skillsIn(`${title} ${text}`),
    category: categorize(title),
    _india: INDIA_WORDS.some(w => (location || '').toLowerCase().includes(w)),
    _source: 'careers',
  };
}

async function getJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchGreenhouse(slug, name) {
  const data = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`);
  return (data.jobs || []).map(j => normalize({
    key: `greenhouse:${slug}:${j.id}`,
    title: j.title,
    company: name,
    location: j.location?.name,
    url: j.absolute_url,
    description: j.content,
    postedAt: j.first_published || j.updated_at,
  }));
}

async function fetchLever(slug, name) {
  const data = await getJSON(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
  return (Array.isArray(data) ? data : []).map(j => normalize({
    key: `lever:${slug}:${j.id}`,
    title: j.text,
    company: name,
    location: j.categories?.location || (j.categories?.allLocations || []).join(', '),
    url: j.hostedUrl,
    description: j.descriptionPlain || j.description,
    commitment: j.categories?.commitment,
    postedAt: j.createdAt,
  }));
}

const FETCHERS = { greenhouse: fetchGreenhouse, lever: fetchLever };

// "lever:cred" or "lever:cred=CRED" (display name after =)
function parseBoards(spec) {
  return String(spec || '').split(',').map(s => s.trim()).filter(Boolean).map(entry => {
    const [kindSlug, display] = entry.split('=');
    const [kind, slug] = kindSlug.split(':').map(s => (s || '').trim());
    return { kind: kind.toLowerCase(), slug, name: (display || '').trim() || prettyCompany(slug || '') };
  }).filter(b => FETCHERS[b.kind] && /^[A-Za-z0-9._-]+$/.test(b.slug || ''));
}

function createLiveSource({ boards, indiaOnly = true, refreshMinutes = 15 }) {
  const list = parseBoards(boards);
  const status = list.map(b => ({ board: `${b.kind}:${b.slug}`, company: b.name, ok: null, jobs: 0, error: null, fetchedAt: null }));
  let jobs = [];
  let refreshing = null;

  async function refresh() {
    if (!list.length) return jobs;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const results = await Promise.allSettled(list.map(b => FETCHERS[b.kind](b.slug, b.name)));
      const next = [];
      results.forEach((r, i) => {
        const s = status[i];
        s.fetchedAt = new Date().toISOString();
        if (r.status === 'fulfilled') {
          const kept = indiaOnly ? r.value.filter(j => j._india) : r.value;
          s.ok = true; s.error = null; s.jobs = kept.length;
          next.push(...kept);
        } else {
          s.ok = false; s.error = r.reason?.message || 'fetch failed';
          console.warn(`[jobs] ${s.board} failed: ${s.error}`);
          // keep this board's previous jobs so one outage doesn't look like every job was removed
          next.push(...jobs.filter(j => j.company_name === s.company));
        }
      });
      const seen = new Set();
      jobs = next.filter(j => !seen.has(j.id) && seen.add(j.id))
        .sort((a, b) => new Date(b.publication_date) - new Date(a.publication_date));
      refreshing = null;
      return jobs;
    })();
    return refreshing;
  }

  if (list.length) setInterval(refresh, refreshMinutes * 60 * 1000);

  return {
    configured: list.length > 0,
    refresh,
    jobs: () => jobs,
    status: () => status,
  };
}

module.exports = { createLiveSource, parseBoards, normalize };
