import { createHash } from 'node:crypto';

// "as" maps an ingredient line to the line nutrition is calculated from instead ("" leaves it out).
export function nutritionInput(lines, yieldText, as = {}) {
  // A replacement can name several foods, joined by " + " (cooked meat + cooked skin).
  const ingredients = lines.flatMap(line => (line in as ? as[line] : line).split(' + ')).map(line => line.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const servings = /^\d+$/.test(yieldText.trim()) ? Number(yieldText.trim()) : 1;
  const fingerprint = createHash('sha256').update(JSON.stringify([ingredients, servings])).digest('hex');
  return { ingredients, servings, fingerprint };
}
