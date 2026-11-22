// Search, or let the hero picture pick: tap for a quick shuffle, hold to keep it going.
import { setIcon } from './icon';
import { calm, typeNames } from './motion';

const form = document.querySelector<HTMLFormElement>('#spin')!;
const frame = document.querySelector<HTMLElement>('#dish')!;
const button = document.querySelector<HTMLButtonElement>('#surprise')!;
const result = document.querySelector<HTMLElement>('#dish-said')!;
const slides = [...frame.querySelectorAll<HTMLElement>('.slide')];
const link = frame.querySelector<HTMLAnchorElement>('.dish-link')!;
const name = link.querySelector('span')!;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
let current: HTMLElement | undefined, run = 0;

const show = (slide: HTMLElement) => slides.forEach((s) => (s.hidden = s !== slide));
function land(slide: HTMLElement) {
  current = slide;
  show(slide);
  const { title = '', url = '', thumb } = slide.dataset;
  name.textContent = title;
  link.href = url;
  setIcon(thumb, slide.querySelector('svg'));
}
const pool = () => {
  const meal = String(new FormData(form).get('meal') ?? '');
  return slides.filter((s) => !meal || s.dataset.meal!.split('|').includes(meal));
};
async function spin(held = () => false) {
  const mine = ++run, all = pool();
  if (!all.length) return;
  const winner = pick(all.length > 1 ? all.filter((s) => s !== current) : all);
  // A lazy photo starts loading now, so it is ready when the shuffle stops.
  const photo = winner.querySelector('img');
  if (photo) { photo.loading = 'eager'; await Promise.race([photo.decode().catch(() => {}), wait(1200)]); }
  if (mine !== run) return;
  const box = frame.getBoundingClientRect();
  if (box.top < 0 || box.top > innerHeight * 0.45) frame.scrollIntoView({ block: 'center', behavior: still.matches ? 'auto' : 'smooth' });
  if (!calm() && all.length > 1) {
    frame.classList.remove('landed'); frame.classList.add('spinning');
    name.textContent = 'Shuffling…';
    let last = current;
    const flip = async (ms: number) => {
      show((last = pick(all.filter((s) => s !== last)) ?? winner));
      await wait(ms);
      return mine === run;
    };
    const wasHeld = held();
    while (held()) if (!(await flip(80))) return;
    // A held shuffle only has to slow down. A tap gets the whole run-up.
    for (const ms of wasHeld ? [120, 170, 230, 300] : [70, 70, 80, 90, 100, 120, 150, 190, 240, 310]) if (!(await flip(ms))) return;
    frame.classList.remove('spinning');
    void frame.offsetWidth; // restart the landing wobble
    frame.classList.add('landed');
  }
  land(winner);
  result.textContent = `You got ${winner.dataset.title}.`;
}

// A blank search is just the recipe box, kept to the meal if one is picked.
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form), query = new URLSearchParams();
  for (const key of ['q', 'meal']) { const value = String(data.get(key) ?? '').trim(); if (value) query.set(key, value); }
  location.href = form.action + (query.size ? `?${query}` : '');
});

button.hidden = false;
let timer = 0, holding = false, wasHold = false;
const release = () => { clearTimeout(timer); holding = false; button.classList.remove('held'); button.textContent = 'Surprise me'; };
button.addEventListener('pointerdown', (event) => {
  if (event.button) return;
  wasHold = false;
  button.setPointerCapture(event.pointerId);
  timer = window.setTimeout(() => {
    holding = wasHold = true;
    button.classList.add('held'); button.textContent = 'Let go!';
    spin(() => holding);
  }, 350);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(type, release);
button.addEventListener('contextmenu', (event) => event.preventDefault()); // a long press on a phone
button.addEventListener('click', (event) => {
  // The click that ends a hold already had its spin. Keyboard clicks have no pointer.
  if (wasHold && event.detail) { wasHold = false; return; }
  spin();
});
const titles = slides.map((s) => s.dataset.title!), short = titles.filter((t) => t.length <= 22);
typeNames(document.querySelector<HTMLInputElement>('#home-q')!, short.length ? short : titles, document.querySelector('.find-bar'));

// Open on a random dish, one with a picture if there is one.
const pictured = slides.filter((s) => s.dataset.thumb);
if (slides.length) land(pick(pictured.length ? pictured : slides));
