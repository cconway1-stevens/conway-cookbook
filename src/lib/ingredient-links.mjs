// Finds ingredient names in a recipe's steps and works out which line of the ingredient list
// each one means. "Cinnamon" can be in both the crumble and the filling, so every mention is
// matched to one part of the recipe, using what else the step names, what has been used
// already, and an optional "group" hint on the step.

const FRACTIONS = '½⅓⅔¼¾⅛⅜⅝⅞';
const UNIT = /^(?:cups?|tablespoons?|teaspoons?|tbsps?|tsps?|pounds?|lbs?|ounces?|oz|grams?|g|kg|ml|l|liters?|litres?|cans?|cloves?|sticks?|slices?|pinch(?:es)?|dash(?:es)?|sprigs?|bunch(?:es)?|heads?|packages?|jars?|bottles?|stalks?|pieces?)\b\.?\s*/i;
const ADJECTIVE = /^(?:small|medium|large|extra-large|big|firm|ripe|fresh|frozen|chilled|cold|soft|hot|warm|whole|thick|thin|heaping|level|scant|good|packed|lightly|boneless|skinless)\b\s*/i;
// One word that is not safe on its own: "spray" is also a verb, "juice" is a drink.
const NOT_ALONE = new Set(['juice', 'zest', 'extract', 'powder', 'spray', 'sauce', 'paste', 'baking']);
// "garlic cloves" and "cocoa powder" are also just "garlic" and "cocoa" in a step.
const TAIL = /^(?:juice|zest|extract|powder|cloves?|sprigs?|stalks?|leaves|leaf|slices?|wedges?)$/i;
// "For the pie" names a whole dish, so "pie" is never a name for that group of ingredients.
const NOT_A_GROUP = new Set(['pie', 'dish', 'recipe', 'cake', 'bread', 'serve']);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "10 tablespoons unsalted butter, chilled" -> ["unsalted butter"] */
export function namesOf(line) {
  const cut = String(line).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(/\s*,\s*/);
  const strip = (s) => {
    let t = s.replace(new RegExp(`^[\\d\\s./${FRACTIONS}–-]+`), '');
    for (let i = 0; i < 3; i++) t = t.replace(UNIT, '').replace(ADJECTIVE, '');
    return t.replace(/^of\s+/i, '').trim();
  };
  let name = strip(cut[0] ?? '');
  if (/^[\p{L}]+-[\p{L}]+$/u.test(name) && cut[1]) name = strip(cut[1]); // "4 bone-in, skin-on chicken thighs"
  return name.split(/\s+(?:or|and)\s+/i).map((n) => n.trim()).filter((n) => n.length > 1);
}

/** "light brown sugar" -> light brown sugar, brown sugar, sugar */
export function aliasesOf(name) {
  const words = name.split(/\s+/).filter(Boolean), out = new Set();
  const add = (list) => { for (let i = 0; i < list.length; i++) out.add(list.slice(i).join(' ')); };
  add(words);
  if (words.length >= 3) out.add(words.slice(0, 2).join(' ')); // "Granny Smith"
  if (words.length >= 2 && TAIL.test(words.at(-1))) add(words.slice(0, -1));
  return [...out].filter((a) => a.length > 2 && !(!a.includes(' ') && NOT_ALONE.has(a.toLowerCase())));
}

const stem = (w) => {
  if (/ies$/i.test(w) && w.length > 4) return escape(w.slice(0, -3)) + '(?:y|ies)';
  if (/oes$/i.test(w)) return escape(w.slice(0, -2)) + '(?:es)?';
  if (/[^s]s$/i.test(w)) return escape(w.slice(0, -1)) + '(?:s|es)?';
  if (/[^aeiou]y$/i.test(w)) return escape(w.slice(0, -1)) + '(?:y|ies)';
  return escape(w) + '(?:s|es)?';
};
const pattern = (alias) => { const w = alias.trim().split(/\s+/), last = w.pop(); return [...w.map(escape), stem(last)].join('\\s+'); };

export const labelOf = (header) => capital(String(header ?? '').replace(/^for\s+(?:the\s+)?/i, '').replace(/\s*\(.*\)\s*$/, '').trim());
function groupAliases(group) {
  if (Array.isArray(group.aka)) return group.aka;
  const m = /^for\s+(?:the\s+)?(.+?)\s*(?:\(.*\))?$/i.exec(group.name ?? '');
  const noun = m?.[1].trim();
  return !noun || NOT_A_GROUP.has(noun.toLowerCase()) || noun.split(/\s+/).length > 3 ? [] : [noun];
}

/**
 * groups: [{ name, items: [line], aka? }]   steps: [{ text, lines, why?, group? }]
 * Returns what to draw in each step, and what the page needs to answer a hover.
 */
