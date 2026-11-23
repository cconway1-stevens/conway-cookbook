// Rough gram weights for recipe lines, so a label can list ingredients by weight
// (most first, as on a package) and say which major allergens they contain.
// These are kitchen estimates, not lab values.

const FRACTIONS: Record<string, number> = { '¼': .25, '½': .5, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
const NUMBER = String.raw`\d+(?:\.\d+)?(?:\s*\d+\/\d+)?[¼½¾⅓⅔⅛⅜⅝⅞]?|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]`;

const toNumber = (text: string) => {
  let total = 0;
  for (const part of text.trim().match(/\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]/g) ?? []) {
    total += part.includes('/') ? Number(part.split('/')[0]) / Number(part.split('/')[1]) : FRACTIONS[part] ?? Number(part);
  }
  return total;
};

// Grams in one cup, by what the ingredient is. First match wins, so specific names come first.
const PER_CUP: [RegExp, number][] = [
  [/powdered sugar|confectioners/, 120], [/brown sugar/, 213], [/sugar/, 200],
  [/cocoa/, 85], [/flour|baking mix|bisquick/, 125], [/cornmeal/, 140], [/graham cracker crumbs|crumbs/, 100],
  [/oats/, 90], [/rice krispies|cereal/, 28], [/marshmallow/, 50], [/chocolate chips|chocolate/, 170],
  [/walnut|pecan|almond|nut/, 115], [/coconut/, 85],
  [/buttermilk/, 245], [/butter|margarine/, 227], [/olive oil/, 216], [/oil|shortening/, 218],
  [/mayonnaise/, 220], [/sour cream|yogurt/, 230], [/cream cheese/, 232], [/grated (?:parmesan|parmigiano)|parmigiano|parmesan/, 90], [/cheddar|mozzarella|cheese/, 113],
  [/maple syrup|syrup/, 315], [/honey|molasses/, 340],
  [/cream|half-and-half/, 238], [/milk|buttermilk/, 245],
  [/onion|celery|carrot|pepper|tomato/, 150], [/beans|rice/, 180], [/basil|parsley|cilantro|herb/, 25],
  [/rum|gin|vodka|whiskey|bourbon|tequila|wine|liqueur/, 225],
];
const perCup = (name: string) => PER_CUP.find(([pattern]) => pattern.test(name))?.[1] ?? 240;

// What one whole item weighs, for lines like "2 large eggs" or "3 red bell peppers".
const EACH: [RegExp, number][] = [
  [/wedge|wheel/, 8], [/egg yolk/, 17], [/egg white/, 33], [/egg/, 50], [/garlic clove|clove/, 5], [/bell pepper/, 150],
  [/chile|chili|long hot/, 6], [/lime/, 67], [/lemon/, 85], [/orange/, 130], [/banana/, 118],
  [/onion/, 150], [/tomato/, 120], [/potato/, 170], [/tortilla/, 30], [/chicken thigh/, 140], [/chicken breast/, 200],
  [/pie dough|pie crust/, 240], [/loaf/, 450], [/slice/, 30], [/can/, 400], [/package/, 225],
];

const UNITS: [RegExp, (name: string) => number][] = [
  [/^(?:fluid ounces?|fl\.? ?oz)\b/, () => 29.6],
  [/^(?:pounds?|lbs?)\b/, () => 453.6], [/^(?:ounces?|oz)\b/, () => 28.35], [/^(?:kilograms?|kg)\b/, () => 1000], [/^(?:grams?|g)\b/, () => 1],
  [/^cups?\b/, perCup], [/^(?:tablespoons?|tbsp)\b/, (n) => perCup(n) / 16], [/^(?:teaspoons?|tsp)\b/, (n) => perCup(n) / 48],
  [/^(?:pinch(?:es)?|dash(?:es)?)\b/, () => .4], [/^(?:sticks?)\b/, () => 113], [/^(?:cloves?)\b/, () => 5],
];

