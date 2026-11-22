import { allRecipes, ingredients } from '../../lib/recipes';

export async function getStaticPaths() {
  return (await allRecipes()).map(recipe => ({
    params: { id: recipe.id }, props: { lines: ingredients(recipe).flatMap(group => group.items), measures: recipe.data.shoppingMeasures ?? [] },
  }));
}

export const GET = ({ props }: { props: { lines: string[]; measures: unknown[] } }) => Response.json(props);
