// A grocery list for a menu: the same food from different recipes on one line, with the
// amounts added up when they can be (teaspoons with cups, ounces with pounds), the
// recipes that need it, and the store aisle it's in.
import { NUMBER, ingredientName, toNumber } from './ingredient-weight';

type Dimension = 'volume' | 'weight' | 'count';
interface Amount { dimension: Dimension; quantity: number; unit: string }

// Volumes in teaspoons, weights in grams. Anything else is counted by its own unit.
const VOLUME: [RegExp, number][] = [
  [/^(?:teaspoons?|tsp)\b/, 1], [/^(?:tablespoons?|tbsp)\b/, 3], [/^cups?\b/, 48],
  [/^(?:fluid ounces?|fl\.? ?oz)\b/, 6], [/^pints?\b/, 96], [/^quarts?\b/, 192],
];
const WEIGHT: [RegExp, number][] = [
  [/^(?:pounds?|lbs?)\b/, 453.6], [/^(?:ounces?|oz)\b/, 28.35], [/^(?:kilograms?|kg)\b/, 1000], [/^(?:grams?|g)\b/, 1],
];
const COUNT_UNITS = /^(cloves?|cans?|packages?|slices?|sprigs?|sticks?|heads?|bunch(?:es)?|loaf|loaves|pinch(?:es)?|dash(?:es)?|wedges?|wheels?|stalks?|leaves|leaf|jars?|bottles?)\b/;

// Words that describe a food without changing what you buy.
const DESCRIPTORS = /\b(?:fresh|freshly|chopped|finely|roughly|coarsely|minced|diced|sliced|thinly|grated|shredded|crumbled|torn|packed|softened|melted|cold|chilled|warm|large|medium|small|ripe|day-old|raw|dried|ground|extra-virgin|unsalted|salted|whole|granulated|kosher|fine|sea|pure|plain|lightly|halved|peeled|squeezed|room-temperature|low-sodium|unsweetened)\b/g;

const singular = (word: string) => word
  .replace(/ies$/, 'y').replace(/(tomato|potato)es$/, '$1').replace(/leaves$/, 'leaf')
  .replace(/(?<![su])s$/, '');

