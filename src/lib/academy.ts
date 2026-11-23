import { directions, ingredients, type Recipe } from './recipes';

export const chefStudioUrl = 'https://ovensource.com/chefstudio/courses/';

const guides = {
  'kitchen-fundamentals': { title: 'Kitchen Fundamentals', steps: 10, level: 'Beginner' },
  'knife-skills': { title: 'Knife Skills', steps: 10, level: 'Beginner' },
  'fresh-pasta-masterclass': { title: 'Fresh Pasta Masterclass', steps: 11, level: 'All levels' },
  'artisan-bread-making': { title: 'Artisan Bread Making', steps: 11, level: 'Beginner–Intermediate' },
  'stocks-mother-sauces': { title: 'Stocks & Mother Sauces', steps: 11, level: 'Intermediate' },
  'essential-cooking-methods': { title: 'Essential Cooking Methods', steps: 11, level: 'Beginner' },
  'italian-cooking-essentials': { title: 'Italian Cooking Essentials', steps: 10, level: 'All levels' },
  'meat-poultry': { title: 'Meat & Poultry', steps: 11, level: 'Intermediate' },
  'fish-seafood': { title: 'Fish & Seafood', steps: 10, level: 'Intermediate' },
  'pastry-desserts': { title: 'Pastry & Desserts', steps: 11, level: 'Intermediate' },
};

type GuideId = keyof typeof guides;

function guideFor(id: GuideId) {
  return { ...guides[id], href: `${chefStudioUrl}${id}/` };
}

export const fundamentals = guideFor('kitchen-fundamentals');
export const chefStudioGuides = (Object.keys(guides) as GuideId[]).map(guideFor);

const techniqueMatches = {
  'brown-butter': /brown (?:half the|the sauce) butter/i,
  'stove-heat': /brown (?:half the|the sauce) butter/i,
  scale: /cups? (?:all-purpose )?flour/i,
  'onion-strips': /(?:thinly sliced|sliced|julienned).*onion|onion[^.\n]*(?:thinly sliced|julienned)/i,
  dice: /\bdic(?:e|ed|ing)\b/i,
  fold: /fold.*(?:chocolate|shavings)|marble the chocolate/i,
  simmer: /\bsimmer/i,
  custard: /soak the bread|bread cubes.*custard/i,
};

const legacyLinks: Record<string, GuideId> = {
  'brown-butter': 'pastry-desserts',
  'stove-heat': 'kitchen-fundamentals',
  scale: 'kitchen-fundamentals',
  'onion-strips': 'knife-skills',
  dice: 'knife-skills',
  fold: 'pastry-desserts',
  simmer: 'essential-cooking-methods',
  custard: 'pastry-desserts',
  'prep-school': 'kitchen-fundamentals',
  stovetop: 'essential-cooking-methods',
  'baking-bench': 'pastry-desserts',
};

export function academyLinksFor(recipe: Recipe) {
  const text = [...ingredients(recipe).flatMap(group => group.items), ...directions(recipe).map(step => step.title + ' ' + step.text)].join('\n');
  const links = recipe.data.academyLinks ?? Object.entries(techniqueMatches)
    .filter(([, match]) => match.test(text))
    .map(([id]) => id);

  const guideIds = links.map(id => {
    if (Object.hasOwn(guides, id)) return id as GuideId;
    if (Object.hasOwn(legacyLinks, id)) return legacyLinks[id];
    throw new Error(`Unknown Academy link in ${recipe.id}: ${id}`);
  });
  return [...new Set(guideIds)].map(guideFor);
}
