const volumes = { 'mL': 1, 'L': 1000, 'US tsp': 4.92892159375, 'US tbsp': 14.78676478125, 'US fl oz': 29.5735295625, 'US cup': 236.5882365, 'US pint': 473.176473, 'US quart': 946.352946, 'US gallon': 3785.411784 };
const weights = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
const groups = [volumes, weights, { '°F': 1, '°C': 1 }];
const names = new Map([
  ['milliliters?|millilitres?|ml', 'mL'], ['liters?|litres?|l', 'L'],
  ['teaspoons?|tsp', 'US tsp'], ['tablespoons?|tbsp', 'US tbsp'],
  ['fluid ounces?|fl\\.?\\s*oz', 'US fl oz'], ['cups?', 'US cup'],
  ['pints?|pt', 'US pint'], ['quarts?|qt', 'US quart'], ['gallons?|gal', 'US gallon'],
  ['kilograms?|kg', 'kg'], ['grams?|g', 'g'], ['ounces?|oz', 'oz'], ['pounds?|lbs?', 'lb'],
]);
const ingredient = new RegExp(`^([\\d\\s./¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+?)\\s*(?:US\\s+)?(${[...names.keys()].map(name => `(?:${name})`).join('|')})\\b`, 'i');
const fractions: Record<string, string> = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅐': '1/7', '⅑': '1/9', '⅒': '1/10', '⅓': '1/3', '⅔': '2/3', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
function measure(text: string) {
  const match = text.match(ingredient);
  if (!match) return;
  const unit = [...names].find(([name]) => new RegExp(`^(?:${name})$`, 'i').test(match[2]))?.[1];
  const amount = match[1].replace(/[¼-¾⅐-⅞]/g, char => ' ' + (fractions[char] ?? char)).trim().split(/\s+/)
    .reduce((sum, part) => {
      const [a, b = '1'] = part.split('/');
      return sum + Number(a) / Number(b);
    }, 0);
  if (unit && Number.isFinite(amount) && amount > 0) return { amount, unit, prefix: match[0] };
}

