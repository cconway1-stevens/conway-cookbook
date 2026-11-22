# The Conway Cookbook

A public, read-only family cookbook built with Astro and Markdown.

## Add a recipe

1. Copy `recipe-template.md` into `src/content/recipes/` and give it a filename such as `sunday-pot-roast.md`. The filename becomes part of the recipe URL.
2. Update the title, description, category, date, time, and servings. Fill in the ingredients and directions and remove any unused sections.
3. To add a photo, put it in `public/images/` and add `image: images/your-photo.jpg` and `imageAlt: A description of the photo` to the fields at the top. Optional fields also include `author`, `difficulty`, and a `source` with `name` and `url`.
4. Commit to `main` when ready to publish. You can edit Markdown directly on GitHub with repository write access.

## Browse the cookbook

The welcome page links to the recipe box at `/recipes/`. The recipe box searches titles, ingredients, and recipe text in the browser and stores the query in the URL. Each category has its own page under `/recipes/categories/`, and every recipe has a permanent page under `/recipes/`. Adding a Markdown recipe automatically updates the index and its category page on the next build.

## Run locally

Use Node.js 24. Run `npm ci`, then `npm run dev`. Run `npm run build` to generate the static site in `dist/`.

## Publish on GitHub Pages

Push the project to your GitHub repository on `main`. In **Settings → Pages**, choose **GitHub Actions** as the source. Run the **Deploy cookbook to GitHub Pages** workflow once from the Actions tab if the initial push preceded that settings change. Later changes to `main` deploy automatically.

The public site has no recipe editing interface. GitHub repository access controls who can publish. A public repository also exposes the source files and commit history.
