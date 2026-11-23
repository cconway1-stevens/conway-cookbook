import { ingredients, type Recipe } from './recipes';
import { nutritionInput } from './nutrition-input.mjs';
import { labelNutrients } from './nutrition-label.mjs';
import { allergensIn, ingredientStatement } from './ingredient-weight';

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

export function nutritionFor(recipe: Recipe) {
  const yieldText = recipe.data.servings.trim();
  const lines = ingredients(recipe).flatMap(group => group.items);
  const input = nutritionInput(lines, yieldText);
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
    const value = amount === null ? '—' : name === 'Calories'
      ? String(amount < 5 ? Math.round(amount) : Math.round(amount / (amount <= 50 ? 5 : 10)) * (amount <= 50 ? 5 : 10))
      : amountText(amount, unit, name);
    return { name, value, indent, daily: daily && amount !== null && !wholeBatch ? `${Math.round(amount / daily * 100)}%` : '' };
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

  return {
    serving, rows, more, calorieSources, mismatch,
    caloricBreakdown: snapshot.caloricBreakdown,
    // Package-style lines, estimated from the recipe itself.
    statement: ingredientStatement(lines),
    allergens: allergensIn(lines),
    sources: snapshot.sources, assumptions: snapshot.assumptions,
  };
}
