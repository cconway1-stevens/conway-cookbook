import { getCollection } from 'astro:content';
import { book, courseOf } from './cookbook';
import { base, type Recipe } from './recipes';

export const menuUrl = (id: string) => `${base}menus/${id}/`;

export async function allMenus() {
  const [menus, recipes] = await Promise.all([getCollection('menus'), getCollection('recipes')]);
  const byId = new Map<string, Recipe>();
  for (const recipe of recipes) byId.set(recipe.id, recipe);

  return menus.sort((a, b) => a.data.title.localeCompare(b.data.title)).map((menu) => {
    const bySection = new Map<string, Recipe[]>();
    for (const { id, section } of menu.data.items) {
      const recipe = byId.get(id);
      if (!recipe) throw new Error(`${menu.filePath ?? menu.id}: Unknown recipe ID "${id}".`);
      const key = section ?? courseOf(recipe.data.category).menu;
      let dishes = bySection.get(key);
      if (!dishes) bySection.set(key, dishes = []);
      dishes.push(recipe);
    }
    const courses = book.menu.sections.flatMap(({ id, label }) => {
      const dishes = bySection.get(id);
      return dishes ? [{ id, label, dishes }] : [];
    });
    return { id: menu.id, data: menu.data, courses };
  });
}
