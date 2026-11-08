import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { canonical, conceptsInText } from '../matching/taxonomy.js';
import { plainLine, plainText } from '../utils/sanitize.js';

/**
 * Resume → profile suggestions, without AI (a resume carries contact details,
 * so it never leaves the server). Text comes from PDF.js; skills are matched
 * against SarthiAI's skill list; projects and experience are read from their
 * sections. Nothing is saved: the student reviews and confirms each item.
 */
export const MAX_RESUME_BYTES = 2 * 1024 * 1024;
const MAX_PAGES = 5;

export async function pdfText(buf) {
  const task = getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    let out = '';
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let lastY = null;
      for (const item of content.items) {
        const y = item.transform?.[5];
        if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
        out += item.str;
        if (item.hasEOL) out += '\n';
        else if (item.str && !item.str.endsWith(' ')) out += ' ';
        lastY = y ?? lastY;
      }
      out += '\n';
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ');
  } finally {
    await task.destroy();
  }
}

const HEADINGS = {
  skills: /^(technical\s+|key\s+|core\s+)?skills(\s*(&|and)\s*\w+)?$|^technologies$|^tech stack$/i,
  projects: /^(academic\s+|personal\s+|key\s+)?projects?$/i,
  experience: /^(work\s+|professional\s+)?experience$|^internships?$|^employment$|^work history$/i,
  other: /^(education|achievements|awards|certifications?|publications|extra[- ]?curricular.*|activities|positions of responsibility|interests|hobbies|summary|objective|profile|contact|languages|references)$/i,
};
const BULLET = /^\s*([•●▪◦‣*\-–]|\d+[.)])\s+/;
const DATES = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*'?\d{2,4}\b|\b(19|20)\d{2}\b|\bpresent\b|\bcurrent\b|\bongoing\b|\d{1,2}\/\d{2,4}/gi;

function sections(text) {
  const out = { skills: [], projects: [], experience: [], other: [], top: [] };
  let current = 'top';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const head = line.replace(/[:|]+$/, '').trim();
    const hit = head.length <= 40 && Object.entries(HEADINGS).find(([, rx]) => rx.test(head));
    if (hit) { current = hit[0]; continue; }
    out[current].push(line);
  }
  return out;
}

/** Groups section lines into entries: a non-bullet line starts an entry; bullets describe it. */
function entries(lines) {
  const list = [];
  for (const line of lines) {
    if (BULLET.test(line) && list.length) list.at(-1).details.push(line.replace(BULLET, '').trim());
    else if (!BULLET.test(line)) list.push({ head: line, details: [] });
    else list.push({ head: line.replace(BULLET, '').trim(), details: [] });
  }
  return list.filter((e) => e.head.replace(DATES, '').trim().length >= 3);
}

const clean = (s) => plainLine(String(s).replace(DATES, ' ').replace(/[(){}[\]]/g, ' ').replace(/\s*[–—-]\s*$/, '')).replace(/^[,|–—-\s]+|[,|–—-\s]+$/g, '');

function project(e) {
  const [title, ...tech] = e.head.split(/\s*[|]\s*|\s+[–—-]\s+|:\s+/);
  const description = plainText(e.details.join(' ')).slice(0, 600);
  return {
    title: clean(title).slice(0, 120),
    description: description || undefined,
    skills: conceptsInText(`${tech.join(' ')} ${e.details.join(' ')}`, { loose: tech.length > 0 }).slice(0, 15),
  };
}

function experience(e) {
  const head = e.head.replace(DATES, ' ');
  let role;
  let organization;
  const at = head.split(/\s+(?:at|@)\s+/i);
  if (at.length >= 2) [role, organization] = at;
  else {
    const parts = head.split(/\s*[|,]\s*|\s+[–—-]\s+/).map((x) => x.trim()).filter(Boolean);
    [role, organization] = parts;
  }
  if (!role || !organization) return null;
  return { role: clean(role).slice(0, 120), organization: clean(organization).slice(0, 120), description: plainText(e.details.join(' ')).slice(0, 1000) || undefined };
}

export function suggestionsFromText(text, profile = {}) {
  const sec = sections(text);
  const have = new Set([...(profile.skills ?? [])].map((x) => canonical(x)));
  const skillPool = [...conceptsInText(sec.skills.join('\n'), { loose: true }), ...conceptsInText(text)];
  const skills = [...new Set(skillPool)].filter((l) => !have.has(canonical(l))).slice(0, 30);
  const haveProjects = new Set((profile.projects ?? []).map((p) => p.title.toLowerCase()));
  const projects = entries(sec.projects).map(project).filter((p) => p.title.length >= 3 && !haveProjects.has(p.title.toLowerCase())).slice(0, 6);
  const haveExp = new Set((profile.experience ?? []).map((x) => `${x.role}|${x.organization}`.toLowerCase()));
  const exp = entries(sec.experience).map(experience).filter(Boolean).filter((x) => !haveExp.has(`${x.role}|${x.organization}`.toLowerCase())).slice(0, 6);
  return { skills, projects, experience: exp };
}
