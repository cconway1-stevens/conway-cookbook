import { getCollection } from 'astro:content';

export const base = import.meta.env.BASE_URL.replace(/\/$/, '') + '/';
export const recipeUrl = (id: string) => base + 'recipes/' + id + '/';
export const categoryId = (name: string) => name.toLowerCase().trim()
  .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
export const categoryUrl = (name: string) => base + 'recipes/categories/' + encodeURIComponent(categoryId(name)) + '/';

export async function getRecipes() {
  return (await getCollection('recipes')).sort((a, b) =>
    b.data.date.valueOf() - a.data.date.valueOf() || a.data.title.localeCompare(b.data.title));
}

export type Recipe = Awaited<ReturnType<typeof getRecipes>>[number];
export const getCategories = (recipes: Recipe[]) =>
  [...new Set(recipes.map(({ data }) => data.category))].sort((a, b) => a.localeCompare(b));
