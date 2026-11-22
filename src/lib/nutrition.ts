import { ingredients, type Recipe } from './recipes';

interface Nutrient { name: string; amount: number; unit: string }
const nutrients = ['Calories', 'Protein', 'Carbohydrates', 'Fat', 'Fiber', 'Sugar', 'Sodium'];
export async function nutritionFor(recipe: Recipe) {
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) return null;
  const lines = ingredients(recipe).flatMap(group => group.items);
  const yieldText = recipe.data.servings.trim();
  const servings = /^\d+$/.test(yieldText) ? Number(yieldText) : 1;
  try {
    const response = await fetch('https://api.spoonacular.com/recipes/analyze?includeNutrition=true', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ title: recipe.data.title, servings, ingredients: lines }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const data = await response.json();
    if (data.extendedIngredients?.length !== lines.length || data.extendedIngredients.some((i: {id?: number}) => !i.id)) throw Error('Incomplete ingredient match');
    const values: Nutrient[] = data.nutrition?.nutrients ?? [];
    const rows = nutrients.map(name => values.find(n => n.name === name));
    if (!rows.every((n): n is Nutrient => !!n && Number.isFinite(n.amount) && n.amount >= 0 && !!n.unit)) throw Error('Incomplete nutrient analysis');
    return { basis: servings === 1 ? 'Whole recipe' : 'Per serving · ' + servings + ' servings', rows };
  } catch (error) {
    console.warn('Nutrition unavailable for', recipe.id, error instanceof Error ? error.message : 'provider error');
    return null;
  }
}
