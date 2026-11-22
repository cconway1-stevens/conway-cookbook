import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { nutritionInput } from '../src/lib/nutrition-input.mjs';
const paths = execFileSync('tar',['tf','old/artifact.tar'],{encoding:'utf8'}).split('\n');
const get = name => execFileSync('tar',['xOf','old/artifact.tar',paths.find(p=>p.replace(/^\.\//,'')===name)],{encoding:'utf8'});
mkdirSync('src/data/nutrition',{recursive:true});
for (const r of JSON.parse(get('cookbook.json')).recipes) {
 const section=get('recipes/'+r.id+'/index.html').match(/<section[^>]*id="nutrition"[^>]*>([\s\S]*?)<\/section>/)?.[1];
 if(!section) continue;
 const rows=[...section.matchAll(/<dt>([^<]+)<\/dt>\s*<dd>([\d.]+)\s+([^<]+)<\/dd>/g)].map(m=>({name:m[1],amount:Number(m[2]),unit:m[3]}));
 if(rows.length!==7)throw Error('Unexpected panel markup');
 const { fingerprint }=nutritionInput(r.ingredients.flatMap(g=>g.items),r.servings);
 writeFileSync('src/data/nutrition/'+r.id+'.json',JSON.stringify({fingerprint,rows},null,2)+'\n');
}
