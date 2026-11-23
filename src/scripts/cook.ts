// Step-by-step cooking: tick each line, hear it read, keep your hands free.
import { setupKitchenTimers } from './kitchen-timers';
import { confetti, number, replay } from './motion';
import { listen, prefs, quiet, speak, type Line } from './voice';

// Ingredient words get the same hover as on the recipe page.
function fill(el: HTMLElement, line: Line) {
  if (!line.parts) { el.textContent = line.text; return; }
  el.replaceChildren(...line.parts.map((p) => {
    if (typeof p === 'string') return document.createTextNode(p);
    const word = document.createElement('span');
    word.className = p.gm ? 'ing ing-group' : 'ing'; word.textContent = p.s;
    if (p.e) word.dataset.e = p.e.join(' ');
    if (p.o) word.dataset.o = p.o.join(' ');
    if (p.g) word.dataset.g = p.g;
    if (p.gm) word.dataset.gm = p.gm;
    return word;
  }));
}

interface Data { id: string; title: string; groups: { name: string; lines: Line[] }[]; steps: { title: string; heading: Line; lines: Line[]; why?: Line }[]; phrases: Record<string, Line> }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const data: Data = JSON.parse($('cook-data').textContent!);
const dialog = $<HTMLDialogElement>('cook');
// Page 0 is the ingredients; pages 1..n are the directions.
const pages = [
  { title: 'Set everything out', heading: data.phrases.gather, why: undefined as Line | undefined, lines: data.groups.flatMap((g) => g.lines.map((line) => ({ line, group: g.name }))) },
  ...data.steps.map((s) => ({ title: s.title, heading: s.heading, why: s.why, lines: s.lines.map((line) => ({ line, group: '' })) })),
];
const KEY = `conway-cook-${data.id}`;
let page = 0, finished = false, openedFrom: HTMLElement | null = null;
let ticks = pages.map((p) => p.lines.map(() => false));

const store = () => { try { localStorage.setItem(KEY, JSON.stringify({ page, ticks })); } catch { /* private window */ } };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  // Ignore saved progress if the recipe has changed shape since.
  if (saved && saved.ticks?.length === ticks.length && saved.ticks.every((t: boolean[], i: number) => t.length === ticks[i].length)) {
    ticks = saved.ticks; page = Math.min(Math.max(0, saved.page | 0), pages.length - 1);
  }
} catch { /* start fresh */ }

/* ---------- Voice ---------- */
let run = 0, speaking = false;
function hush() {
  run++; speaking = false; quiet();
  document.querySelectorAll('.cook-lines .now').forEach((el) => el.classList.remove('now'));
  $('cook-read').textContent = 'Read aloud';
}
async function say(lines: { line: Line; row?: number; fallback?: Line }[]) {
  hush();
  const mine = run; speaking = true;
  $('cook-read').textContent = 'Stop reading';
  for (const { line, row, fallback } of lines) {
    document.querySelectorAll('.cook-lines .now').forEach((el) => el.classList.remove('now'));
    if (row !== undefined) $('cook-lines').querySelector(`[data-row="${row}"]`)?.classList.add('now');
    const ok = await speak(line, () => mine === run) || (fallback && mine === run && await speak(fallback, () => mine === run));
    if (mine !== run) return;
    if (!ok) { $('cook-warn').textContent = 'This browser has no on-device voice to read with.'; break; }
  }
  if (mine === run) hush();
}
const readPage = () => say([{ line: pages[page].heading }, ...pages[page].lines.map(({ line }, row) => ({ line, row })), ...(pages[page].why && $<HTMLDetailsElement>('cook-why').open ? [{ line: pages[page].why! }] : [])]);
// "Why": open the note and read it out. Reading a page aloud includes it only when it is open.
function whyNow() {
  const why = $<HTMLDetailsElement>('cook-why');
  if (!pages[page].why) return;
  why.open = true;
  say([{ line: pages[page].why! }]);
}

