/**
 * Single source of truth for all Walkover copy and data.
 *
 * Content was gathered from walkover.in, blog.walkover.in and Walkover's
 * public company profiles (Oct 2026). Anything the team should double-check
 * before launch is marked with `// verify`.
 */

export const company = {
  name: "Walkover",
  legalName: "Walkover Web Solutions Private Limited",
  tagline: "A communication and AI product company",
  founded: 2010,
  founders: ["Pushpendra Agrawal", "Ankita Agrawal", "Shubhendra Agrawal"],
  city: "Indore",
  description:
    "Walkover is a product company from Indore, India — the team behind MSG91, Giddh, viaSocket and GTWY AI. Since 2010 we have been building communication, automation and AI products used by businesses around the world.",
  address: {
    lines: ["5th Floor, Wing B, LIC Tower", "28-29-30, PU-03, Scheme No. 54", "Indore, Madhya Pradesh 452011"],
    mapUrl: "https://maps.google.com/?q=LIC+Tower+Scheme+54+Indore",
  },
  urls: {
    site: "https://walkover.in",
    careers: "https://walkover.in/careers",
    blog: "https://blog.walkover.in",
  },
  socials: [
    { label: "LinkedIn", href: "https://www.linkedin.com/company/walkover" },
    { label: "Facebook", href: "https://www.facebook.com/walkoverltd/" },
    { label: "GitHub", href: "https://github.com/walkover-web-solution" },
    { label: "Blog", href: "https://blog.walkover.in" },
  ],
} as const;

export const stats = [
  { value: 2010, label: "Founded in Indore", format: "year" as const },
  { value: 1, suffix: "B+", label: "Messages delivered every month via MSG91" },
  { value: 10000, suffix: "+", label: "Businesses served worldwide" },
  { value: 40, suffix: "+", label: "Products built and shipped" },
  { value: 280, suffix: "+", label: "Builders on the team" }, // verify
  { value: 6, label: "Live products in the family" },
];

export type Product = {
  slug: string;
  name: string;
  kicker: string;
  oneLiner: string;
  description: string;
  points: string[];
  url: string;
  color: string;
  ink: string;
  visual: "msg91" | "giddh" | "viasocket" | "gtwy" | "agents" | "docstar";
  since?: string;
};

export const products: Product[] = [
  {
    slug: "msg91",
    name: "MSG91",
    kicker: "Cloud communication",
    oneLiner: "The messaging layer for thousands of businesses.",
    description:
      "Walkover's flagship. An A2P communication platform with SMS, voice, WhatsApp, email and OTP authentication APIs — delivering over a billion messages every month.",
    points: ["SMS, voice & email APIs", "OTP & authentication", "1B+ messages / month"],
    url: "https://msg91.com",
    color: "#3D7BFF",
    ink: "#0A1A3F",
    visual: "msg91",
    since: "2010",
  },
  {
    slug: "viasocket",
    name: "viaSocket",
    kicker: "Workflow automation",
    oneLiner: "Connect your apps. Automate the busywork.",
    description:
      "An AI-driven workflow automation platform that connects thousands of applications and automates tasks without code. It began life as Socket — an API integration tool with its own marketplace.",
    points: ["No-code workflows", "Thousands of app integrations", "AI-assisted automation"],
    url: "https://viasocket.com",
    color: "#FF6A3D",
    ink: "#3A1406",
    visual: "viasocket",
  },
  {
    slug: "gtwy",
    name: "GTWY AI",
    kicker: "AI gateway",
    oneLiner: "Every leading model, one API.",
    description:
      "GTWY unifies leading LLMs and AI providers into a single, scalable API layer — with routing, fallbacks, spend monitoring and model switching without vendor lock-in.",
    points: ["Unified API for many models", "Fallbacks & load balancing", "Spend & usage monitoring"],
    url: "https://gtwy.ai",
    color: "#9B7BFF",
    ink: "#1E1240",
    visual: "gtwy",
  },
  {
    slug: "giddh",
    name: "Giddh",
    kicker: "Accounting",
    oneLiner: "Accounting, unified with automation.",
    description:
      "A modern online accounting platform that brings bookkeeping, invoicing and GST compliance together — so finance runs on automation, not spreadsheets.",
    points: ["Online accounting", "Invoicing & GST", "Automated financial workflows"],
    url: "https://giddh.com",
    color: "#22C59A",
    ink: "#05301F",
    visual: "giddh",
    since: "2016",
  },
  {
    slug: "50agents",
    name: "50Agents",
    kicker: "AI agents",
    oneLiner: "Build AI agents in minutes.",
    description:
      "Create, customise and launch AI agents without writing code — and connect them to thousands of apps to automate real work.",
    points: ["No-code agent builder", "Connects to 5,000+ apps", "Launch in minutes"],
    url: "https://50agents.com", // verify
    color: "#FF4F9A",
    ink: "#3D0A22",
    visual: "agents",
  },
  {
    slug: "docstar",
    name: "DocStar",
    kicker: "Docs & publishing",
    oneLiner: "Documentation that writes, ships and scales.",
    description:
      "An all-in-one platform for creating, managing and publishing documentation and blogs — built for developers, teams and content creators.",
    points: ["Docs & blogs in one place", "Built for teams", "Publish anywhere"],
    url: "https://docstar.io", // verify
    color: "#FFC23D",
    ink: "#3B2A04",
    visual: "docstar",
  },
];

