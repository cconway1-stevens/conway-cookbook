// Reads src/data/cookbook.json, checks it once, and stops the build with a plain
// message if something doesn't line up. Server only; browser code gets what it needs from the page.
import { existsSync } from 'node:fs';
import { z } from 'astro/zod';
import raw from '../data/cookbook.json';

const name = z.string().min(1);
const id = z.string().regex(/^[a-z0-9-]+$/, 'use lowercase letters, numbers, and dashes');
const schema = z.object({
  title: name, tagline: name, description: name, footer: name,
  cover: z.object({ small: z.string(), large: name, image: name, imageAlt: name }),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'should look like owner/name').optional(), branch: name.default('main'),
  meals: z.array(name).min(1),
  courses: z.array(z.object({ name, menu: id, art: id, meal: name.optional() })).min(1),
  courseForMeal: name,
  menu: z.object({ title: name, sections: z.array(z.object({ id, label: name })).min(1), papers: z.array(z.object({ id, label: name })).min(1) }),
  themes: z.array(z.object({ id, name, blurb: name, bar: name })).min(1),
  narration: z.object({ voice: name, gather: name, unchecked: name, timer: name, finished: name, sample: name }),
}).superRefine((book, ctx) => {
  const need = (ok: boolean, message: string) => { if (!ok) ctx.addIssue({ code: 'custom', message }); };
  for (const c of book.courses) {
    need(book.menu.sections.some((s) => s.id === c.menu), `Course "${c.name}" points to menu section "${c.menu}", which isn't in menu.sections.`);
    need(!c.meal || book.meals.includes(c.meal), `Course "${c.name}" points to meal "${c.meal}", which isn't in meals.`);
  }
  need(book.courses.some((c) => c.name === book.courseForMeal), `courseForMeal "${book.courseForMeal}" isn't in courses.`);
  for (const t of book.themes) need(existsSync(`src/themes/${t.id}.css`), `Theme "${t.id}" has no file at src/themes/${t.id}.css.`);
});

const result = schema.safeParse(raw);
if (!result.success) throw new Error(`src/data/cookbook.json\n${result.error.issues.map((i) => `  ${i.path.join('.')} ${i.message}`).join('\n')}`);
export const book = result.data;

export const courseNames = book.courses.map((c) => c.name);
export const courseOf = (category: string) => book.courses.find((c) => c.name === category)!;
export const slug = (text: string) => text.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

export const courseAliases = { appetizers: 'Sides & Starters', sides: 'Sides & Starters', breads: 'Sides & Starters' };
