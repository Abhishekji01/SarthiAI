/**
 * Skill & interest taxonomy.
 *
 * Students and sources write the same skill many ways ("ML", "Machine
 * Learning", "machine-learning"; "JS", "JavaScript", "Node.js" ...). Exact
 * string comparison misses those, which made matches less accurate and
 * searches return fewer results than they should.
 *
 * Each concept has a canonical id, aliases (treated as the SAME skill) and
 * related concepts (partial credit, never counted as an exact match).
 * Everything here is deterministic and explainable; no model is involved.
 */

export const norm = (s) => String(s ?? '').toLowerCase().replace(/c\+\+/g, 'cpp').replace(/c#/g, 'csharp').replace(/\.net/g, 'dotnet').replace(/[^a-z0-9]+/g, '');

/** canonical id -> { label, aliases[], related: { id: weight 0..1 } } */
const CONCEPTS = {
  python: { label: 'Python', aliases: ['py', 'python3'], related: { programming: 0.5, datascience: 0.3, machinelearning: 0.3 } },
  java: { label: 'Java', aliases: ['corejava', 'javase'], related: { programming: 0.5, android: 0.4, springboot: 0.5 } },
  javascript: { label: 'JavaScript', aliases: ['js', 'ecmascript', 'es6'], related: { webdevelopment: 0.6, typescript: 0.7, react: 0.5, nodejs: 0.5, programming: 0.5 } },
  typescript: { label: 'TypeScript', aliases: ['ts'], related: { javascript: 0.8, webdevelopment: 0.5 } },
  cpp: { label: 'C++', aliases: ['cplusplus', 'cpp17'], related: { c: 0.6, programming: 0.5, competitiveprogramming: 0.4, dsa: 0.3 } },
  c: { label: 'C', aliases: ['clanguage', 'cprogramming'], related: { cpp: 0.6, embedded: 0.4, programming: 0.5 } },
  csharp: { label: 'C#', aliases: ['csharpdotnet'], related: { dotnet: 0.8, programming: 0.5, gamedevelopment: 0.3 } },
  dotnet: { label: '.NET', aliases: ['aspnet', 'dotnetcore'], related: { csharp: 0.8, webdevelopment: 0.4 } },
  go: { label: 'Go', aliases: ['golang'], related: { programming: 0.5, cloud: 0.3, backend: 0.4 } },
  rust: { label: 'Rust', aliases: ['rustlang'], related: { programming: 0.5, systems: 0.5 } },
  kotlin: { label: 'Kotlin', aliases: [], related: { android: 0.8, java: 0.5 } },
  swift: { label: 'Swift', aliases: ['swiftui'], related: { ios: 0.8 } },
  php: { label: 'PHP', aliases: ['laravel'], related: { webdevelopment: 0.6, backend: 0.4 } },
  r: { label: 'R', aliases: ['rlang', 'rprogramming'], related: { datascience: 0.6, statistics: 0.6 } },
  matlab: { label: 'MATLAB', aliases: ['simulink'], related: { signalprocessing: 0.4, mathematics: 0.3 } },
  sql: { label: 'SQL', aliases: ['mysql', 'postgresql', 'postgres', 'sqlite', 'plsql', 'oracledb'], related: { databases: 0.9, datascience: 0.3, backend: 0.3 } },
  databases: { label: 'Databases', aliases: ['dbms', 'database', 'mongodb', 'nosql'], related: { sql: 0.8, backend: 0.4 } },
  html: { label: 'HTML/CSS', aliases: ['html5', 'css', 'css3', 'htmlcss', 'tailwind', 'bootstrap'], related: { webdevelopment: 0.7, frontend: 0.7 } },
  react: { label: 'React', aliases: ['reactjs', 'reactnative', 'nextjs'], related: { javascript: 0.6, frontend: 0.8, webdevelopment: 0.6 } },
  angular: { label: 'Angular', aliases: ['angularjs'], related: { frontend: 0.8, typescript: 0.5, webdevelopment: 0.6 } },
  vue: { label: 'Vue', aliases: ['vuejs', 'nuxt'], related: { frontend: 0.8, javascript: 0.5 } },
  nodejs: { label: 'Node.js', aliases: ['node', 'expressjs', 'express', 'nestjs'], related: { javascript: 0.6, backend: 0.8, webdevelopment: 0.6 } },
  django: { label: 'Django', aliases: ['flask', 'fastapi'], related: { python: 0.6, backend: 0.8, webdevelopment: 0.6 } },
  springboot: { label: 'Spring Boot', aliases: ['spring'], related: { java: 0.7, backend: 0.8 } },
  frontend: { label: 'Frontend development', aliases: ['frontenddevelopment', 'frontenddev', 'ui development'], related: { webdevelopment: 0.8, react: 0.5, html: 0.6, uiux: 0.3 } },
  backend: { label: 'Backend development', aliases: ['backenddevelopment', 'serverside', 'restapi', 'api', 'apis'], related: { webdevelopment: 0.7, databases: 0.4 } },
  webdevelopment: { label: 'Web development', aliases: ['webdev', 'web', 'fullstack', 'fullstackdevelopment', 'mern', 'mean', 'webdesign'], related: { frontend: 0.7, backend: 0.7, javascript: 0.5, html: 0.5 } },
  android: { label: 'Android development', aliases: ['androiddevelopment', 'androidstudio', 'jetpackcompose'], related: { kotlin: 0.7, java: 0.4, mobiledevelopment: 0.9 } },
  ios: { label: 'iOS development', aliases: ['iosdevelopment', 'xcode'], related: { swift: 0.7, mobiledevelopment: 0.9 } },
  flutter: { label: 'Flutter', aliases: ['dart'], related: { mobiledevelopment: 0.9, android: 0.4, ios: 0.4 } },
  mobiledevelopment: { label: 'Mobile app development', aliases: ['appdevelopment', 'mobileapps', 'appdev', 'mobile'], related: { android: 0.7, ios: 0.7, flutter: 0.7 } },
  machinelearning: { label: 'Machine learning', aliases: ['ml', 'machinelearningml', 'scikitlearn', 'sklearn'], related: { ai: 0.8, deeplearning: 0.7, datascience: 0.7, python: 0.3, statistics: 0.3 } },
  deeplearning: { label: 'Deep learning', aliases: ['dl', 'neuralnetworks', 'pytorch', 'tensorflow', 'keras'], related: { machinelearning: 0.9, ai: 0.8, computervision: 0.5, nlp: 0.5 } },
  ai: { label: 'Artificial intelligence', aliases: ['artificialintelligence', 'aiml', 'genai', 'generativeai', 'llm', 'llms'], related: { machinelearning: 0.8, deeplearning: 0.6, nlp: 0.5, datascience: 0.4 } },
  nlp: { label: 'Natural language processing', aliases: ['naturallanguageprocessing', 'textmining'], related: { ai: 0.7, machinelearning: 0.6, deeplearning: 0.5 } },
  computervision: { label: 'Computer vision', aliases: ['cv', 'opencv', 'imageprocessing'], related: { deeplearning: 0.6, ai: 0.6, machinelearning: 0.5 } },
  datascience: { label: 'Data science', aliases: ['ds', 'dataanalytics', 'dataanalysis', 'analytics', 'pandas', 'numpy', 'bigdata', 'powerbi', 'tableau', 'excel'], related: { machinelearning: 0.6, statistics: 0.6, python: 0.3, sql: 0.3 } },
  statistics: { label: 'Statistics', aliases: ['stats', 'probability'], related: { datascience: 0.6, mathematics: 0.6 } },
  mathematics: { label: 'Mathematics', aliases: ['maths', 'math', 'linearalgebra', 'calculus'], related: { statistics: 0.5, research: 0.2 } },
  dsa: { label: 'Data structures & algorithms', aliases: ['datastructures', 'algorithms', 'datastructuresandalgorithms', 'problemsolving'], related: { competitiveprogramming: 0.8, programming: 0.5, cpp: 0.3 } },
  competitiveprogramming: { label: 'Competitive programming', aliases: ['cp', 'codeforces', 'leetcode', 'codechef'], related: { dsa: 0.9, programming: 0.5, competition: 0.4 } },
  programming: { label: 'Programming', aliases: ['coding', 'softwaredevelopment', 'softwareengineering', 'oop', 'oops'], related: { dsa: 0.4, computerscience: 0.6 } },
  computerscience: { label: 'Computer science', aliases: ['cs', 'cse', 'computerscienceengineering'], related: { programming: 0.6, dsa: 0.4 } },
  cybersecurity: { label: 'Cybersecurity', aliases: ['security', 'infosec', 'informationsecurity', 'cyber', 'cybersec', 'ethicalhacking', 'penetrationtesting', 'pentesting', 'websecurity', 'applicationsecurity', 'networksecurity', 'ctf'], related: { networking: 0.5, linux: 0.4, cryptography: 0.6, forensics: 0.5 } },
  cryptography: { label: 'Cryptography', aliases: ['crypto'], related: { cybersecurity: 0.6, mathematics: 0.4 } },
  forensics: { label: 'Digital forensics', aliases: ['digitalforensics', 'malwareanalysis', 'reverseengineering'], related: { cybersecurity: 0.7 } },
  networking: { label: 'Networking', aliases: ['computernetworks', 'networks', 'ccna', 'tcpip'], related: { cybersecurity: 0.4, linux: 0.3, cloud: 0.3 } },
  linux: { label: 'Linux', aliases: ['unix', 'bash', 'shell', 'shellscripting'], related: { devops: 0.5, cybersecurity: 0.3, systems: 0.4 } },
  systems: { label: 'Systems programming', aliases: ['operatingsystems', 'os', 'compilers'], related: { linux: 0.4, c: 0.4 } },
  cloud: { label: 'Cloud computing', aliases: ['cloudcomputing', 'aws', 'azure', 'gcp', 'googlecloud'], related: { devops: 0.7, backend: 0.3, networking: 0.3 } },
  devops: { label: 'DevOps', aliases: ['docker', 'kubernetes', 'k8s', 'cicd', 'jenkins', 'terraform', 'sre'], related: { cloud: 0.7, linux: 0.5 } },
  git: { label: 'Git', aliases: ['github', 'versioncontrol', 'gitlab'], related: { opensource: 0.5, programming: 0.2 } },
  opensource: { label: 'Open source', aliases: ['foss', 'opensourcecontribution', 'gsoc'], related: { git: 0.6, programming: 0.4 } },
  blockchain: { label: 'Blockchain', aliases: ['web3', 'solidity', 'ethereum', 'smartcontracts'], related: { cryptography: 0.4, backend: 0.2 } },
  iot: { label: 'Internet of Things', aliases: ['internetofthings', 'arduino', 'raspberrypi'], related: { embedded: 0.8, electronics: 0.5 } },
  embedded: { label: 'Embedded systems', aliases: ['embeddedsystems', 'microcontrollers', 'rtos', 'firmware'], related: { iot: 0.7, electronics: 0.6, c: 0.4, vlsi: 0.3 } },
  electronics: { label: 'Electronics', aliases: ['ece', 'electronicsandcommunication', 'circuits', 'circuitdesign', 'pcbdesign'], related: { embedded: 0.5, vlsi: 0.5, signalprocessing: 0.4 } },
  vlsi: { label: 'VLSI', aliases: ['verilog', 'vhdl', 'chipdesign', 'semiconductors', 'fpga'], related: { electronics: 0.7, embedded: 0.3 } },
  signalprocessing: { label: 'Signal processing', aliases: ['dsp', 'digitalsignalprocessing'], related: { electronics: 0.5, matlab: 0.4 } },
  robotics: { label: 'Robotics', aliases: ['ros', 'automation', 'drones'], related: { embedded: 0.5, ai: 0.3, mechanical: 0.4 } },
  mechanical: { label: 'Mechanical engineering', aliases: ['mech', 'cad', 'autocad', 'solidworks', 'ansys', 'catia', 'mechanicaldesign'], related: { robotics: 0.3, manufacturing: 0.6 } },
  manufacturing: { label: 'Manufacturing', aliases: ['production', 'industrialengineering'], related: { mechanical: 0.6 } },
  civil: { label: 'Civil engineering', aliases: ['structuralengineering', 'staadpro', 'construction'], related: {} },
  electrical: { label: 'Electrical engineering', aliases: ['ee', 'eee', 'powersystems', 'electricalengineering'], related: { electronics: 0.5 } },
  chemistry: { label: 'Chemistry', aliases: ['chemical', 'chemicalengineering'], related: { research: 0.2 } },
  physics: { label: 'Physics', aliases: ['appliedphysics'], related: { research: 0.2, mathematics: 0.3 } },
  biology: { label: 'Biology', aliases: ['biotechnology', 'biotech', 'lifesciences', 'bioinformatics', 'microbiology'], related: { research: 0.2 } },
  space: { label: 'Space science', aliases: ['spacescience', 'aerospace', 'astronomy', 'astrophysics', 'isro', 'satellite'], related: { physics: 0.5, research: 0.3 } },
  uiux: { label: 'UI/UX design', aliases: ['ux', 'ui', 'uidesign', 'uxdesign', 'figma', 'productdesign', 'design', 'graphicdesign'], related: { frontend: 0.4 } },
  gamedevelopment: { label: 'Game development', aliases: ['gamedev', 'unity', 'unrealengine', 'unreal'], related: { csharp: 0.4, cpp: 0.3 } },
  research: { label: 'Research', aliases: ['academicresearch', 'researchpaper', 'publications', 'science', 'academia'], related: { fellowship: 0.4 } },
  communication: { label: 'Communication', aliases: ['communicationskills', 'publicspeaking', 'writing', 'technicalwriting', 'english'], related: {} },
  leadership: { label: 'Leadership', aliases: ['teamwork', 'management', 'teammanagement'], related: { communication: 0.3 } },
  finance: { label: 'Finance', aliases: ['accounting', 'fintech', 'banking', 'economics'], related: { datascience: 0.2 } },
  marketing: { label: 'Marketing', aliases: ['digitalmarketing', 'seo', 'socialmedia', 'contentwriting'], related: { communication: 0.4 } },
  productmanagement: { label: 'Product management', aliases: ['pm', 'product'], related: { uiux: 0.3, leadership: 0.3 } },
  entrepreneurship: { label: 'Entrepreneurship', aliases: ['startup', 'startups', 'innovation'], related: { productmanagement: 0.3 } },
  socialimpact: { label: 'Social impact', aliases: ['ngo', 'volunteering', 'policy', 'publicpolicy', 'governance', 'sustainability', 'climate'], related: {} },
  // Opportunity-kind interests (students often list these as interests).
  scholarship: { label: 'Scholarships', aliases: ['scholarships', 'financialaid', 'funding', 'grant', 'grants'], related: { fellowship: 0.5 } },
  internship: { label: 'Internships', aliases: ['internships', 'industry', 'industryexperience', 'training'], related: { job: 0.4 } },
  fellowship: { label: 'Fellowships', aliases: ['fellowships'], related: { research: 0.5, scholarship: 0.4 } },
  competition: { label: 'Competitions', aliases: ['competitions', 'contest', 'contests', 'challenge', 'olympiad'], related: { hackathon: 0.8, competitiveprogramming: 0.4 } },
  hackathon: { label: 'Hackathons', aliases: ['hackathons', 'sih', 'smartindiahackathon'], related: { competition: 0.8 } },
  job: { label: 'Jobs', aliases: ['jobs', 'placement', 'placements', 'career', 'fulltime'], related: { internship: 0.4 } },
  program: { label: 'Programmes', aliases: ['programme', 'programmes', 'mentorship', 'bootcamp'], related: { opensource: 0.3 } },
  government: { label: 'Government', aliases: ['govt', 'publicsector', 'psu'], related: { scholarship: 0.2 } },
};

const ALIAS_TO_ID = new Map();
for (const [id, c] of Object.entries(CONCEPTS)) {
  ALIAS_TO_ID.set(id, id);
  ALIAS_TO_ID.set(norm(c.label), id);
  for (const a of c.aliases) ALIAS_TO_ID.set(norm(a), id);
}

/** Canonical concept id for a free-text skill/interest, or its normalized form. */
export function canonical(term) {
  const n = norm(term);
  return ALIAS_TO_ID.get(n) ?? n;
}

export function isKnownConcept(term) {
  return ALIAS_TO_ID.has(norm(term));
}

export function conceptLabel(id) {
  return CONCEPTS[id]?.label ?? id;
}

/** Related concept weight (0 when unrelated), symmetric max of both directions. */
export function relatedness(a, b) {
  const ca = canonical(a);
  const cb = canonical(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  return Math.max(CONCEPTS[ca]?.related?.[cb] ?? 0, CONCEPTS[cb]?.related?.[ca] ?? 0);
}

/** All alias spellings (normalized) for a term — used for query expansion. */
export function aliasesOf(term) {
  const id = canonical(term);
  const c = CONCEPTS[id];
  if (!c) return [norm(term)];
  return [...new Set([id, norm(c.label), ...c.aliases.map(norm)])];
}

/** Related concept ids with weight >= min. */
export function relatedOf(term, min = 0.6) {
  const id = canonical(term);
  const out = new Map();
  for (const [rid, w] of Object.entries(CONCEPTS[id]?.related ?? {})) if (w >= min) out.set(rid, w);
  for (const [oid, c] of Object.entries(CONCEPTS)) {
    const w = c.related?.[id];
    if (w >= min && !out.has(oid)) out.set(oid, w);
  }
  return out;
}

/**
 * Compares the student's skills with an opportunity's skills.
 * exact: same concept (alias-aware). related: best related concept >= 0.5.
 */
export function compareSkills(mySkills, oppSkills) {
  const mine = (mySkills ?? []).filter(Boolean);
  const myIds = new Map(mine.map((s) => [canonical(s), s]));
  const exact = [];
  const related = [];
  const missing = [];
  for (const s of oppSkills ?? []) {
    const id = canonical(s);
    if (myIds.has(id)) {
      exact.push({ skill: s, yours: myIds.get(id) });
      continue;
    }
    let best = null;
    for (const [mid, original] of myIds) {
      const w = relatedness(mid, id);
      if (w >= 0.5 && (!best || w > best.weight)) best = { skill: s, yours: original, weight: w };
    }
    if (best) related.push(best);
    else missing.push(s);
  }
  return { exact, related, missing };
}

/** Indian state names and common abbreviations. */
const STATE_ALIASES = {
  andhrapradesh: ['ap'], arunachalpradesh: ['ar'], assam: ['as'], bihar: ['br'], chhattisgarh: ['cg', 'chattisgarh'],
  goa: ['ga'], gujarat: ['gj'], haryana: ['hr'], himachalpradesh: ['hp'], jharkhand: ['jh'], karnataka: ['ka'],
  kerala: ['kl'], madhyapradesh: ['mp'], maharashtra: ['mh'], manipur: ['mn'], meghalaya: ['ml'], mizoram: ['mz'],
  nagaland: ['nl'], odisha: ['od', 'orissa'], punjab: ['pb'], rajasthan: ['rj'], sikkim: ['sk'], tamilnadu: ['tn'],
  telangana: ['ts', 'tg'], tripura: ['tr'], uttarpradesh: ['up'], uttarakhand: ['uk', 'uttaranchal'], westbengal: ['wb'],
  delhi: ['dl', 'newdelhi', 'nctofdelhi'], jammuandkashmir: ['jk', 'jammukashmir'], ladakh: ['la'], puducherry: ['py', 'pondicherry'],
  chandigarh: ['ch'], andamanandnicobarislands: ['an'], lakshadweep: ['ld'], dadraandnagarhavelianddamananddiu: ['dnhdd'],
};
const STATE_LOOKUP = new Map();
for (const [s, aliases] of Object.entries(STATE_ALIASES)) {
  STATE_LOOKUP.set(s, s);
  for (const a of aliases) STATE_LOOKUP.set(a, s);
}
export const canonicalState = (s) => STATE_LOOKUP.get(norm(s)) ?? norm(s);
export const ALL_INDIA = new Set(['allindia', 'india', 'allstates', 'anystate', 'nationwide', 'pan india', 'panindia'].map(norm));
