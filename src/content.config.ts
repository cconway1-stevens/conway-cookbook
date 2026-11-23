import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
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
    menuSection: list('menu section', book.menu.sections.map(({ id }) => id)).optional(),
    meal: z.array(list('meal', book.meals)).default([]),
    cuisine: z.array(z.string()).default([]),
    academyLinks: z.array(z.string()).optional(),
    // What nutrition is calculated from, when it isn't the ingredient line as written:
    // the cooked food ("roasted chicken thighs with skin"), the part that's eaten
    // ("1 teaspoon olive oil" of a tablespoon left in the pan), or "" to leave a line out.
    nutritionAs: z.record(z.string(), z.string()).optional(),
    // Why, in a sentence or two, shown with the nutrition estimate.
    nutritionNote: z.string().optional(),
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
    ingredients: z.array(z.union([z.string(), z.object({ group: z.string(), items: z.array(z.string()), aka: z.array(z.string()).optional() })])).min(1).optional(),
    shoppingMeasures: z.array(z.object({ line: z.string().min(1), ingredient: z.string().min(1), unit: z.string().min(1), quantity: z.number().positive() })).optional(),
    steps: z.array(z.union([z.string(), z.object({ title: z.string().optional(), text: z.string(), why: z.string().optional(), group: z.string().optional() })])).min(1).optional(),
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

const menus = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/menus' }),
  schema: z.object({
    title: z.string().min(1).max(60).refine((v) => v.trim().length > 0, 'should not be blank'),
    description: z.string().min(1).max(160).refine((v) => v.trim().length > 0, 'should not be blank'),
    note: z.string().max(120).default(''),
    paper: list('menu paper', book.menu.papers.map((p) => p.id)).default(book.menu.papers[0].id),
    blurbs: z.boolean().default(true),
    items: z.array(z.object({
      id: z.string().min(1),
      section: list('menu section', book.menu.sections.map((s) => s.id)).optional(),
    }).strict()).min(1).max(60),
  }).strict().superRefine(({ items }, ctx) => {
    const seen = new Set<string>();
    items.forEach(({ id }, index) => {
      if (seen.has(id)) ctx.addIssue({ code: 'custom', path: ['items', index, 'id'], message: `Recipe "${id}" appears more than once.` });
      seen.add(id);
    });
  }),
});

export const collections = { recipes, menus };
