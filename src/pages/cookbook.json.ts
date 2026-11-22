// The whole cookbook as one index, rebuilt on every deploy.
import type { APIRoute } from 'astro';
import { book } from '../lib/cookbook';
import { allRecipes, indexEntry } from '../lib/recipes';

export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ title: book.title, meals: book.meals, courses: book.courses.map((c) => c.name), recipes: (await allRecipes()).map(indexEntry) }, null, 1), { headers: { 'Content-Type': 'application/json' } });