/** The plain name of an ingredient line, as it would read on a package. */
export function ingredientName(line: string) {
  return line
    .replace(/\([^)]*\)/g, '')
    .replace(/^(?:about\s+)?/i, '')
    .replace(new RegExp(String.raw`^(?:${NUMBER})(?:\s*(?:to|-|–)\s*(?:${NUMBER}))?\s*`), '')
    .replace(/^(?:fluid ounces?|fl\.? ?oz|pounds?|lbs?|ounces?|oz|grams?|g|kilograms?|kg|cups?|tablespoons?|tbsp|teaspoons?|tsp|pinch(?:es)?|dash(?:es)?|sticks?|sprigs?|slices?|large|medium|small|whole|packages?|cans?|loaf|loaves)\b\.?\s*/i, '')
    .replace(/^(?:of)\s+/i, '')
    // "bone-in, skin-on chicken thighs": cut descriptions, not the cut of meat.
    .replace(/^(?:(?:bone-in|boneless|skin-on|skinless),?\s+)+/i, '')
    .replace(/,.*$/, '')
    .replace(/\s+or\s+more.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Estimated grams for one recipe line, or null when there's no amount to go on. */
export function estimateGrams(line: string) {
  const lower = line.toLowerCase();
  const name = ingredientName(lower);
  // "1 can (21 ounces) cherry pie filling", "3 packages (8 ounces each)", "1 loaf (about 1 pound)"
  const inner = lower.match(new RegExp(String.raw`\((?:about\s+)?(${NUMBER})\s*-?\s*(pounds?|ounces?|oz|lbs?)(\s+each)?`));
  const lead = lower.match(new RegExp(String.raw`^(?:about\s+)?(${NUMBER})(?:\s*(?:to|-|–)\s*(${NUMBER}))?\s*(.*)$`));
  if (inner) {
    const per = toNumber(inner[1]) * (/^(?:pound|lb)/.test(inner[2]) ? 453.6 : 28.35);
    return inner[3] && lead ? per * toNumber(lead[1]) : per;
  }
  if (!lead) return /pinch|dash/.test(lower) ? .4 : null;
  const amount = lead[2] ? (toNumber(lead[1]) + toNumber(lead[2])) / 2 : toNumber(lead[1]);
  const rest = lead[3];
  const unit = UNITS.find(([pattern]) => pattern.test(rest));
  if (unit) return amount * unit[1](name);
  const each = EACH.find(([pattern]) => pattern.test(rest));
  return amount * (each?.[1] ?? 30);
}

/**
 * The ingredients in descending order of estimated weight, with repeats (butter for the
 * pan and butter for the sauce) counted together.
 */
export function ingredientStatement(lines: string[]) {
  const totals = new Map<string, { name: string; grams: number; order: number }>();
  lines.forEach((line, order) => {
    const name = ingredientName(line);
    if (!name) return;
    const key = name.toLowerCase();
    const grams = estimateGrams(line) ?? 0;
    const seen = totals.get(key);
    if (seen) seen.grams += grams;
    else totals.set(key, { name, grams, order });
  });
  return [...totals.values()].sort((a, b) => b.grams - a.grams || a.order - b.order).map(({ name }) => name);
}

// The nine major food allergens a U.S. label names, found by ingredient name.
const ALLERGENS: [string, RegExp][] = [
  ['Milk', /\b(?:milk|butter(?!milk\b)|buttermilk|cream|cheese|cheddar|mozzarella|parmesan|feta|ricotta|yogurt|half-and-half|whey|ghee)\b/],
  ['Eggs', /\beggs?\b|mayonnaise/],
  ['Wheat', /\b(?:flour|bread|baking mix|bisquick|graham|spaghetti|pasta|noodles?|crackers?|breadcrumbs?|panko)\b/],
  ['Soy', /\b(?:soy|tofu|edamame|miso)\b/],
  ['Peanuts', /\bpeanuts?\b/],
  ['Tree nuts', /\b(?:walnuts?|pecans?|almonds?|cashews?|pistachios?|hazelnuts?|macadamia)\b/],
  ['Fish', /\b(?:anchov(?:y|ies)|salmon|tuna|cod|fish)\b/],
  ['Shellfish', /\b(?:shrimp|crab|lobster|clams?|mussels?|scallops?)\b/],
  ['Sesame', /\b(?:sesame|tahini)\b/],
];

/** Major allergens named by the ingredient lines. Brands differ, so it's a guide, not a guarantee. */
export function allergensIn(lines: string[]) {
  // Coconut "milk" and "cream" aren't dairy; peanut butter is peanuts.
  const text = lines.join(' ').toLowerCase()
    .replace(/peanut butter/g, 'peanuts')
    .replace(/coconut milk|cream of coconut|coconut cream/g, 'coconut');
  return ALLERGENS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

// Typical calories per gram, for a second opinion on each matched ingredient. Values are
// rounded from USDA FoodData Central entries for the usual form of each food. First match
// wins, so specific names come first. Foods with no entry aren't checked.
const KCAL_PER_GRAM: [RegExp, number][] = [
  [/water|ice\b|broth|stock|salt|baking soda|baking powder/, 0],
  [/olive oil|vegetable oil|canola|\boil\b|shortening|cooking spray/, 8.8],
  [/mayonnaise/, 6.8], [/peanut butter/, 5.9], [/buttermilk/, 0.4], [/butter|margarine/, 7.2],
  [/walnut|pecan|almond|cashew|peanut/, 6.9],
  [/chocolate chips|chocolate/, 5.3], [/cocoa/, 2.3],
  [/cream cheese/, 3.4], [/parmesan|parmigiano/, 3.9], [/cheddar|mozzarella|feta|cotija|cheese/, 3.8],
  [/heavy cream|whipping cream/, 3.4], [/half-and-half/, 1.3], [/sour cream/, 2.0],
  [/condensed milk/, 3.2], [/evaporated milk/, 1.3], [/cream of coconut/, 3.4], [/coconut milk/, 2.0],
  [/buttermilk/, 0.4], [/milk/, 0.6],
  [/powdered sugar|confectioners/, 3.9], [/brown sugar/, 3.8], [/sugar/, 3.9],
  [/maple syrup/, 2.6], [/corn syrup/, 2.9], [/honey/, 3.0], [/simple syrup/, 2.6],
  [/marshmallow/, 3.2], [/rice krispies|cereal/, 3.9],
  [/baking mix|bisquick/, 4.3], [/cornmeal/, 3.7], [/flour|cornstarch/, 3.6], [/oats/, 3.8],
  [/spaghetti|pasta|noodles/, 3.7], [/graham cracker/, 4.3],
  [/bread|tortilla/, 2.7], [/pie dough|pie crust/, 4.6], [/pie filling/, 1.1],
  [/sausage/, 3.0], [/ground beef/, 2.5], [/ground pork/, 2.6],
  [/roasted chicken thigh/, 2.3], [/chicken thigh/, 2.1], [/chicken breast/, 1.2],
  [/egg/, 1.4],
  [/\brum\b|\bgin\b|vodka|bourbon|whiskey|tequila/, 2.3], [/wine/, 0.85], [/ginger beer/, 0.4],
  [/juice/, 0.45], [/black beans|beans/, 0.9],
  [/potato/, 0.8], [/banana/, 0.9], [/apple|pear/, 0.55], [/pineapple/, 0.5],
  [/avocado/, 1.6], [/olives/, 1.2], [/garlic/, 1.5],
  [/tomato|cucumber|pepper|onion|celery|carrot|green beans|lettuce|lime|lemon|orange|cranberr/, 0.3],
];

/** Typical calories per gram for an ingredient line, or null when there's no entry. */
export function caloriesPerGram(line: string) {
  const name = ingredientName(line.toLowerCase());
  const hit = KCAL_PER_GRAM.find(([pattern]) => pattern.test(name));
  return hit ? hit[1] : null;
}
