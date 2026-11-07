import { Resource } from '../models/Resource.js';

/**
 * Sarthi's scope: opportunities, eligibility, applications, career planning and
 * learning paths. General assistant work (writing code, homework, essays,
 * trivia) is politely redirected, with pointers to verified learning resources.
 */

const CODE_TASK = /\b(write|give|show|generate|implement|create|make|solve|debug|fix|complete|explain)\b[^.?!\n]{0,60}\b(code|program|function|script|class|algorithm|linked ?list|binary tree|array|stack|queue|recursion|leetcode|sql query|regex|snippet|syntax error)\b/i;
const CODE_ASK = /\b(in|using) (python|java|c\+\+|c#|javascript|js|typescript|go|rust|kotlin)\b.*\b(program|code|function|implement)/i;
const HOMEWORK = /\b(solve|answer) (this|my|these) (question|problem|assignment|homework|equation)s?\b|\bwrite (an? )?(essay|poem|story)\b/i;
const IN_SCOPE = /\b(internship|scholarship|fellowship|hackathon|job|opportunit|apply|application|eligib|deadline|resume|cv|cover letter|interview|career|roadmap|plan|learn|course|resource|skill|prepare|preparation|college|stipend|placement)/i;

/** True for requests outside Sarthi's job, such as "write a linked list in C". */
export function isOffTopic(message) {
  const m = String(message ?? '');
  if (HOMEWORK.test(m)) return true;
  if (!(CODE_TASK.test(m) || CODE_ASK.test(m))) return false;
  // "Which internships use Python?" or "How should I learn DSA for placements?" stay in scope.
  return !IN_SCOPE.test(m) || /\b(write|implement|debug|fix|solve)\b.{0,30}\b(code|program|function|linked ?list|tree|leetcode)\b/i.test(m);
}

/** Verified catalogue resources for the skills a message mentions (up to 3). */
export async function resourcesFor(message, limit = 3) {
  const m = String(message).toLowerCase();
  const words = m.match(/[a-z][a-z+#.]*/g) ?? [];
  const phrases = ['machine learning', 'web development', 'data structures', 'computer science', 'open source', 'web security'].filter((p) => m.includes(p));
  const general = /linked ?list|tree|stack|queue|array|recursion|leetcode|algorithm|dsa|code|program/.test(m) ? ['programming', 'computer science'] : [];
  const keys = [...new Set([...phrases, ...words.filter((w) => w.length > 1 || w === 'c'), ...general])];
  if (!keys.length) return [];
  const found = await Resource.find({ skills: { $in: keys } }).lean();
  // Most specific first: more matching skills, then the language/topic itself over "programming".
  const score = (r) => r.skills.filter((s) => keys.includes(s)).length + (r.skills.some((s) => words.includes(s) || phrases.includes(s)) ? 2 : 0);
  return found.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export async function scopeReply(message) {
  const resources = await resourcesFor(message);
  const pointers = resources.length
    ? `\n\nIf you're learning this, these verified resources can help:\n${resources.map((r) => `• **${r.title}** — ${r.provider} (${r.cost})`).join('\n')}`
    : '';
  return {
    reply: `I'm Sarthi, your guide for opportunities, eligibility, applications and career planning, so I don't write code or solve assignments. I can help you find internships or hackathons that use this skill, or plan how to learn it.${pointers}`,
    resources,
  };
}

/** Replies must not contain code; if the model wrote some anyway, the reply is replaced. */
export const containsCode = (text) => /```|^\s{4,}\S.*[;{}]\s*$/m.test(String(text ?? ''));