/* ---------- Timers ---------- */
const kitchenTimers = setupKitchenTimers({
  dialog,
  announce: (text, expired) => say([{ line: { text, say: text }, fallback: expired ? data.phrases.timer : undefined }]),
});
const startTimer = kitchenTimers.start;
// "60–75 minutes" starts at 60, so you check early.
const times = (text: string) => [...text.matchAll(/(\d+)(?:\s*(?:–|-|to)\s*\d+)?\s*(minute|hour)s?/gi)].map((m) => ({ minutes: Number(m[1]) * (m[2].toLowerCase() === 'hour' ? 60 : 1), label: m[0] }));

/* ---------- Pages ---------- */
const left = (p = page) => ticks[p].filter((t) => !t).length;
function draw(focus = true) {
  const p = pages[page];
  finished = false;
  $('cook-check-hint').hidden = false;
  $<HTMLButtonElement>('cook-next').disabled = false;
  $('cook-warn').textContent = '';
  $('cook-count').textContent = page ? `Step ${page} of ${pages.length - 1}` : 'Before you start';
  $('cook-heading').textContent = p.title || `Step ${page}`;
  let group = '';
  $('cook-lines').replaceChildren(...p.lines.flatMap(({ line, group: g }, row) => {
    const li = document.createElement('li'); li.dataset.row = String(row);
    const label = document.createElement('label'), box = document.createElement('input'), text = document.createElement('span');
    box.type = 'checkbox'; box.checked = ticks[page][row]; fill(text, line);
    box.addEventListener('change', () => { ticks[page][row] = box.checked; store(); drawTrack(); });
    label.append(box, text); li.append(label);
    if (g === group) return [li];
    group = g;
    const head = document.createElement('li'); head.className = 'cook-group'; head.textContent = g;
    return [head, li];
  }));
  number($('cook-lines').children);
  const why = $<HTMLDetailsElement>('cook-why');
  why.hidden = !p.why; why.open = false;
  if (p.why) fill($('cook-why-text'), p.why);
  $('cook-extra').replaceChildren();
  if (!page) {
    const all = document.createElement('button'); all.type = 'button'; all.className = 'button quiet'; all.textContent = 'I have everything';
    all.addEventListener('click', () => { tickAll(); go(1); });
    $('cook-extra').append(all);
  } else for (const t of times(p.lines.map((l) => l.line.text).join(' '))) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'button quiet'; b.dataset.timer = '';
    b.textContent = `Start ${t.minutes}-minute timer`;
    b.addEventListener('click', () => startTimer(t.minutes, p.title || `Step ${page}`));
    $('cook-extra').append(b);
  }
  $<HTMLButtonElement>('cook-back').disabled = page === 0;
  $('cook-next').textContent = page === pages.length - 1 ? 'Finish' : 'Next step';
  drawTrack(); store();
  $('cook-card').scrollTop = 0;
  if (focus) $('cook-card').focus({ preventScroll: true });
  if (prefs.auto) readPage(); else hush();
}
function drawTrack() {
  const before = new Set([...$('cook-track').querySelectorAll('.done')].map((b) => b.getAttribute('data-i')));
  const first = !$('cook-track').children.length;
  $('cook-track').replaceChildren(...pages.map((p, i) => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.textContent = left(i) ? (i ? String(i) : 'Prep') : '✓';
    b.setAttribute('aria-label', `${i ? `Step ${i}` : 'Ingredients'}: ${p.title}${left(i) ? '' : ', done'}`);
    if (i === page) b.setAttribute('aria-current', 'step');
    b.classList.toggle('done', !left(i)); b.dataset.i = String(i);
    if (!first && !left(i) && !before.has(String(i))) b.classList.add('just');
    b.addEventListener('click', () => go(i));
    li.append(b); return li;
  }));
  const track = $('cook-track'), here = track.querySelector<HTMLElement>('[aria-current]');
  if (here) track.scrollLeft = here.offsetLeft - track.offsetLeft - track.clientWidth / 2 + here.offsetWidth / 2;
}
function tickAll() { ticks[page] = ticks[page].map(() => true); store(); }
function go(to: number) { const way = to < page ? 'back' : 'next'; $('cook-card').classList.remove('next', 'back'); replay($('cook-card'), way); page = Math.min(Math.max(0, to), pages.length - 1); draw(); }
function next() {
  if (finished) return;
  if (page < pages.length - 1) return go(page + 1);
  hush();
  finished = true;
  $('cook-check-hint').hidden = true;
  $<HTMLButtonElement>('cook-next').disabled = true;
  $('cook-count').textContent = 'All done'; $('cook-heading').textContent = 'Enjoy it.';
  $('cook-lines').replaceChildren(); $('cook-extra').replaceChildren(); $('cook-why').hidden = true;
  const again = document.createElement('button'); again.type = 'button'; again.className = 'button quiet'; again.textContent = 'Start over';
  again.addEventListener('click', () => { ticks = pages.map((p) => p.lines.map(() => false)); go(0); });
  const share = document.createElement('button'); share.type = 'button'; share.className = 'button'; share.textContent = 'Add a photo or a note';
  share.addEventListener('click', () => { dialog.close(); document.getElementById('photos')?.scrollIntoView({ behavior: 'smooth' }); });
  $('cook-extra').append(share, again);
  confetti(dialog);
  say([{ line: data.phrases.finished }]);
}
function tickNext() {
  if (finished) return;
  const row = ticks[page].indexOf(false);
  if (row < 0) return next();
  ticks[page][row] = true;
  const box = $('cook-lines').querySelector<HTMLInputElement>(`[data-row="${row}"] input`);
  if (box) box.checked = true;
  $('cook-warn').textContent = ''; store(); drawTrack();
  const after = ticks[page].indexOf(false);
  if (after >= 0) say([{ line: pages[page].lines[after].line, row: after }]); else next();
}

