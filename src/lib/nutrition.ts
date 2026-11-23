import { ingredients, type Recipe } from './recipes';
import { nutritionInput } from './nutrition-input.mjs';
import { labelNutrients } from './nutrition-label.mjs';

interface Snapshot {
  fingerprint: string;
  rows: { name: string; amount: number; unit: string }[];
  sources?: { name: string; url: string }[];
  assumptions?: string;
}
const snapshots = import.meta.glob<Snapshot>('../data/nutrition/*.json', { eager: true, import: 'default' });

export function nutritionFor(recipe: Recipe) {
  const yieldText = recipe.data.servings.trim();
  const input = nutritionInput(ingredients(recipe).flatMap(group => group.items), yieldText);
  const snapshot = snapshots[`../data/nutrition/${recipe.id}.json`];
  if (snapshot?.fingerprint !== input.fingerprint || !snapshot.rows.length) return null;

  // These current ranges and count-based yields were originally calculated as whole batches.
  const range = yieldText.match(/^\d+\s*[-–—]\s*([1-9]\d*)$/);
  const cookies = yieldText.match(/^About ([1-9]\d*) cookies$/i);
  const portionCount = range ? Number(range[1]) : cookies ? Number(cookies[1]) : input.servings;
  const wholeBatch = input.servings === 1 && portionCount === 1 && yieldText !== '1';
  const serving = wholeBatch ? 'Whole recipe' : range ? `1 of ${portionCount} portions (recipe serves ${yieldText})` :
    cookies ? '1 cookie' : portionCount === 1 ? '1 serving (entire recipe)' : `1 of ${portionCount} servings`;
  const scale = portionCount / input.servings;
  const rows = labelNutrients.map(({ name, source, unit, daily, indent }) => {
    const saved = snapshot.rows.find((item) => item.name === (source ?? name) || item.name === name);
    const savedUnit = saved?.unit.toLowerCase().replace(/[μµ]g/, 'mcg');
    const amount = saved && savedUnit === unit && Number.isFinite(saved.amount) && saved.amount >= 0 ? saved.amount / scale : null;
    const value = amount === null ? '—' : name === 'Calories'
      ? String(amount < 5 ? Math.round(amount) : Math.round(amount / (amount <= 50 ? 5 : 10)) * (amount <= 50 ? 5 : 10))
      : amount > 0 && amount < .1 ? `<0.1 ${unit}` : `${amount.toLocaleString('en-US', { maximumFractionDigits: unit === 'mg' && name !== 'Iron' ? 0 : 1 })} ${unit}`;
    return { name, value, indent, daily: daily && amount !== null && !wholeBatch ? `${Math.round(amount / daily * 100)}%` : '' };
  });
  return { serving, rows, sources: snapshot.sources, assumptions: snapshot.assumptions };
}
