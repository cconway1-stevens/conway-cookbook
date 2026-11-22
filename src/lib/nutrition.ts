import { ingredients, type Recipe } from './recipes';
import { nutritionInput } from './nutrition-input.mjs';

interface Snapshot { fingerprint: string; rows: { name: string; amount: number; unit: string }[] }
const snapshots = import.meta.glob<Snapshot>('../data/nutrition/*.json', { eager: true, import: 'default' });
export function nutritionFor(recipe: Recipe) {
  const input = nutritionInput(ingredients(recipe).flatMap(group => group.items), recipe.data.servings);
  const snapshot = snapshots[`../data/nutrition/${recipe.id}.json`];
  if (snapshot?.fingerprint !== input.fingerprint || !snapshot?.rows.length) return null;
  return { basis: input.servings === 1 ? 'Whole recipe' : `Per serving · ${input.servings} servings`, rows: snapshot.rows };
}
