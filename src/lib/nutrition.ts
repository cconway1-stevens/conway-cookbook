import { ingredients, type Recipe } from './recipes';
import { nutritionInput } from './nutrition-input.mjs';
import { labelNutrients } from './nutrition-label.mjs';
import { allergensIn, caloriesPerGram, estimateGrams, ingredientStatement } from './ingredient-weight';

interface Nutrient { name: string; amount: number; unit: string }
interface Snapshot {
  fingerprint: string;
  rows: Nutrient[];
  // Saved by scripts/save-nutrition.mjs from version 2 on.
  version?: number;
  more?: Nutrient[];
  caloricBreakdown?: { percentProtein: number; percentFat: number; percentCarbs: number };
  ingredients?: { name: string; calories: number }[];
  sources?: { name: string; url: string }[];
  assumptions?: string;
}
const snapshots = import.meta.glob<Snapshot>('../data/nutrition/*.json', { eager: true, import: 'default' });

const amountText = (amount: number, unit: string, name = '') =>
  amount > 0 && amount < .1 ? `<0.1 ${unit}`
    : `${amount.toLocaleString('en-US', { maximumFractionDigits: unit === 'mg' && name !== 'Iron' && amount >= 5 ? 0 : 1 })} ${unit}`;

// FDA rounding for the Nutrition Facts label, 21 CFR 101.9(c).
const near = (value: number, step: number) => Math.round(value / step) * step;
const trim = (value: number) => Number(value.toFixed(2)).toLocaleString('en-US');
export function labelValue(name: string, amount: number, unit: string) {
  if (name === 'Calories') return String(amount < 5 ? 0 : near(amount, amount <= 50 ? 5 : 10));
  if (/Fat$/.test(name)) return `${amount < .5 ? 0 : trim(near(amount, amount < 5 ? .5 : 1))} g`;
  if (name === 'Cholesterol') return amount < 2 ? '0 mg' : amount < 5 ? 'less than 5 mg' : `${near(amount, 5)} mg`;
  if (name === 'Sodium') return `${amount < 5 ? 0 : near(amount, amount <= 140 ? 5 : 10).toLocaleString('en-US')} mg`;
  if (unit === 'g') return amount < .5 ? '0 g' : amount < 1 ? 'less than 1 g' : `${Math.round(amount)} g`;
  // Vitamins and minerals, to the increments in FDA's labeling guidance.
  if (name === 'Vitamin D' || name === 'Iron') return `${trim(near(amount, .1))} ${unit}`;
  if (name === 'Calcium' || name === 'Potassium') return `${near(amount, 10).toLocaleString('en-US')} ${unit}`;
  return `${trim(amount)} ${unit}`;
}
// % Daily Value from the unrounded amount. Vitamins and minerals step by 2, 5, then 10 percent.
export function dailyValue(name: string, amount: number, daily: number) {
  const pct = amount / daily * 100;
  if (!['Vitamin D', 'Calcium', 'Iron', 'Potassium'].includes(name)) return `${Math.round(pct)}%`;
  return `${pct < 2 ? 0 : near(pct, pct <= 10 ? 2 : pct <= 50 ? 5 : 10)}%`;
}

export type Check = { name: string; status: 'pass' | 'flag' | 'skip'; detail: string };

