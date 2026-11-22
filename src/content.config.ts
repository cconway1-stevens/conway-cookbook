import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { existsSync } from 'node:fs';
import { book, courseNames } from './lib/cookbook';

const list = (what: string, options: string[]) =>
  z.string().refine((v) => options.includes(v), { message: `isn't a ${what} in src/data/cookbook.json. Use one of: ${options.join(', ')}` });

const recipes = defineCollection({
  loader: glob({
    // One file per recipe: .json, or .md with the ingredients and directions as Markdown.
    pattern: '**/*.{json,md}',
    base: './src/content/recipes',
    // Folders never show up in the URL, so moving a recipe out of samples/ keeps its link.
    generateId: ({ entry }) => entry.replace(/^.*\//, '').replace(/\.(json|md)$/, ''),
  }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: list('course', [...courseNames, ...book.meals]),
    meal: z.array(list('meal', book.meals)).default([]),
    cuisine: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    date: z.coerce.date().default(new Date(0)),
    author: z.string().optional(),
    time: z.string(),
    minutes: z.number().int().positive().optional(),
    servings: z.string(),
    difficulty: z.string().optional(),
    image: z.string().refine((v) => existsSync(`public/${v.split('?')[0]}`), { message: 'there is no such file in public/' }).optional(),
    imageAlt: z.string().optional(),
    source: z.object({ name: z.string(), url: z.url() }).optional(),
    // JSON recipes carry these. Markdown recipes have them in the text.
    story: z.string().optional(),
    ingredients: z.array(z.union([z.string(), z.object({ group: z.string(), items: z.array(z.string()) })])).min(1).optional(),
    steps: z.array(z.union([z.string(), z.object({ title: z.string().optional(), text: z.string(), why: z.string().optional() })])).min(1).optional(),
    notes: z.record(z.string(), z.string()).optional(),
    // What people have added. See README.
    familyNotes: z.array(z.union([z.string().transform((text) => ({ text })), z.object({ text: z.string(), by: z.string().optional(), date: z.coerce.date().optional() })])).optional(),
    media: z.array(z.union([
      z.object({ file: z.string(), caption: z.string().optional(), by: z.string().optional() }).strict(),
      z.object({ url: z.url().refine((u) => /^https?:/.test(u), { message: 'should start with https://' }), caption: z.string().optional(), by: z.string().optional() }).strict(),
    ])).optional(),
  }).refine((r) => !r.ingredients === !r.steps, { message: 'A JSON recipe needs both ingredients and steps.' }).transform(({ category, meal, ...rest }) => {
    // "category: Dinner" works too. It files under courseForMeal, for that meal.
    const course = book.courses.find((c) => c.name === category);
    const implied = course ? course.meal : category;
    return {
      ...rest,
      category: course?.name ?? book.courses.find((c) => c.meal === category)?.name ?? book.courseForMeal,
      meal: implied && !meal.includes(implied) ? [...meal, implied] : meal,
    };
  }),
});

export const collections = { recipes };