/* ---------- Voice commands ---------- */
let micRequest = 0;
let micOn = false, stopMic: (() => void) | undefined;
const numbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
function command(heard: string) {
  const words = heard.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  // Short phrases only, so kitchen chatter doesn't turn the page.
  if (!words) return;
  const custom = words.match(/^(?:set |start )?(?:a )?timer(?: for)? (\w+)(?: (seconds?|minutes?|hours?))?$/)
    ?? words.match(/^(?:start |set )?(?:a )?(\w+) (seconds?|minutes?|hours?) timer$/);
  if (custom) {
    const amount = /^\d+$/.test(custom[1]) ? Number(custom[1]) : numbers.indexOf(custom[1]);
    const minutes = amount * (custom[2]?.startsWith('second') ? 1 / 60 : custom[2]?.startsWith('hour') ? 60 : 1);
    if (minutes >= 1 / 60 && minutes <= 24 * 60) startTimer(minutes, 'Kitchen timer');
    return;
  }
  if (/^(next|next step|skip)$/.test(words)) return next();
  if (/^(back|go back|previous|previous step)$/.test(words)) return go(page - 1);
  if (words.split(' ').length > 4) return;
  if (/\b(stop|quiet|pause)\b/.test(words)) return hush();
  if (/^(why|why is that|explain)$/.test(words)) return speaking ? undefined : whyNow();
  if (speaking) return; // don't obey our own narration
  const step = words.match(/\bstep (\w+)/);
  if (step) { const n = /^\d+$/.test(step[1]) ? Number(step[1]) : numbers.indexOf(step[1]); if (n > 0) return go(n); }
  if (/\b(check|tick)\b/.test(words)) return tickNext();
  if (/\bdone\b/.test(words)) { tickAll(); return next(); }
  if (/\b(repeat|again|read)\b/.test(words)) return readPage();
  if (/\bingredients?\b/.test(words)) return go(0);
  if (/\btimer\b/.test(words)) $('cook-extra').querySelector<HTMLButtonElement>('[data-timer]')?.click();
}
async function mic(on: boolean) {
  const request = ++micRequest;
  stopMic?.(); stopMic = undefined; micOn = on;
  if (!on) return;
  const stop = await listen(command, (why) => { if (request !== micRequest) return; micOn = false; $('cook-warn').textContent = why; document.dispatchEvent(new CustomEvent('mic:failed', { detail: why })); }, () => request === micRequest && micOn && dialog.open);
  if (stop && request === micRequest && micOn && dialog.open) { stopMic = stop; $('cook-warn').textContent = 'Listening. Try saying “next”.'; } else stop?.();
}

