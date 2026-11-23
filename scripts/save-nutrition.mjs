import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { nutritionInput } from '../src/lib/nutrition-input.mjs';
import { labelNutrients } from '../src/lib/nutrition-label.mjs';

const folder = 'src/data/nutrition';
// Version 2 adds every nutrient, the protein/fat/carb split, and each ingredient's calories.
// Older snapshots are fetched once more to pick those up.
const VERSION = 2;
const required = ['Calories', 'Protein', 'Carbohydrates', 'Fat', 'Fiber', 'Sugar', 'Sodium'];
const names = labelNutrients.map(({ name, source }) => source ?? name);
const { recipes } = JSON.parse(await readFile('dist/cookbook.json', 'utf8'));
await mkdir(folder, { recursive: true });
for (const recipe of recipes) {
  const path = `${folder}/${recipe.id}.json`;
  const input = nutritionInput(recipe.ingredients.flatMap(group => group.items), recipe.servings);
  let existing;
  try { existing = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing?.fingerprint === input.fingerprint && existing.version === VERSION) continue;
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) throw Error('Missing SPOONACULAR_API_KEY');
  await new Promise(resolve => setTimeout(resolve, 1100));
  const response = await fetch('https://api.spoonacular.com/recipes/analyze?includeNutrition=true', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ title: recipe.title, servings: input.servings, ingredients: input.ingredients }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error(`Stopped at ${recipe.id}: HTTP ${response.status}`);
  const data = await response.json();
  const rows = names.map(name => data.nutrition?.nutrients?.find(n => n.name === name))
    .filter(n => n && Number.isFinite(n.amount) && n.amount >= 0 && n.unit);
  const complete = data.extendedIngredients?.length === input.ingredients.length && data.extendedIngredients.every(i => i.id)
    && required.every(name => rows.some(n => n.name === name));
  const nutrient = ({ name, amount, unit }) => ({ name, amount, unit });
  const breakdown = data.nutrition?.caloricBreakdown;
  const extras = complete ? {
    more: (data.nutrition?.nutrients ?? []).filter(n => !names.includes(n.name) && Number.isFinite(n.amount) && n.unit).map(nutrient),
    ...(breakdown && { caloricBreakdown: { percentProtein: breakdown.percentProtein, percentFat: breakdown.percentFat, percentCarbs: breakdown.percentCarbs } }),
    ingredients: (data.nutrition?.ingredients ?? []).map(i => ({ name: i.name, calories: i.nutrients?.find(n => n.name === 'Calories')?.amount ?? 0 })),
  } : {};
  // Remember incomplete matches too, so unrelated edits cannot spend another point.
  // Notes written by hand (sources, assumptions) carry over.
  const kept = existing ? Object.fromEntries(['sources', 'assumptions'].filter(key => key in existing).map(key => [key, existing[key]])) : {};
  const snapshot = { fingerprint: input.fingerprint, version: VERSION, rows: complete ? rows.map(nutrient) : [], ...extras, ...kept };
  await writeFile(path, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(recipe.id, complete ? 'saved' : 'needs ingredient review');
}
