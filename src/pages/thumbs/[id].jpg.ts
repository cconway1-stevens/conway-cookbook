// Small round-icon versions of the recipe photos, made at build time.
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { allRecipes } from '../../lib/recipes';

export async function getStaticPaths() {
  return (await allRecipes()).filter((r) => r.data.image).map((r) => ({ params: { id: r.id }, props: { image: r.data.image } }));
}
export const GET: APIRoute = async ({ props }) =>
  new Response(new Uint8Array(await sharp(`public/${props.image.split('?')[0]}`).resize(128, 128, { fit: 'cover' }).jpeg({ quality: 78 }).toBuffer()), { headers: { 'Content-Type': 'image/jpeg' } });