export function nutritionFor(recipe: Recipe) {
  const yieldText = recipe.data.servings.trim();
  const lines = ingredients(recipe).flatMap(group => group.items);
  const input = nutritionInput(lines, yieldText, recipe.data.nutritionAs);
  const snapshot = snapshots[`../data/nutrition/${recipe.id}.json`];
  if (snapshot?.fingerprint !== input.fingerprint || !snapshot.rows.length) return null;

  // Any yield that isn't a bare number ("About 8", "4 to 6", "6–8", "About 36 cookies",
  // "48 servings (1 teaspoon each)") was calculated as one whole batch. Split it here,
  // using the larger number of a range, which is the smaller portion.
  const range = yieldText.match(/^(?:About\s+)?\d+\s*(?:[-–—]|to)\s*([1-9]\d*)\b/i);
  const count = yieldText.match(/^(?:About\s+)?([1-9]\d*)\b\s*(.*)$/i);
  const portionCount = input.servings > 1 ? input.servings : range ? Number(range[1]) : count ? Number(count[1]) : 1;
  const unit = count?.[2].match(/^([a-z]+?)s?\b/i)?.[1].toLowerCase();
  const piece = !range && unit && !['serving', 'portion', 'people', 'person'].includes(unit) ? unit : '';
  const each = yieldText.match(/\(([^)]*?)\s+each\)/i)?.[1];
  const wholeBatch = input.servings === 1 && portionCount === 1 && yieldText !== '1';
  const serving = wholeBatch ? 'Whole recipe'
    : range ? `1 of ${portionCount} portions (recipe serves ${yieldText.replace(/^About\s+/i, '')})`
    : piece ? `1 ${piece}`
    : each ? `${each} (1 of ${portionCount})`
    : portionCount === 1 ? '1 serving (entire recipe)' : `1 of ${portionCount} servings`;
  const scale = portionCount / input.servings;

  const rows = labelNutrients.map(({ name, source, unit, daily, indent }) => {
    const saved = snapshot.rows.find((item) => item.name === (source ?? name) || item.name === name);
    const savedUnit = saved?.unit.toLowerCase().replace(/[μµ]g/, 'mcg');
    const amount = saved && savedUnit === unit && Number.isFinite(saved.amount) && saved.amount >= 0 ? saved.amount / scale : null;
    const value = amount === null ? '—' : labelValue(name, amount, unit);
    return { name, value, indent, daily: daily && amount !== null && !wholeBatch ? dailyValue(name, amount, daily) : '' };
  });

  // Nutrients beyond the standard label, when the saved analysis has them.
  const onLabel = new Set(labelNutrients.flatMap(({ name, source }) => [name, source]));
  const more = (snapshot.more ?? [])
    .filter(({ name, amount }) => !onLabel.has(name) && Number.isFinite(amount) && amount > 0 && !/^(?:Calories|Net Carbohydrates|Alcohol %)$/.test(name))
    .map(({ name, amount, unit }) => ({ name, value: amountText(amount / scale, unit.replace(/[μµ]g/, 'mcg'), name) }));

  // Which ingredients bring the calories, biggest first, as a share of the recipe.
  const total = snapshot.ingredients?.reduce((sum, { calories }) => sum + (calories > 0 ? calories : 0), 0) ?? 0;
  // An ingredient used twice (cocoa in the cake and the frosting) is one row.
  const byName = new Map<string, number>();
  for (const { name, calories } of snapshot.ingredients ?? []) if (calories > 0) byName.set(name, (byName.get(name) ?? 0) + calories);
  const calorieSources = total > 0 ? [...byName].map(([name, calories]) => ({ name, calories }))
    .sort((a, b) => b.calories - a.calories)
    .map(({ name, calories }) => ({ name, share: Math.round(calories / total * 100), calories: Math.round(calories / scale) })) : [];

  // The label total should equal the ingredients added up. Say so plainly when it doesn't.
  const labelCalories = snapshot.rows.find(({ name }) => name === 'Calories')?.amount ?? 0;
  const mismatch = total > 0 && labelCalories > 0 && Math.abs(total - labelCalories) / labelCalories > .05
    ? `The ingredients below add up to about ${Math.round(total / scale)} calories per serving, not the ${Math.round(labelCalories / scale)} on the label. The label will be recalculated from the ingredients the next time nutrition is saved.`
    : '';

  // Three automatic checks, so a wrong match shows up without a lab.
  const grams = (n: string) => snapshot.rows.find((r) => r.name === n)?.amount ?? 0;
  const alcohol = snapshot.more?.find(({ name }) => name === 'Alcohol')?.amount ?? 0;
  const hasLiquor = lines.some((line) => /\b(?:rum|gin|vodka|bourbon|whiskey|tequila|liqueur|wine)\b/i.test(line));
  const atwater = grams('Protein') * 4 + grams('Carbohydrates') * 4 + grams('Fat') * 9 + alcohol * 7;
  const checks: Check[] = [];
  if (hasLiquor && !alcohol) checks.push({ name: 'Calories match protein, carbs, and fat', status: 'skip', detail: 'The saved analysis doesn’t list the alcohol yet, and alcohol carries calories of its own.' });
  else {
    // Within 15%, or within 10 calories a serving, since tiny servings round to nothing.
    const gap = Math.abs(atwater - labelCalories);
    const close = !labelCalories || gap / labelCalories <= .15 || gap / scale <= 10;
    checks.push({ name: 'Calories match protein, carbs, and fat', status: close ? 'pass' : 'flag',
      detail: `Protein and carbs at 4 calories a gram, fat at 9${alcohol ? ', alcohol at 7' : ''} come to ${Math.round(atwater / scale)} per serving; the label says ${Math.round(labelCalories / scale)}.` });
  }
  checks.push(total > 0
    ? { name: 'Label equals its ingredients', status: mismatch ? 'flag' : 'pass', detail: `The ingredients add up to ${Math.round(total / scale)} calories per serving.` }
    : { name: 'Label equals its ingredients', status: 'skip', detail: 'Needs the per-ingredient breakdown, saved on the next nutrition run.' });
  // Each matched ingredient against typical calories for its estimated weight.
  const parts = snapshot.ingredients ?? [];
  if (parts.length === input.ingredients.length) {
    const odd = parts.flatMap(({ calories }, i) => {
      const line = input.ingredients[i];
      const g = estimateGrams(line), per = caloriesPerGram(line);
      if (g === null || per === null || g < 10) return [];
      const expected = g * per, actual = calories * input.servings;
      const off = expected > 30 ? actual / expected : 1;
      return off < .5 || off > 2 ? [`${line}: ${Math.round(actual / portionCount)} calories per serving, where about ${Math.round(expected / portionCount)} is typical`] : [];
    });
    checks.push({ name: 'Each ingredient looks right for its amount', status: odd.length ? 'flag' : 'pass',
      detail: odd.length ? odd.join('; ') + '.' : `All ${parts.length} ingredients are within the typical range for their amount.` });
  } else checks.push({ name: 'Each ingredient looks right for its amount', status: 'skip', detail: 'Needs the per-ingredient breakdown, saved on the next nutrition run.' });

  return {
    serving, rows, more, calorieSources, mismatch, checks,
    caloricBreakdown: snapshot.caloricBreakdown,
    // Package-style lines, estimated from the recipe itself.
    statement: ingredientStatement(lines),
    allergens: allergensIn(lines),
    sources: snapshot.sources, assumptions: snapshot.assumptions,
    note: recipe.data.nutritionNote,
    // Lines counted differently from how the recipe lists them, for the explanation.
    counted: Object.entries(recipe.data.nutritionAs ?? {}).filter(([line]) => lines.includes(line)).map(([line, as]) => ({ line, as })),
  };
}
