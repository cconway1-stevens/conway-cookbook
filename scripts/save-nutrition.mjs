import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { nutritionInput } from '../src/lib/nutrition-input.mjs';

const folder = 'src/data/nutrition';
const names = ['Calories', 'Protein', 'Carbohydrates', 'Fat', 'Fiber', 'Sugar', 'Sodium'];
const { recipes } = JSON.parse(await readFile('dist/cookbook.json', 'utf8'));
await mkdir(folder, { recursive: true });
for (const recipe of recipes) {
  const path = `${folder}/${recipe.id}.json`;
  const input = nutritionInput(recipe.ingredients.flatMap(group => group.items), recipe.servings);
  let existing;
  try { existing = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing?.fingerprint === input.fingerprint) continue;
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
  const rows = names.map(name => data.nutrition?.nutrients?.find(n => n.name === name));
  const complete = data.extendedIngredients?.length === input.ingredients.length && data.extendedIngredients.every(i => i.id)
    && rows.every(n => n && Number.isFinite(n.amount) && n.amount >= 0 && n.unit);
  // Remember incomplete matches too, so unrelated edits cannot spend another point.
  const snapshot = { fingerprint: input.fingerprint, rows: complete ? rows.map(({ name, amount, unit }) => ({name, amount, unit})) : [] };
  await writeFile(path, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(recipe.id, complete ? 'saved' : 'needs ingredient review');
}
