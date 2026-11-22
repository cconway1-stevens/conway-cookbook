import { chosen, micStatus, onVoices, prefs, preview, quiet, savePrefs, voices, type Line, type Voice } from './voice';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const sample: Line = JSON.parse($('voice-sample').textContent!);
const list = $('v-list'), more = $('v-more'), auto = $<HTMLInputElement>('v-auto'), mic = $<HTMLInputElement>('v-mic');
const changed = (what: string) => { savePrefs(); document.dispatchEvent(new CustomEvent('voice:change', { detail: what })); };
let all = false, playing = 0;

function row(name: string, from: string, grade: string, value: string, checked: boolean, pick: Voice | 'recorded') {
  const box = document.createElement('div'), label = document.createElement('label'), input = document.createElement('input');
  const b = document.createElement('b'), small = document.createElement('small'), tag = document.createElement('span'), play = document.createElement('button');
  box.className = 'voice-row'; input.type = 'radio'; input.name = 'v-voice'; input.value = value; input.checked = checked;
  b.textContent = name; small.textContent = from; tag.className = 'grade'; tag.textContent = grade;
  play.type = 'button'; play.textContent = 'Listen'; play.setAttribute('aria-label', `Listen to ${name}`);
  input.addEventListener('change', () => { prefs.voice = value; changed('voice'); });
  play.addEventListener('click', async () => {
    const mine = ++playing, stop = play.textContent === 'Stop';
    list.querySelectorAll('button').forEach((other) => { other.textContent = 'Listen'; other.classList.remove('playing'); });
    document.dispatchEvent(new CustomEvent('voice:preview')); // cook mode stops reading
    if (stop) return quiet();
    play.textContent = 'Stop'; play.classList.add('playing');
    await preview(sample, pick);
    if (mine === playing) { play.textContent = 'Listen'; play.classList.remove('playing'); }
  });
  label.append(input, b, small, tag); box.append(label, play);
  return box;
}
function draw() {
  const found = voices(), mine = chosen();
  const rows: HTMLElement[] = [];
  const own = !!sample.audio;
  if (own) rows.push(row('The cookbook’s voice', 'Recorded', 'Most natural', '', !prefs.voice || !found.some((v) => v.voice.voiceURI === prefs.voice), 'recorded'));
  const shown = all ? found : found.filter((v, i) => i < 4 || (v === mine && prefs.voice));
  rows.push(...shown.map((v) => row(v.name, v.from, v.grade, v.voice.voiceURI, own ? prefs.voice === v.voice.voiceURI : v.voice.voiceURI === mine?.voice.voiceURI, v)));
  if (rows.length) list.replaceChildren(...rows);
  else { const p = document.createElement('p'); p.textContent = 'This browser has no on-device voice, so there’s nothing to read with yet.'; list.replaceChildren(p); }
  more.hidden = found.length <= 4;
  more.textContent = all ? 'Show fewer voices' : `Show all ${found.length} voices`;
  $('v-tip').hidden = own || !found.length || found[0].score >= 3;
}
more.addEventListener('click', () => { all = !all; draw(); });
onVoices(draw);

auto.checked = prefs.auto;
auto.addEventListener('change', () => { prefs.auto = auto.checked; changed('auto'); });
document.querySelectorAll<HTMLInputElement>('[name=v-rate]').forEach((r) => {
  r.checked = Number(r.value) === prefs.rate;
  r.addEventListener('change', () => { prefs.rate = Number(r.value); changed('rate'); });
});
micStatus().then((status) => {
  const ok = status !== 'unavailable';
  mic.disabled = !ok; mic.checked = ok && prefs.mic;
  $('v-commands').hidden = !ok;
  $('v-mic-note').textContent = ok
    ? 'Say a command while you cook. Your voice never leaves this device.'
    : 'This browser can’t listen without sending your voice away, so the microphone stays off.';
});
mic.addEventListener('change', () => { prefs.mic = mic.checked; changed('mic'); });
document.addEventListener('mic:failed', (event) => { prefs.mic = mic.checked = false; savePrefs(); $('v-mic-note').textContent = (event as CustomEvent).detail; });
