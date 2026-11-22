// Step-by-step cooking: tick each line, hear it read, keep your hands free.
import { confetti, number, replay } from './motion';
import { listen, prefs, quiet, speak, type Line } from './voice';

interface Data { id: string; title: string; groups: { name: string; lines: Line[] }[]; steps: { title: string; heading: Line; lines: Line[] }[]; phrases: Record<string, Line> }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const data: Data = JSON.parse($('cook-data').textContent!);
const dialog = $<HTMLDialogElement>('cook');
// Page 0 is the ingredients; pages 1..n are the directions.
const pages = [
  { title: 'Set everything out', heading: data.phrases.gather, lines: data.groups.flatMap((g) => g.lines.map((line) => ({ line, group: g.name }))) },
  ...data.steps.map((s) => ({ title: s.title, heading: s.heading, lines: s.lines.map((line) => ({ line, group: '' })) })),
];
const KEY = `conway-cook-${data.id}`;
let page = 0, warned = false, openedFrom: HTMLElement | null = null;
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
async function say(lines: { line: Line; row?: number }[]) {
  hush();
  const mine = run; speaking = true;
  $('cook-read').textContent = 'Stop reading';
  for (const { line, row } of lines) {
    document.querySelectorAll('.cook-lines .now').forEach((el) => el.classList.remove('now'));
    if (row !== undefined) $('cook-lines').querySelector(`[data-row="${row}"]`)?.classList.add('now');
    const ok = await speak(line, () => mine === run);
    if (mine !== run) return;
    if (!ok) { $('cook-warn').textContent = 'This browser has no on-device voice to read with.'; break; }
  }
  if (mine === run) hush();
}
const readPage = () => say([{ line: pages[page].heading }, ...pages[page].lines.map(({ line }, row) => ({ line, row }))]);

