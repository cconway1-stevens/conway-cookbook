import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const recipes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/recipes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    date: z.coerce.date(),
    author: z.string().optional(),
    time: z.string(),
    servings: z.string(),
    difficulty: z.string().optional(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    source: z.object({ name: z.string(), url: z.url() }).optional(),
  }),
});

export const collections = { recipes };
