// Turns a recipe file, JSON or Markdown, into lines to read, tick, and speak.
// Shared by the site and by scripts/narrate.mjs so recorded clips always match.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { voice, ...phrases } = JSON.parse(readFileSync('src/data/cookbook.json', 'utf8')).narration;
export const VOICE = voice;
export const PHRASES = phrases;
const plain = (text) => text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();

function section(body, name) {
  const lines = [];
  let inside = false;
  for (const line of body.split('\n')) {
    if (/^##\s/.test(line)) inside = new RegExp(`^##\\s+${name}`, 'i').test(line);
    else if (inside) lines.push(line);
  }
  return lines;
}

function bodyGroups(body = '') {
  const groups = [];
  for (const line of section(body, 'ingredients')) {
    if (/^###\s/.test(line)) groups.push({ name: plain(line.replace(/^###\s+/, '')), items: [] });
    else if (/^[-*]\s/.test(line)) {
      if (!groups.length) groups.push({ name: '', items: [] });
      groups.at(-1).items.push(plain(line.replace(/^[-*]\s+/, '')));
    }
  }
  return groups;
}

function bodySteps(body = '') {
  const raw = [];
  for (const line of section(body, 'directions')) {
    if (/^\d+[.)]\s/.test(line)) raw.push(line.replace(/^\d+[.)]\s+/, ''));
    else if (raw.length && line.trim() && !line.startsWith('#')) raw[raw.length - 1] += ' ' + line.trim();
  }
  return raw.map((text) => {
    const bold = text.match(/^\*\*(.+?)\*\*\s*/);
    const title = bold ? plain(bold[1]).replace(/[.:]$/, '') : '';
    const rest = plain(bold ? text.slice(bold[0].length) : text);
    return { title, text: rest, lines: sentences(rest) };
  });
}

const sentences = (text) => text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean);

// `data` is the recipe's fields. `body` is its Markdown, if it has any.
export function ingredientGroups(data, body) {
  if (!data?.ingredients) return bodyGroups(body);
  const groups = [];
  for (const item of data.ingredients) {
    if (typeof item === 'object') groups.push({ name: item.group, items: item.items.map((i) => i.trim()) });
    else {
      if (!groups.length || groups.at(-1).name) groups.push({ name: '', items: [] });
      groups.at(-1).items.push(item.trim());
    }
  }
  return groups;
}
export function steps(data, body) {
  if (!data?.steps) return bodySteps(body);
  return data.steps.map((step) => {
    const { title = '', text, why } = typeof step === 'string' ? { text: step } : step;
    return { title: title.replace(/[.:]$/, ''), text: text.trim(), lines: sentences(text.trim()), why: why?.trim() || undefined };
  });
}

const FRACTIONS = { '½': 'a half', '⅓': 'a third', '⅔': 'two thirds', '¼': 'a quarter', '¾': 'three quarters', '⅛': 'an eighth' };
export const spoken = (text) => text
  .replace(/(\d)\s*([½⅓⅔¼¾⅛])/g, (_, n, f) => `${n} and ${FRACTIONS[f]}`)
  .replace(/([½⅓⅔¼¾⅛])-inch/g, (_, f) => `${FRACTIONS[f].replace(/^an? /, '')} inch`)
  .replace(/[½⅓⅔¼¾⅛]/g, (f) => FRACTIONS[f])
  .replace(/(\d)\s*[–-]\s*(\d)/g, '$1 to $2')
  .replace(/°\s*F/g, ' degrees').replace(/°\s*C/g, ' degrees Celsius')
  .replace(/\((\d+) g\)/g, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim();

export const heading = (step, i) => `Step ${i + 1}. ${step.title ? step.title + '.' : ''}`.trim();
export const clipName = (text) => createHash('sha1').update(`${VOICE}|${spoken(text)}`).digest('hex').slice(0, 14) + '.mp3';

export const script = (data, body) => [
  ...ingredientGroups(data, body).flatMap((g) => g.items),
  ...steps(data, body).flatMap((step, i) => [heading(step, i), ...step.lines, ...(step.why ? [step.why] : [])]),
];
