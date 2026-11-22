import sharp from 'sharp';
import { allRecipes } from '../../../lib/recipes';

export async function getStaticPaths() {
  return (await allRecipes()).filter(recipe => recipe.data.image).flatMap(recipe =>
    [360, 720].map(width => ({ params: { id: recipe.id, width: String(width) }, props: { image: recipe.data.image!, width } })));
}

export async function GET({ props }: { props: { image: string; width: number } }) {
  const bytes = await sharp('public/' + props.image.split('?')[0]).rotate()
    .resize(props.width, props.width * 2 / 3, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/webp' } });
}