/* ---------- Timers ---------- */
const timers: { label: string; end: number; el: HTMLElement; done: boolean }[] = [];
let sound: AudioContext | undefined;
function chime() {
  if (!sound) return;
  [0, 0.35, 0.7].forEach((at) => {
    const osc = sound!.createOscillator(), gain = sound!.createGain(), t = sound!.currentTime + at;
    osc.frequency.value = 880; gain.gain.setValueAtTime(0.35, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(sound!.destination); osc.start(t); osc.stop(t + 0.3);
  });
}
function startTimer(minutes: number, label: string) {
  sound ??= new AudioContext(); sound.resume();
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'timer';
  const timer = { label, end: Date.now() + minutes * 60000, el, done: false };
  el.addEventListener('click', () => { timers.splice(timers.indexOf(timer), 1); el.remove(); });
  timers.push(timer); $('cook-timers').append(el); drawTimers();
}
function drawTimers() {
  for (const t of timers) {
    const left = Math.max(0, Math.ceil((t.end - Date.now()) / 1000));
    t.el.textContent = left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} ${t.label}` : `Done: ${t.label}`;
    t.el.setAttribute('aria-label', `${t.el.textContent}. Press to remove.`);
    if (!left && !t.done) { t.done = true; t.el.classList.add('ring'); chime(); if (!speaking) say([{ line: data.phrases.timer }]); }
  }
}
setInterval(drawTimers, 500);
// "60–75 minutes" starts at 60, so you check early.
const times = (text: string) => [...text.matchAll(/(\d+)(?:\s*(?:–|-|to)\s*\d+)?\s*(minute|hour)s?/gi)].map((m) => ({ minutes: Number(m[1]) * (m[2].toLowerCase() === 'hour' ? 60 : 1), label: m[0] }));

/* ---------- Pages ---------- */
const left = (p = page) => ticks[p].filter((t) => !t).length;
function draw(focus = true) {
  const p = pages[page];
  warned = false; $('cook-warn').textContent = '';
  $('cook-count').textContent = page ? `Step ${page} of ${pages.length - 1}` : 'Before you start';
  $('cook-heading').textContent = p.title || `Step ${page}`;
  let group = '';
  $('cook-lines').replaceChildren(...p.lines.flatMap(({ line, group: g }, row) => {
    const li = document.createElement('li'); li.dataset.row = String(row);
    const label = document.createElement('label'), box = document.createElement('input'), text = document.createElement('span');
    box.type = 'checkbox'; box.checked = ticks[page][row]; text.textContent = line.text;
    box.addEventListener('change', () => { ticks[page][row] = box.checked; warned = false; $('cook-warn').textContent = ''; store(); drawTrack(); });
    label.append(box, text); li.append(label);
    if (g === group) return [li];
    group = g;
    const head = document.createElement('li'); head.className = 'cook-group'; head.textContent = g;
    return [head, li];
  }));
  number($('cook-lines').children);
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
  if (left() && !warned) {
    warned = true;
    const n = left();
    $('cook-warn').textContent = `${n} ${n === 1 ? 'line is' : 'lines are'} not ticked. Finish ${n === 1 ? 'it' : 'them'}, or press ${$('cook-next').textContent} again to go on anyway.`;
    $('cook-lines').querySelector(`[data-row="${ticks[page].indexOf(false)}"]`)?.scrollIntoView({ block: 'nearest' });
    if (prefs.auto || micOn) say([{ line: data.phrases.unchecked }]);
    return;
  }
  if (page < pages.length - 1) return go(page + 1);
  const missed = pages.map((_, i) => i).filter((i) => left(i));
  if (missed.length) {
    $('cook-warn').textContent = `Not ticked yet: ${missed.map((i) => (i ? `step ${i}` : 'ingredients')).join(', ')}. Pick one above to go back, or close when you’re ready.`;
    return;
  }
  $('cook-count').textContent = 'All done'; $('cook-heading').textContent = 'Enjoy it.';
  $('cook-lines').replaceChildren(); $('cook-extra').replaceChildren();
  const again = document.createElement('button'); again.type = 'button'; again.className = 'button quiet'; again.textContent = 'Start over';
  again.addEventListener('click', () => { ticks = pages.map((p) => p.lines.map(() => false)); go(0); });
  const share = document.createElement('button'); share.type = 'button'; share.className = 'button'; share.textContent = 'Add a photo or a note';
  share.addEventListener('click', () => { dialog.close(); document.getElementById('photos')?.scrollIntoView({ behavior: 'smooth' }); });
  $('cook-extra').append(share, again);
  confetti(dialog);
  say([{ line: data.phrases.finished }]);
}
function tickNext() {
  const row = ticks[page].indexOf(false);
  if (row < 0) return next();
  ticks[page][row] = true;
  const box = $('cook-lines').querySelector<HTMLInputElement>(`[data-row="${row}"] input`);
  if (box) box.checked = true;
  warned = false; $('cook-warn').textContent = ''; store(); drawTrack();
  const after = ticks[page].indexOf(false);
  if (after >= 0) say([{ line: pages[page].lines[after].line, row: after }]); else next();
}

/* ---------- Voice commands ---------- */
let micOn = false, stopMic: (() => void) | undefined;
const numbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
function command(heard: string) {
  const words = heard.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  // Short phrases only, so kitchen chatter doesn't turn the page.
  if (!words || words.split(' ').length > 4) return;
  if (/\b(stop|quiet|pause)\b/.test(words)) return hush();
  if (speaking) return; // don't obey our own narration
  const step = words.match(/\bstep (\w+)/);
  if (step) { const n = /^\d+$/.test(step[1]) ? Number(step[1]) : numbers.indexOf(step[1]); if (n > 0) return go(n); }
  if (/\b(check|tick)\b/.test(words)) return tickNext();
  if (/\bdone\b/.test(words)) { tickAll(); return next(); }
  if (/\b(next|skip)\b/.test(words)) return next();
  if (/\b(back|previous)\b/.test(words)) return go(page - 1);
  if (/\b(repeat|again|read)\b/.test(words)) return readPage();
  if (/\bingredients?\b/.test(words)) return go(0);
  if (/\btimer\b/.test(words)) $('cook-extra').querySelector<HTMLButtonElement>('[data-timer]')?.click();
}
async function mic(on: boolean) {
  stopMic?.(); stopMic = undefined; micOn = on;
  if (!on) return;
  const stop = await listen(command, (why) => { micOn = false; $('cook-warn').textContent = why; document.dispatchEvent(new CustomEvent('mic:failed', { detail: why })); }, () => micOn && dialog.open);
  if (stop && micOn && dialog.open) { stopMic = stop; $('cook-warn').textContent = 'Listening. Try saying “next”.'; } else stop?.();
}

/* ---------- Keep the screen on, open and close ---------- */
let lock: any;
const stayAwake = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* battery saver */ } };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && dialog.open) stayAwake(); });

function open(from: HTMLElement) {
  openedFrom = from; dialog.showModal(); document.documentElement.classList.add('cooking');
  stayAwake(); draw(); if (prefs.mic) mic(true);
}
dialog.addEventListener('close', () => {
  hush(); mic(false); panel(false, false);
  lock?.release?.(); document.documentElement.classList.remove('cooking'); openedFrom?.focus(); label();
});
const starter = document.querySelector<HTMLButtonElement>('[data-cook]')!;
const label = () => { starter.textContent = page || ticks.flat().some(Boolean) ? 'Keep cooking' : 'Start cooking'; };
starter.hidden = !data.steps.length; label();
starter.addEventListener('click', () => open(starter));
$('cook-close').addEventListener('click', () => dialog.close());
$('cook-back').addEventListener('click', () => go(page - 1));
$('cook-next').addEventListener('click', next);
$('cook-read').addEventListener('click', () => (speaking ? hush() : readPage()));
dialog.addEventListener('keydown', (event) => {
  if ((event.target as Element).closest('#cook-voice, #acc-widget-host') || event.metaKey || event.ctrlKey || event.altKey) return;
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