export function linkRecipe(groups, steps) {
  const entries = [], info = [];
  groups.forEach((group, g) => {
    const ids = [];
    for (const line of group.items) { const id = `e${entries.length}`; entries.push({ id, g, line, names: namesOf(line), steps: new Set() }); ids.push(id); }
    info.push({ id: `g${g}`, header: group.name ?? '', label: labelOf(group.name), ids, steps: new Set(), aliases: groupAliases(group) });
  });
  const byId = new Map(entries.map((e) => [e.id, e]));

  const table = new Map();
  const slot = (alias) => { const key = alias.toLowerCase(); if (!table.has(key)) table.set(key, { alias, ents: new Set(), exact: new Set(), grps: new Set() }); return table.get(key); };
  for (const e of entries) for (const name of e.names) for (const alias of aliasesOf(name)) { const s = slot(alias); s.ents.add(e.id); if (alias.toLowerCase() === name.toLowerCase()) s.exact.add(e.id); }
  info.forEach((g, gi) => g.aliases.forEach((alias) => { const s = slot(alias); if (!s.ents.size) s.grps.add(gi); }));
  const rows = [...table.values()].map((s) => ({ ...s, src: pattern(s.alias) })).sort((a, b) => b.alias.length - a.alias.length);
  const scan = rows.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${rows.map((r) => r.src).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
  const exact = rows.map((row) => ({ row, re: new RegExp(`^(?:${row.src})$`, 'iu') }));
  const find = (text) => (scan ? [...text.matchAll(scan)].map((m) => {
    const row = exact.find((x) => x.re.test(m[0])).row;
    return { start: m.index, end: m.index + m[0].length, s: m[0], ents: [...(row.exact.size ? row.exact : row.ents)], grp: row.ents.size ? null : [...row.grps][0] };
  }) : []);

  const hintOf = (hint) => {
    const h = String(hint ?? '').toLowerCase().trim();
    if (!h) return null;
    const at = info.findIndex((g) => (g.label && (g.label.toLowerCase().includes(h) || h.includes(g.label.toLowerCase()))) || g.header.toLowerCase().includes(h));
    return at < 0 ? null : at;
  };
  const used = new Set(), last = new Map();
  const slice = (text, ms, from, to) => {
    const out = []; let at = from;
    for (const m of ms) {
      if (m.end <= from || m.start >= to) continue;
      if (m.start > at) out.push(text.slice(at, m.start));
      out.push({ s: m.s, ...m.res });
      at = m.end;
    }
    if (at < to) out.push(text.slice(at, to));
    return out.filter((p) => p !== '');
  };

  const linked = steps.map((step, si) => {
    const tm = find(step.text), wm = step.why ? find(step.why) : [], all = [...tm, ...wm];
    // Ingredients that belong to only one part vouch for that part ("flour" means the crumble).
    const evidence = new Map();
    for (const m of all) {
      const gs = new Set(m.ents.map((id) => byId.get(id).g));
      if (gs.size !== 1) continue;
      const g = [...gs][0];
      if (!evidence.has(g)) evidence.set(g, new Set());
      m.ents.forEach((id) => evidence.get(g).add(id));
    }
    const hint = hintOf(step.group);
    const decide = (m) => {
      const gs = [...new Set(m.ents.map((id) => byId.get(id).g))];
      if (gs.length === 1) return gs[0];
      if (hint !== null && gs.includes(hint)) return hint;
      const rank = gs.map((g) => [g, evidence.get(g)?.size ?? 0]).sort((a, b) => b[1] - a[1]);
      if (rank[0][1] > 0 && rank[0][1] > rank[1][1]) return rank[0][0];
      // Nothing in this step says. A part that has not been used yet comes before one that has.
      const fresh = gs.filter((g) => m.ents.some((id) => byId.get(id).g === g && !used.has(id)));
      if (fresh.length) return Math.min(...fresh);
      return gs.sort((a, b) => (last.get(b) ?? -1) - (last.get(a) ?? -1) || a - b)[0];
    };
    for (const m of all) {
      if (m.grp !== null) { m.res = { gm: info[m.grp].id }; continue; }
      const g = decide(m), o = m.ents.filter((id) => byId.get(id).g !== g);
      m.res = { e: m.ents.filter((id) => byId.get(id).g === g), g: info[g].id };
      if (o.length) m.res.o = o;
    }
    for (const m of tm) {
      if (m.res.gm) { info[m.grp].steps.add(si + 1); continue; }
      const g = byId.get(m.res.e[0]).g;
      m.res.e.forEach((id) => byId.get(id).steps.add(si + 1));
      info[g].steps.add(si + 1);
    }
    for (const m of tm) if (m.res.e) { m.res.e.forEach((id) => used.add(id)); last.set(byId.get(m.res.e[0]).g, si); }

    let cursor = 0;
    const lineParts = (step.lines ?? []).map((line) => {
      const from = step.text.indexOf(line, cursor);
      if (from < 0) return [line];
      cursor = from + line.length;
      return slice(step.text, tm, from, cursor);
    });
    return { parts: slice(step.text, tm, 0, step.text.length), whyParts: step.why ? slice(step.why, wm, 0, step.why.length) : undefined, lineParts };
  });

  const inOrder = (set) => [...set].sort((a, b) => a - b);
  const sameName = (a, b) => a.names.length && a.names.join('|').toLowerCase() === b.names.join('|').toLowerCase();
  return {
    steps: linked,
    ids: info.map((g) => g.ids),
    data: {
      groups: info.map((g) => ({ id: g.id, label: g.label, entries: g.ids, steps: inOrder(g.steps) })),
      entries: Object.fromEntries(entries.map((e) => [e.id, { g: info[e.g].id, name: e.names[0] ?? e.line, line: e.line, steps: inOrder(e.steps), same: entries.filter((o) => o.g !== e.g && sameName(e, o)).map((o) => o.id) }])),
      labelled: info.filter((g) => g.label).length > 1,
    },
  };
}
