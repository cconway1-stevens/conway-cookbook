// Read with the selected recording or on-device voice.
export interface Part { s: string; e?: string[]; o?: string[]; g?: string; gm?: string; amount?: string }
export interface Line { text: string; say: string; audio?: string; parts?: (string | Part)[] }

export const prefs = { auto: true, rate: 1, voice: '', mic: false };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('conway-voice') ?? '{}')); } catch { /* defaults */ }
export const savePrefs = () => { try { localStorage.setItem('conway-voice', JSON.stringify(prefs)); } catch { /* this page only */ } };

const synth = 'speechSynthesis' in window ? window.speechSynthesis : undefined;
// Joke voices and the old synthetic ones Apple still ships. Nobody wants a recipe read by Bubbles.
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox)\b/i;
const ROBOTIC = /^(eddy|flo|fred|grandma|grandpa|junior|kathy|ralph|reed|rocko|sandy|shelley|agnes|bruce|vicki|victoria|princess)\b/i;
export interface Voice { voice: SpeechSynthesisVoice; name: string; from: string; grade: 'Most natural' | 'Natural' | 'Standard' | 'Basic'; score: number }

const ACCENTS: Record<string, string> = { US: 'American', GB: 'British', AU: 'Australian', IE: 'Irish', IN: 'Indian', ZA: 'South African', CA: 'Canadian', NZ: 'New Zealand' };
// localService keeps the words on the device.
export const voices = (): Voice[] => (synth?.getVoices() ?? [])
  .filter((v) => v.localService && /^en\b/i.test(v.lang) && !NOVELTY.test(v.name))
  .map((voice) => {
    const score = /premium/i.test(voice.name) ? 4 : /enhanced|natural|neural/i.test(voice.name) ? 3 : ROBOTIC.test(voice.name) ? 1 : 2;
    const region = voice.lang.split(/[-_]/)[1]?.toUpperCase() ?? '';
    return {
      voice, score: score + (/samantha|ava|zoe|daniel|karen/i.test(voice.name) ? 0.2 : 0) + (region === 'US' ? 0.1 : 0),
      name: voice.name.replace(/\s*\(.*\)|^Microsoft |^Google /g, '').split(' - ')[0].trim(),
      from: ACCENTS[region] ?? voice.lang,
      grade: (['', 'Basic', 'Standard', 'Natural', 'Most natural'] as const)[score] as Voice['grade'],
    };
  })
  .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
export const onVoices = (fn: () => void) => { fn(); synth?.addEventListener?.('voiceschanged', fn); };
export const chosen = () => { const all = voices(); return all.find((v) => v.voice.voiceURI === prefs.voice) ?? all[0]; };

const player = new Audio();
export const quiet = () => { player.pause(); synth?.cancel(); };
const viaClip = (line: Line) => new Promise<boolean>((done) => {
  player.src = line.audio!; player.playbackRate = prefs.rate;
  player.onended = () => done(true); player.onerror = () => done(false); player.onpause = () => { if (!player.ended) done(true); };
  player.play().catch(() => done(false));
});
const viaDevice = (line: Line, pick: Voice) => new Promise<boolean>((done) => {
  if (!synth) return done(false);
  const { voice } = pick;
  const u = new SpeechSynthesisUtterance(line.say);
  u.voice = voice; u.lang = voice.lang; u.rate = prefs.rate;
  u.onend = () => done(true); u.onerror = () => done(false);
  synth.speak(u);
});
export type Narrator = Voice | 'recorded';
export const speak = (line: Line, narrator?: Narrator) => {
  if (narrator === 'recorded') return line.audio ? viaClip(line) : Promise.resolve(false);
  return narrator ? viaDevice(line, narrator) : Promise.resolve(false);
};
export const preview = (line: Line, pick: Narrator) => { quiet(); return speak(line, pick); };

/* ---------- Listening, on the device or not at all ---------- */
const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
const local = { langs: ['en-US'], processLocally: true };
export const micStatus = async (): Promise<string> =>
  !SR || !('processLocally' in SR.prototype) || typeof SR.available !== 'function' ? 'unavailable' : SR.available(local).catch(() => 'unavailable');
export async function listen(onHeard: (text: string) => void, onFail: (why: string) => void, wanted: () => boolean) {
  let status = await micStatus();
  if (!wanted()) return;
  if (status !== 'available' && status !== 'unavailable' && typeof SR.install === 'function') {
    await SR.install(local).catch(() => false);
    status = await micStatus();
  }
  if (status !== 'available') return void onFail('This browser couldn’t set up on-device listening, so the microphone stays off.');
  if (!wanted()) return;
  const rec = new SR();
  rec.lang = 'en-US'; rec.processLocally = true; rec.continuous = true; rec.interimResults = false;
  rec.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onHeard(e.results[i][0].transcript); };
  let dead = false;
  rec.onerror = (e: any) => { if (['not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture'].includes(e.error)) { dead = true; onFail('The microphone isn’t available. Check this browser’s permission for the page.'); } };
  const start = () => {
    if (dead || !wanted()) return;
    try { rec.start(); }
    catch {
      dead = true;
      onFail('On-device listening couldn’t start. Check microphone access and try again.');
    }
  };
  rec.onend = () => setTimeout(start, 300);
  start();
  return () => { dead = true; rec.abort(); };
}