export type Milestone = { year: string; title: string; body: string };

export const journey: Milestone[] = [
  {
    year: "2006",
    title: "A social network to take on Orkut",
    body: "A few college friends set out to build a social network. It didn't work out — but it planted the habit of building our own products.",
  },
  {
    year: "2007–09",
    title: "From scratchy code to web hosting",
    body: "The college experiments took the shape of a small web hosting service. The team scattered for academics; the intention to build stayed.",
  },
  {
    year: "2010",
    title: "Walkover is born in Indore",
    body: "Siblings Pushpendra, Ankita and Shubhendra Agrawal found Walkover in the heart of India — and launch MSG91.",
  },
  {
    year: "2010s",
    title: "MSG91 becomes a communication backbone",
    body: "MSG91 grows into one of India's leading A2P messaging platforms, now delivering over a billion messages every month.",
  },
  {
    year: "2016",
    title: "Giddh unifies accounting with automation",
    body: "Walkover steps into finance with Giddh, an online accounting product built for the GST era.",
  },
  {
    year: "2020s", // verify
    title: "Socket grows into viaSocket",
    body: "An API-integration experiment with its own marketplace evolves into viaSocket, an AI-driven workflow automation platform.",
  },
  {
    year: "Now",
    title: "The AI chapter",
    body: "GTWY AI, 50Agents and DocStar join the family — and Walkover leans fully into AI, agents and automation.",
  },
];

export const pillars = [
  {
    key: "communication",
    title: "Communication",
    lead: "Every business is a conversation.",
    body: "We started with the message. SMS, voice, email and OTP at a scale of billions — reliable enough to disappear into the background.",
    tag: "MSG91",
  },
  {
    key: "automation",
    title: "Automation",
    lead: "Busywork is a bug.",
    body: "We connect the tools teams already use and let the repetitive parts run on their own — in workflows, in accounting, everywhere.",
    tag: "viaSocket · Giddh",
  },
  {
    key: "ai",
    title: "AI",
    lead: "Models are a utility. Products are the point.",
    body: "We make AI usable: one gateway for every model, agents anyone can build, and intelligence baked into everything we ship.",
    tag: "GTWY · 50Agents",
  },
  {
    key: "experiments",
    title: "Experimentation",
    lead: "Ship, learn, repeat.",
    body: "40+ products and counting. Some became companies, some became lessons. Both count. Failure here is a step, not a verdict.",
    tag: "The Lab",
  },
];

export type Experiment = {
  name: string;
  status: "Live" | "Evolved" | "Archive" | "Program";
  year?: string;
  body: string;
};

