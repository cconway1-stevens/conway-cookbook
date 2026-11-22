import { getCollection, type CollectionEntry } from 'astro:content';
import { existsSync } from 'node:fs';
import { courseOf } from './cookbook';
import { linkRecipe } from './ingredient-links.mjs';
import { PHRASES, clipName, heading, ingredientGroups, spoken, steps } from './narration.mjs';

export type Recipe = CollectionEntry<'recipes'>;
export const base = import.meta.env.BASE_URL.replace(/\/$/, '') + '/';
export const recipeUrl = (id: string) => `${base}recipes/${id}/`;
export const isSample = (recipe: Recipe) => recipe.filePath?.includes('/samples/') ?? false;

// Family recipes first, then newest first.
export async function allRecipes() {
  return (await getCollection('recipes')).sort(
    (a, b) =>
      Number(isSample(a)) - Number(isSample(b)) ||
      b.data.date.valueOf() - a.data.date.valueOf() ||
      a.data.title.localeCompare(b.data.title),
  );
}

// "## Ingredients" as groups, for search and the shopping list.
export const ingredients = (recipe: Recipe): { name: string; items: string[] }[] => ingredientGroups(recipe.data, recipe.body);

export const directions = (recipe: Recipe): { title: string; text: string; lines: string[]; why?: string }[] => steps(recipe.data, recipe.body);

// Which ingredient line each ingredient word in the steps means. Only recipes with JSON ingredients.
const linked = new WeakMap<object, ReturnType<typeof linkRecipe> | null>();
export function linkOf(recipe: Recipe) {
  if (!recipe.data.ingredients) return null;
  if (!linked.has(recipe)) linked.set(recipe, linkRecipe(ingredients(recipe) as any, steps(recipe.data, recipe.body)));
  return linked.get(recipe)!;
}
const withParts = <T extends object>(line: T, parts?: unknown[]) => (parts?.some((p) => typeof p !== 'string') ? { ...line, parts } : line);

// Cook mode: every line with its recorded clip, when one has been made.
export const clip = (text: string) => {
  const file = clipName(text);
  return { text, say: spoken(text), audio: existsSync(`public/audio/${file}`) ? `${base}audio/${file}` : undefined };
};
export const cookData = (recipe: Recipe) => ({
  id: recipe.id,
  title: recipe.data.title,
  groups: ingredients(recipe).map((g) => ({ name: g.name, lines: g.items.map(clip) })),
  steps: steps(recipe.data, recipe.body).map((step: { title: string; lines: string[]; why?: string }, i: number) => {
    const link = linkOf(recipe)?.steps[i];
    return { title: step.title, heading: clip(heading(step, i)), lines: step.lines.map((l, n) => withParts(clip(l), link?.lineParts[n])), why: step.why ? withParts(clip(step.why), link?.whyParts) : undefined };
  }),
  phrases: Object.fromEntries(Object.entries(PHRASES).map(([key, text]) => [key, clip(text as string)])),
});

export const menuData = (recipe: Recipe) => ({
  id: recipe.id,
  title: recipe.data.title,
  description: recipe.data.description,
  url: recipeUrl(recipe.id),
  section: courseOf(recipe.data.category).menu,
  ingredients: ingredients(recipe),
});

export const indexEntry = (recipe: Recipe) => {
  const { date, ...data } = recipe.data;
  return { id: recipe.id, url: recipeUrl(recipe.id), sample: isSample(recipe), ...data, image: data.image && base + data.image, date: date.toISOString().slice(0, 10), ingredients: ingredients(recipe), steps: steps(recipe.data, recipe.body) };
};

export const searchText = (recipe: Recipe) => {
  const { title, description, category, meal, cuisine, tags, author } = recipe.data;
  return [title, description, category, ...meal, ...cuisine, ...tags, author, ...ingredients(recipe).flatMap((g) => g.items)]
    .filter(Boolean).join(' ').toLowerCase();
};

export const tally = (values: string[]) =>
  [...values.reduce((map, v) => map.set(v, (map.get(v) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => a[0].localeCompare(b[0]));

export const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
