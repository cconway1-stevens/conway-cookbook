// Records every recipe line with the open Kokoro voice, on this machine.
// Runs in the GitHub deploy; nothing is sent to a speech service.
//   node scripts/narrate.mjs          record missing clips
//   node scripts/narrate.mjs --list   print what would be read, record nothing
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { PHRASES, VOICE, clipName, script, spoken } from '../src/lib/narration.mjs';

const OUT = 'public/audio';
const DIR = 'src/content/recipes';
const recipeLines = readdirSync(DIR, { recursive: true }).filter((f) => /\.(md|json)$/.test(f)).flatMap((f) => {
  const text = readFileSync(join(DIR, f), 'utf8');
  return f.endsWith('.json') ? script(JSON.parse(text)) : script({}, text.replace(/^---[\s\S]*?\n---/, ''));
});
const lines = new Map([...Object.values(PHRASES), ...recipeLines].map((text) => [clipName(text), spoken(text)]));

if (process.argv.includes('--list')) {
  for (const [name, text] of lines) console.log(name, text);
  console.log(`${lines.size} clips`);
  process.exit();
}

mkdirSync(OUT, { recursive: true });
for (const old of readdirSync(OUT)) if (!lines.has(old)) rmSync(join(OUT, old));
const todo = [...lines].filter(([name]) => !existsSync(join(OUT, name)));
console.log(`${lines.size} clips, ${todo.length} to record`);
if (todo.length) {
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  for (const [name, text] of todo) {
    const { audio, sampling_rate } = await tts.generate(text, { voice: VOICE });
    const part = join(OUT, name + '.part');
    const run = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'f32le', '-ar', String(sampling_rate), '-ac', '1', '-i', 'pipe:0', '-b:a', '48k', '-f', 'mp3', part],
      { input: Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength) });
    if (run.status !== 0) throw new Error(`ffmpeg: ${run.error ?? run.stderr}`);
    renameSync(part, join(OUT, name));
    console.log(name, text.slice(0, 60));
  }
}