export const experiments: Experiment[] = [
  { name: "The Orkut challenger", status: "Archive", year: "2006", body: "Our very first product: a college-built social network. It failed — and taught us how to start." },
  { name: "Web hosting", status: "Evolved", year: "'07", body: "A tiny hosting service that turned into the company you're looking at." },
  { name: "Phone91", status: "Archive", body: "An early voice & calling experiment from the Walkover family." }, // verify
  { name: "Socket", status: "Evolved", body: "An API integration tool with its own marketplace — today it's viaSocket." },
  { name: "50Agents", status: "Live", body: "No-code AI agents, connected to thousands of apps." },
  { name: "DocStar", status: "Live", body: "Docs and blogs for teams, written and published in one place." },
  { name: "GTWY AI", status: "Live", body: "One API for every leading model — born from our own AI needs." },
  { name: "Walkover Avengers", status: "Program", body: "A six-month build-real-things internship mission in Indore." },
  { name: "#YourIdea #OurResources", status: "Program", body: "Walkover invests its team and infrastructure in ideas worth building." },
];

export const values = [
  { title: "We put people first", body: "Customers and teammates before process. Always." },
  { title: "We pursue passions", body: "The best products come from people who care about the problem." },
  { title: "We embrace failures", body: "40+ products taught us that a failed experiment is just data." },
  { title: "We conduct responsibly", body: "Billions of messages and real money flow through our products. We act like it." },
  { title: "We strive to be a force of change", body: "From Indore, for the world — proof that great products can come from anywhere." },
];

export const perks = [
  { title: "Own a product, not a ticket", body: "Small teams own real products used by thousands of businesses." },
  { title: "Ship from week one", body: "No year-long onboarding. You build, ship and learn in production." },
  { title: "Experiment freely", body: "Pitch an idea; if it holds up, we'll put resources behind it." },
  { title: "Learn across the stack", body: "Communication, accounting, automation, AI — rotate across very different problems." },
];

export type Opening = { role: string; team: "Engineering" | "AI" | "Growth" | "Internship"; location: string; type: string };

/** Snapshot from public listings — the live list lives on the careers page. */
export const openings: Opening[] = [
  { role: "Software Developer (Java)", team: "Engineering", location: "Indore", type: "Full-time" },
  { role: "Trainee Software Engineer", team: "Engineering", location: "Indore", type: "Full-time" },
  { role: "AI Video Script Writer", team: "AI", location: "Indore", type: "Full-time" },
  { role: "Sales & Partnerships", team: "Growth", location: "Indore / Remote", type: "Full-time" },
  { role: "Customer Support", team: "Growth", location: "Indore / Remote", type: "Full-time" },
  { role: "Walkover Avengers — Development Intern", team: "Internship", location: "Indore", type: "6 months" },
];

export type Insight = { title: string; excerpt: string; tag: string; href: string; tone: string };

export const insights: Insight[] = [
  {
    title: "Walkover — A Journey to Innovation",
    excerpt: "From a college social network to a family of products used by businesses everywhere.",
    tag: "Story",
    href: "https://blog.walkover.in/walkover-a-journey-to-innovation-aba695c1aefe",
    tone: "#3D7BFF",
  },
  {
    title: "Ready to invest in your idea. #YourIdea #OurResources",
    excerpt: "Got an idea worth building? Walkover brings the team, the infrastructure and the experience.",
    tag: "Announcement",
    href: "https://blog.walkover.in/walkover-ready-to-invest-in-your-idea-youridea-ourresources-db46e7b6a6f7",
    tone: "#9B7BFF",
  },
  {
    title: "How we're making Walkover a diverse and inclusive workplace",
    excerpt: "What we changed, what we learned, and what's still ahead for our team.",
    tag: "Culture",
    href: "https://blog.walkover.in/this-is-how-we-are-making-walkover-a-diverse-and-inclusive-workplace-63bfe8ef1f2",
    tone: "#22C59A",
  },
];

export const nav = [
  { label: "Home", href: "/" },
  { label: "Products", href: "/products" },
  { label: "About", href: "/about" },
  { label: "Culture", href: "/#culture" },
  { label: "Careers", href: "/careers" },
  { label: "Insights", href: "/#insights" },
  { label: "Contact", href: "/contact" },
];