const dialog = document.querySelector<HTMLDialogElement>('#converter')!;
const amount = dialog.querySelector<HTMLInputElement>('#convert-amount')!;
const from = dialog.querySelector<HTMLSelectElement>('#convert-from')!;
const to = dialog.querySelector<HTMLSelectElement>('#convert-to')!;
const source = dialog.querySelector('#convert-source')!;
const result = dialog.querySelector('output')!;
const format = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 });
const options = (units: string[]) => units.map(unit => new Option(unit, unit));
function updateTargets() {
  const group = groups.find(group => Object.hasOwn(group, from.value))!;
  const units = Object.keys(group).filter(unit => unit !== from.value);
  const preferred: Record<string, string> = { 'US cup': 'mL', 'mL': 'US cup', L: 'US cup', 'US tsp': 'mL', 'US tbsp': 'mL', 'US fl oz': 'mL', g: 'oz', kg: 'lb', oz: 'lb', lb: 'g' };
  to.replaceChildren(...options(units));
  if (units.includes(preferred[from.value])) to.value = preferred[from.value];
}
function update() {
  const original = amount.valueAsNumber;
  if (!Number.isFinite(original) || (original < 0 && !from.value.startsWith('°'))) {
    result.textContent = 'Enter a valid amount.';
    return;
  }
  const group = groups.find(group => Object.hasOwn(group, from.value)) as Record<string, number>;
  const converted = from.value === '°F' ? (original - 32) * 5 / 9
    : from.value === '°C' ? original * 9 / 5 + 32
    : original * group[from.value] / group[to.value];
  result.textContent = `${format.format(original)} ${from.value} ≈ ${format.format(converted)} ${to.value}`;
}
function open(text = '', known?: { amount: number; unit: string }) {
  source.textContent = text;
  amount.value = String(known?.amount ?? 1);
  from.value = known?.unit ?? 'US cup';
  updateTargets();
  update();
  dialog.showModal();
}
from.replaceChildren(...options(groups.flatMap(group => Object.keys(group))));
from.addEventListener('change', updateTargets);
dialog.addEventListener('input', update);
dialog.addEventListener('change', update);
const launch = document.querySelector<HTMLButtonElement>('#convert-open')!;
launch.hidden = false;
launch.addEventListener('click', () => open());
const picker = document.querySelector<HTMLSelectElement>('[data-unit-choice]');
const preferenceKey = 'cookbook-ingredient-units';
const rows = [...document.querySelectorAll<HTMLElement>('.sec-ingredients li')].flatMap(line => {
  // Preserve rich Markdown when a contributor has formatted an ingredient.
  if ([...line.children].some(child => !child.matches('.ingredient-tick'))) return [];
  const text = line.textContent?.trim() ?? '';
  const parsed = measure(text);
  const prefix = parsed?.prefix ?? text.match(/^(?:[\d¼½¾⅓⅔⅛⅜⅝⅞]+(?:[./–-][\d]+)?(?:\s+\d+\/\d+)?)(?=\s)/)?.[0] ?? '';
  const quantity = document.createElement(parsed ? 'button' : 'span');
  quantity.className = 'measure-quantity';
  quantity.textContent = compactQuantity(prefix);
  if (quantity instanceof HTMLButtonElement && parsed) {
    quantity.type = 'button';
    quantity.classList.add('convert-ingredient');
    quantity.title = 'Convert ' + text;
    quantity.setAttribute('aria-label', quantity.title);
    quantity.addEventListener('click', event => { event.stopPropagation(); open(text, parsed); });
  }
  const name = document.createElement('span');
  name.className = 'measure-name';
  name.textContent = text.slice(prefix.length).trim();
  const tick = line.querySelector('.ingredient-tick');
  line.replaceChildren(...(tick ? [tick] : []), quantity, ' ', name);
  line.classList.add('measure-row');
  return [{ quantity, parsed, prefix }];
});

function compactQuantity(value: string) {
  return value.replace(/tablespoons?/gi, 'tbsp').replace(/teaspoons?/gi, 'tsp')
    .replace(/ounces?/gi, 'oz').replace(/pounds?/gi, 'lb');
}

function applyUnits(system: string) {
  if (picker) picker.value = system;
  for (const { quantity, parsed, prefix } of rows) {
    quantity.textContent = compactQuantity(prefix);
    if (!parsed || system === 'original') continue;
    const volume = Object.hasOwn(volumes, parsed.unit);
    const factors: Record<string, number> = volume ? volumes : weights;
    const baseAmount = parsed.amount * factors[parsed.unit];
    if (system === 'metric' && ['mL','L','g','kg'].includes(parsed.unit)) continue;
    if (system === 'us' && !['mL','L','g','kg'].includes(parsed.unit)) continue;
    const target = system === 'metric'
      ? (volume ? (baseAmount >= 1000 ? 'L' : 'mL') : (baseAmount >= 1000 ? 'kg' : 'g'))
      : (volume ? (baseAmount < 15 ? 'US tsp' : baseAmount < 60 ? 'US tbsp' : 'US cup') : (baseAmount >= weights.lb ? 'lb' : 'oz'));
    quantity.textContent = '≈ ' + format.format(baseAmount / factors[target]) + ' ' + target;
  }
}
function restoreUnits() {
  let system = 'original';
  try { system = localStorage.getItem(preferenceKey) ?? system; } catch {}
  applyUnits(['metric','us'].includes(system) ? system : 'original');
}
if (picker) {
  picker.parentElement!.hidden = false;
  picker.addEventListener('change', () => {
    applyUnits(picker.value);
    try { localStorage.setItem(preferenceKey, picker.value); } catch {}
  });
}
restoreUnits();
window.addEventListener('pageshow', restoreUnits);
window.addEventListener('storage', event => { if (!event.key || event.key === preferenceKey) restoreUnits(); });
