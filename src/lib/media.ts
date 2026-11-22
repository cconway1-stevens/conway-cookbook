// Everything people have added to a recipe. Files live in src/media/<recipe id>/.
// Photos are only ever published as resized copies, which drops hidden data such as
// where a phone took them.
// Photos are read here and resized by pages/media/, never imported, because Astro would
// publish the untouched original next to the resized one.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { book } from './cookbook';
import { base, type Recipe } from './recipes';

const ROOT = 'src/media';
const PHOTO = /\.(jpe?g|png|webp|avif)$/i;
const others = import.meta.glob<string>('../media/**/*.{gif,mp4,m4v,webm,mov,mp3,m4a,wav,ogg,pdf,GIF,MP4,M4V,WEBM,MOV,MP3,M4A,WAV,OGG,PDF}', { eager: true, query: '?url&no-inline', import: 'default' });

export const SIZES = { small: 560, big: 1600 };
export interface Photo { id: string; file: string; path: string; key: string }
export function photosOf(id: string): Photo[] {
  const dir = `${ROOT}/${id}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort().flatMap((file) => {
    if (/\.hei[cf]$/i.test(file)) console.warn(`[media] ${dir}/${file} is a HEIC photo, which most browsers can't show. Save it as JPEG.`);
    if (!PHOTO.test(file)) return [];
    // The contents are part of the name, so a replaced photo never shows a stale copy.
    return [{ id, file, path: `${dir}/${file}`, key: createHash('sha1').update(file).update(readFileSync(`${dir}/${file}`)).digest('hex').slice(0, 12) }];
  });
}
const photoUrl = (photo: Photo, size: keyof typeof SIZES) => `${base}media/${photo.id}/${photo.key}-${size}.webp`;

export interface MediaItem { kind: 'photo' | 'video' | 'audio' | 'file' | 'embed' | 'link'; src: string; thumb?: string; caption: string; by?: string; alt: string }

const KIND: Record<string, MediaItem['kind']> = { gif: 'photo', mp4: 'video', m4v: 'video', webm: 'video', mov: 'video', mp3: 'audio', m4a: 'audio', wav: 'audio', ogg: 'audio', pdf: 'file' };
// "Christmas-2025.jpg" reads as a caption. "IMG_4821.jpg" does not.
const fromName = (file: string) => {
  const words = file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return /^(img|image|dsc|dscn|pxl|mvi|vid|photo|screenshot)?[\s\d.()]*(hevc|burst|edit)?$/i.test(words) ? '' : words[0].toUpperCase() + words.slice(1);
};
const embed = (url: string) => {
  const youtube = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube[1]}?autoplay=1`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&dnt=1` : '';
};

export function mediaFor(recipe: Recipe): MediaItem[] {
  const mark = `../media/${recipe.id}/`;
  const photos = new Map(photosOf(recipe.id).map((p) => [p.file, p]));
  const found = [...photos.keys(), ...Object.keys(others).filter((p) => p.startsWith(mark)).map((p) => p.slice(mark.length))].sort();
  const listed = recipe.data.media ?? [];
  for (const item of listed) if ('file' in item && !found.includes(item.file)) throw new Error(`${recipe.filePath}: media file "${item.file}" isn't in ${ROOT}/${recipe.id}/`);
  // Listed ones first, in the order given. Then anything else in the folder.
  const queue = [...listed, ...found.filter((f) => !listed.some((i) => 'file' in i && i.file === f)).map((file) => ({ file, caption: undefined, by: undefined }))];
  return queue.map((item): MediaItem => {
    const caption = item.caption ?? ('file' in item ? fromName(item.file) : '');
    const alt = caption || `${recipe.data.title}, photo`;
    if ('url' in item) {
      const player = embed(item.url);
      return { kind: player ? 'embed' : 'link', src: player || item.url, caption: caption || new URL(item.url).hostname.replace(/^www\./, ''), by: item.by, alt };
    }
    const photo = photos.get(item.file);
    if (photo) return { kind: 'photo', src: photoUrl(photo, 'big'), thumb: photoUrl(photo, 'small'), caption, by: item.by, alt };
    return { kind: KIND[item.file.split('.').pop()!.toLowerCase()] ?? 'file', src: others[mark + item.file], caption, by: item.by, alt };
  });
}

// GitHub's own pages for adding to this recipe. Only people with access to the repo can use them.
export const publishLinks = (recipe: Recipe) => book.repo && {
  upload: `https://github.com/${book.repo}/upload/${book.branch}/src/media/${recipe.id}`,
  edit: `https://github.com/${book.repo}/edit/${book.branch}/${recipe.filePath}`,
};
