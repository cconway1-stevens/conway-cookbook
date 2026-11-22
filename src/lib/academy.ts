import { modules } from './coursework';
import { directions, ingredients, type Recipe } from './recipes';

export const lessons = [
  { id: 'scale', title: 'Scale a recipe by yield', match: /cups? (?:all-purpose )?flour/i,
    steps: ['Write down the original and desired yields in the same units. Divide desired yield by original yield.', 'Multiply each measured ingredient by that factor. Keep the original units or convert to a known weight before scaling.', 'Select pans that maintain a similar depth. Check doneness as you cook and adjust seasoning to taste.'] },
  { id: 'onion-strips', title: 'Slice an onion into fine strips', match: /(?:thinly sliced|sliced|julienned).*onion|onion[^.\n]*(?:thinly sliced|julienned)/i,
    steps: ['Halve the onion through the root and stem. Peel it and trim the ends. Rest one half cut-side down on a steady board.', 'Curl your fingertips inward and work from one side of the half to the other. Make closely spaced lengthwise cuts following the grain.', 'Separate the layers with your fingers. Aim for even widths so the strips soften together.'] },
  { id: 'dice', title: 'Dice vegetables evenly', match: /\bdic(?:e|ed|ing)\b/i,
    steps: ['Trim a flat side and rest it against the board. Cut the vegetable into slabs of equal thickness.', 'Stack just a few slabs and cut them into sticks the same width. Turn the sticks across the board and cut across them to make cubes.', 'Check a few pieces side by side. Similar size helps them finish cooking together.'] },
  { id: 'fold', title: 'Fold chocolate through dough', match: /fold.*(?:chocolate|shavings)|marble the chocolate/i,
    steps: ['Scatter the mix-ins over the dough in a wide bowl.', 'Slide a flexible spatula down the side and underneath. Lift the dough over the chocolate, then turn the bowl a quarter turn.', 'Repeat until the pieces are distributed. Leave a few streaks of shaved chocolate for a marbled cookie.'] },
  { id: 'simmer', title: 'Recognize a gentle simmer', match: /\bsimmer/i,
    steps: ['Watch the surface as the liquid heats. At a simmer, small bubbles break occasionally and the surface moves gently.', 'Lower the heat if large bubbles churn across the pan. Give a thick soup or sauce a stir along the bottom.', 'Use the recipe’s doneness cue as well as its timer. A reducing sauce thickens as water escapes.'] },
  { id: 'custard', title: 'Soak bread evenly for pudding', match: /soak the bread|bread cubes.*custard/i,
    steps: ['Cut the bread into similarly sized pieces. Whisk the custard until the whites and yolks are fully blended.', 'Pour the custard slowly over the whole dish. Use a spoon to press down the pieces that float up.', 'After the recipe’s soaking time, open a cube from the middle. The center should be moist before the dish goes into the oven.'] },
];
export function academyLinksFor(recipe: Recipe) {
  if (!recipe.data.academyLinks) return skillsFor(recipe);
  return [...new Set(recipe.data.academyLinks)].map(id => {
    const link = [...lessons, ...modules].find(item => item.id === id);
    if (!link) throw new Error(`Unknown Academy link in ${recipe.id}: ${id}`);
    return link;
  });
}
export function skillsFor(recipe: Recipe) {
  const text = [...ingredients(recipe).flatMap(g => g.items), ...directions(recipe).map(s => s.title + ' ' + s.text)].join('\n');
  return lessons.filter(lesson => lesson.match.test(text));
}
