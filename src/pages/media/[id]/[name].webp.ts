// A resized copy of each recipe photo. Re-encoding drops everything hidden in the file.
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { photosOf, SIZES, type Photo } from '../../../lib/media';
import { allRecipes } from '../../../lib/recipes';

export async function getStaticPaths() {
  return (await allRecipes()).flatMap((r) => photosOf(r.id)).flatMap((photo) =>
    (Object.keys(SIZES) as (keyof typeof SIZES)[]).map((size) => ({ params: { id: photo.id, name: `${photo.key}-${size}` }, props: { photo, size } })));
}
export const GET: APIRoute<{ photo: Photo; size: keyof typeof SIZES }> = async ({ props: { photo, size } }) => {
  const data = await sharp(photo.path).rotate().resize({ width: SIZES[size], height: SIZES[size], fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
    .catch(() => { throw new Error(`${photo.path} isn't a photo that can be opened. Save it again as a JPEG.`); });
  return new Response(new Uint8Array(data), { headers: { 'Content-Type': 'image/webp' } });
};
