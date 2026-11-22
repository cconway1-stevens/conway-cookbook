import { createHash } from 'node:crypto';

export function nutritionInput(lines, yieldText) {
  const ingredients = lines.map(line => line.trim().replace(/\s+/g, ' '));
  const servings = /^\d+$/.test(yieldText.trim()) ? Number(yieldText.trim()) : 1;
  const fingerprint = createHash('sha256').update(JSON.stringify([ingredients, servings])).digest('hex');
  return { ingredients, servings, fingerprint };
}