/** What you'd buy: "2 garlic cloves, minced" and "3 cloves garlic" are both "garlic". */
export function groceryKey(line: string) {
  let name = ingredientName(line).toLowerCase().replace(/[’']/g, "'");
  if (/\bgarlic\b/.test(name) && !/powder|salt/.test(name)) return 'garlic';
  name = name.replace(/^(?:cloves?|heads?)\s+/, '').replace(DESCRIPTORS, ' ').replace(/\s+/g, ' ').trim();
  if (!/\bor\b/.test(name)) name = name.split(' ').map((word, i, all) => i === all.length - 1 ? singular(word) : word).join(' ');
  if (name === 'vanilla') return 'vanilla extract';
  return name || ingredientName(line).toLowerCase();
}

/** The amount in a line, normalized so like amounts can be added. */
export function parseAmount(line: string): Amount | null {
  const lower = line.toLowerCase().replace(/^about\s+/, '');
  // "1 (28-ounce) can" or "3 packages (8 ounces each)": buy by weight.
  const inner = lower.match(new RegExp(String.raw`\((?:about\s+)?(${NUMBER})\s*-?\s*(pounds?|ounces?|oz|lbs?)(\s+each)?\)`));
  const lead = lower.match(new RegExp(String.raw`^(${NUMBER})(?:\s*(?:to|-|–)\s*(${NUMBER}))?\s*(.*)$`));
  if (inner && lead && !/^(?:pounds?|ounces?|lbs?|oz|cups?|tablespoons?|teaspoons?)\b/.test(lead[3])) {
    const per = toNumber(inner[1]) * (/^(?:pound|lb)/.test(inner[2]) ? 453.6 : 28.35);
    const count = /^\(/.test(lead[3]) || inner[3] ? toNumber(lead[2] ?? lead[1]) : 1;
    return { dimension: 'weight', quantity: per * count, unit: 'g' };
  }
  if (!lead) {
    if (/^(?:a\s+)?pinch\b|\bpinch of\b/.test(lower)) return { dimension: 'count', quantity: 1, unit: 'pinch' };
    if (/^(?:a\s+)?dash\b|\bdash of\b/.test(lower)) return { dimension: 'count', quantity: 1, unit: 'dash' };
    return null;
  }
  // A range means buy for the larger number.
  const quantity = toNumber(lead[2] ?? lead[1]);
  const rest = lead[3];
  for (const [pattern, size] of VOLUME) if (pattern.test(rest)) return { dimension: 'volume', quantity: quantity * size, unit: 'tsp' };
  for (const [pattern, size] of WEIGHT) if (pattern.test(rest)) return { dimension: 'weight', quantity: quantity * size, unit: 'g' };
  const unit = rest.match(COUNT_UNITS)?.[1];
  // A stick of butter is half a cup.
  if (unit && /^sticks?$/.test(unit) && /butter|margarine/.test(rest)) return { dimension: 'volume', quantity: quantity * 24, unit: 'tsp' };
  if (unit && /^(?:pinch|dash)/.test(unit)) return { dimension: 'count', quantity, unit: unit.replace(/es$/, '') };
  const counted = unit ? singular(unit).replace(/^loave$/, 'loaf') : /\bgarlic\b/.test(rest) && !/\bhead\b/.test(rest) ? 'clove' : '';
  return { dimension: 'count', quantity, unit: counted };
}

// Kitchen-friendly fractions: ¼, ⅓, ½, ⅔, ¾.
const GLYPHS: [number, string][] = [[0, ''], [.25, '¼'], [1 / 3, '⅓'], [.5, '½'], [2 / 3, '⅔'], [.75, '¾'], [1, '']];
function fraction(value: number) {
  const whole = Math.floor(value + 1e-9);
  const [part, glyph] = GLYPHS.reduce((best, cur) => Math.abs(value - whole - cur[0]) < Math.abs(value - whole - best[0]) ? cur : best);
  const total = whole + (part === 1 ? 1 : 0);
  return total === 0 && !glyph ? (value > 0 ? '¼' : '0') : `${total || ''}${glyph}`;
}
const plural = (unit: string, n: number) => !unit || n <= 1 ? unit : /(?:ch|sh)$/.test(unit) ? unit + 'es' : unit === 'leaf' ? 'leaves' : unit === 'loaf' ? 'loaves' : unit + 's';

/** "1¾ cups", "3 tablespoons", "1½ pounds", "4 cloves". */
export function formatAmount({ dimension, quantity, unit }: Amount) {
  if (dimension === 'volume') {
    const parts: string[] = [];
    let left = Math.round(quantity * 4) / 4;
    // Cups in quarters or thirds (whichever leaves less over), then tablespoons, then
    // teaspoons, so nothing is rounded away.
    if (left >= 12 - 1e-9) {
      const quarters = Math.floor(left / 12 + 1e-9) / 4, thirds = Math.floor(left / 16 + 1e-9) / 3;
      const cups = left - thirds * 48 < left - quarters * 48 - 1e-9 ? thirds : quarters;
      // Under half a cup, an inexact cup measure reads better as tablespoons ("6 tablespoons").
      if (left >= 24 || Math.abs(left - cups * 48) < 1e-9) { parts.push(`${fraction(cups)} ${cups > 1 ? 'cups' : 'cup'}`); left -= cups * 48; }
    }
    if (left >= 3 - 1e-9) { const tbsp = Math.floor(left / 3 + 1e-9); parts.push(`${tbsp} ${tbsp > 1 ? 'tablespoons' : 'tablespoon'}`); left -= tbsp * 3; }
    const tsp = Math.round(left * 4) / 4;
    if (tsp > 0 || !parts.length) parts.push(`${fraction(tsp)} ${tsp > 1 ? 'teaspoons' : 'teaspoon'}`);
    return parts.join(' + ');
  }
  if (dimension === 'weight') {
    if (quantity >= 453.6) { const lb = Math.round(quantity / 453.6 * 4) / 4; return `${fraction(lb)} ${lb > 1 ? 'pounds' : 'pound'}`; }
    const oz = Math.round(quantity / 28.35 * 2) / 2; return `${fraction(oz)} ${oz > 1 ? 'ounces' : 'ounce'}`;
  }
  const n = Math.round(quantity * 4) / 4;
  return `${fraction(n)}${unit ? ' ' + plural(unit, n) : ''}`;
}

// Store aisles, in the order you'd walk them. First match wins.
const AISLES: [string, RegExp][] = [
  ['Spices & seasonings', /\b(?:black|white|cayenne|red) pepper(?! flakes? of)\b(?!.*\bbell\b)|peppercorn|\bsalt and\b/],
  ['Canned & jarred', /\b(?:broth|stock|crushed tomato|tomato paste|canned|coconut milk|cream of coconut|evaporated milk|condensed milk)\b/],
  ['Produce', /\b(?:garlic|onion|shallot|potato|tomato|pepper(?!corn)|long hot|chile|lime|lemon|orange|apple|pear|banana|pineapple|avocado|cucumber|lettuce|celery|carrot|green bean|herb|basil|parsley|cilantro|thyme|rosemary|oregano leaves|mint|ginger root|cranberr|berr|scallion)\b/],
  ['Meat & seafood', /\b(?:chicken|beef|pork|sausage|turkey|bacon|ham|shrimp|salmon|fish|lamb)\b/],
  ['Dairy & eggs', /\b(?:milk|buttermilk|cream|butter|cheese|cheddar|parmesan|parmigiano|mozzarella|feta|cotija|yogurt|egg|half-and-half|sour cream|margarine)\b/],
  ['Bakery & bread', /\b(?:bread|loaf|baguette|tortilla|bun|roll)\b/],
  ['Frozen', /\b(?:frozen|pie dough|ice cream)\b/],
  ['Canned & jarred', /\b(?:can|canned|crushed tomato|tomato paste|bean|olives|kalamata|pie filling|coconut milk|cream of coconut|evaporated|condensed|preserves)\b/],
  ['Baking', /\b(?:flour|sugar|baking|cocoa|chocolate|vanilla|cornstarch|cornmeal|bisquick|graham|marshmallow|oats|yeast|corn syrup)\b/],
  ['Spices & seasonings', /\b(?:salt|pepper|cinnamon|nutmeg|cumin|paprika|oregano|bay leaf|chili powder|spice|seasoning)\b/],
  ['Oil, vinegar & condiments', /\b(?:oil|vinegar|mayonnaise|mustard|ketchup|syrup|honey|sauce|cooking spray)\b/],
  ['Pasta, rice & cereal', /\b(?:spaghetti|pasta|noodle|rice|cereal|krispies)\b/],
  ['Nuts & dried fruit', /\b(?:walnuts?|pecans?|almonds?|peanuts?|cashews?|raisins?)\b/],
  ['Drinks & bar', /\b(?:rum|gin|vodka|bourbon|whiskey|tequila|wine|liqueur|beer|juice|sparkling|soda|water|ice)\b/],
];
// The order you'd walk the store. Some aisles have two rules above, for precedence.
export const AISLE_ORDER = ['Produce', 'Meat & seafood', 'Dairy & eggs', 'Bakery & bread', 'Baking', 'Spices & seasonings',
  'Oil, vinegar & condiments', 'Canned & jarred', 'Pasta, rice & cereal', 'Nuts & dried fruit', 'Frozen', 'Drinks & bar', 'Other'];
// Judge by the food's name first, and only then by the whole line.
export const aisleOf = (key: string, line = '') =>
  (AISLES.find(([, pattern]) => pattern.test(key)) ?? AISLES.find(([, pattern]) => pattern.test(line.toLowerCase())))?.[0] ?? 'Other';

export interface GroceryItem {
  key: string; name: string; aisle: string;
  // Each kind of amount added up separately: "2 cups + 3 cloves" when they can't be combined.
  amounts: Amount[];
  // A line with no amount ("Ice", "Salt and pepper") still says who needs it.
  uses: { recipe: string; amounts: Amount[]; lines: string[] }[];
}

/** Combine the ingredient lines of several recipes into one list, grouped by aisle. */
export function groceryList(recipes: { title: string; lines: string[] }[]) {
  const items = new Map<string, GroceryItem>();
  for (const { title, lines } of recipes) for (const line of lines) {
    const key = groceryKey(line);
    const amount = parseAmount(line);
    const item = items.get(key) ?? { key, name: key, aisle: aisleOf(key, line), amounts: [], uses: [] };
    if (amount && amount.dimension === 'weight' && /^(?:butter|margarine)$/.test(key)) { amount.dimension = 'volume'; amount.quantity /= 4.73; amount.unit = 'tsp'; }
    if (amount) {
      const same = item.amounts.find((a) => a.dimension === amount.dimension && a.unit === amount.unit);
      if (same) same.quantity += amount.quantity; else item.amounts.push({ ...amount });
    }
    const use = item.uses.find((u) => u.recipe === title);
    if (use) { use.lines.push(line); if (amount) use.amounts.push(amount); }
    else item.uses.push({ recipe: title, amounts: amount ? [amount] : [], lines: [line] });
    items.set(key, item);
  }
  const sorted = [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
  return AISLE_ORDER.map((aisle) => ({ aisle, items: sorted.filter((item) => item.aisle === aisle) })).filter(({ items }) => items.length);
}

export const totalText = (item: GroceryItem) => item.amounts.map(formatAmount).join(' + ');
/** One recipe's share, with its like amounts added up: "1 teaspoon" or "2 cloves". */
export function useText(amounts: Amount[]) {
  const merged: Amount[] = [];
  for (const a of amounts) { const same = merged.find((m) => m.dimension === a.dimension && m.unit === a.unit); if (same) same.quantity += a.quantity; else merged.push({ ...a }); }
  return merged.map(formatAmount).join(' + ');
}