/* ---------- Keep the screen on, open and close ---------- */
let lock: any;
const stayAwake = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* battery saver */ } };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && dialog.open) stayAwake(); });

function open(from: HTMLElement) {
  openedFrom = from; dialog.showModal(); document.documentElement.classList.add('cooking');
  kitchenTimers.place(); stayAwake(); draw(); if (prefs.mic) mic(true);
}
dialog.addEventListener('close', () => {
  hush(); kitchenTimers.place(); mic(false); panel(false, false);
  lock?.release?.(); document.documentElement.classList.remove('cooking'); openedFrom?.focus(); label();
});
const starter = document.querySelector<HTMLButtonElement>('[data-cook]')!;
const label = () => { starter.textContent = page || ticks.flat().some(Boolean) ? 'Keep cooking' : 'Start cooking'; };
starter.hidden = !data.steps.length; label();
starter.addEventListener('click', () => open(starter));
const customTimer = $<HTMLFormElement>('custom-timer');
customTimer.addEventListener('submit', event => {
  event.preventDefault();
  const amount = $<HTMLInputElement>('timer-duration').valueAsNumber;
  const minutes = amount / ($<HTMLSelectElement>('timer-unit').value === 'seconds' ? 60 : 1);
  if (Number.isFinite(minutes) && minutes >= 1 / 60 && minutes <= 24 * 60) {
    startTimer(minutes, 'Kitchen timer');
    $<HTMLDetailsElement>('timer-tools').open = false;
    $('timer-tools').querySelector('summary')?.focus();
  } else $('cook-warn').textContent = 'Choose a duration between 1 second and 24 hours.';
});
$('cook-close').addEventListener('click', () => dialog.close());
$('cook-back').addEventListener('click', () => go(page - 1));
$('cook-next').addEventListener('click', next);
$('cook-read').addEventListener('click', () => (speaking ? hush() : readPage()));
dialog.addEventListener('keydown', (event) => {
  if ((event.target as Element).closest('#cook-voice, #acc-widget-host, #custom-timer, #kitchen-timers') || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); next(); }
  else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); go(page - 1); }
  else if (event.key.toLowerCase() === 'r') speaking ? hush() : readPage();
});
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('nexttrack', () => dialog.open && next());
  navigator.mediaSession.setActionHandler('previoustrack', () => dialog.open && go(page - 1));
}

/* ---------- The voice panel ---------- */
function panel(show: boolean, focus = true) {
  $('cook-voice').hidden = !show;
  $('cook-voice-open').setAttribute('aria-expanded', String(show));
  if (show) hush();
  if (focus) $(show ? 'cook-voice-close' : 'cook-voice-open').focus();
}
$('cook-voice-open').addEventListener('click', () => panel($('cook-voice').hidden));
$('cook-voice-close').addEventListener('click', () => panel(false));
// Escape shuts the panel first, then cook mode.
dialog.addEventListener('cancel', (event) => {
  if (document.activeElement?.id === 'acc-widget-host') return event.preventDefault(); // Escape closed the reading panel
  if (!$('cook-voice').hidden) { event.preventDefault(); panel(false); } });
document.addEventListener('voice:preview', hush);
document.addEventListener('voice:change', (event) => {
  if ((event as CustomEvent).detail === 'mic' && dialog.open) mic(prefs.mic);
  if ((event as CustomEvent).detail === 'auto' && !prefs.auto) hush();
});
