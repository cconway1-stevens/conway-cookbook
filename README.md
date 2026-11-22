# The Conway Cookbook

A public, read-only family cookbook built with Astro. Each recipe is one file. Drop it in the folder and the site builds its page, search, filters, randomizer, menu builder, shopping list, and cook mode from it.

## Add a recipe

1. Copy `recipe-template.json` into `src/content/recipes/` and name it like `sunday-pot-roast.json`. The filename becomes the link.
2. Fill it in. Required: `title`, `description`, `category`, `time`, `servings`, `ingredients`, `steps`. Delete any other line you don't need.
   - `category` is a course: Breakfast, Appetizers, Soups & Salads, Mains, Sides, Breads, Desserts, or Drinks. A meal such as `Dinner` works too.
   - `meal` is any of Breakfast, Lunch, Dinner, Dessert. `cuisine` and `tags` are free text. A new one becomes a filter by itself.
   - `ingredients` is a list of lines, or of groups with a `group` name and `items`. `steps` is a list of text, or of a `title` and `text`.
   - `minutes` is the time as a number, for the "Ready in" filter.
3. For a photo, put it in `public/images/` and add `"image": "images/your-photo.jpg"` and `"imageAlt"`.
4. Commit to `main` to publish. You can do all of this on GitHub's website. If something is wrong, the build stops, names the file, and the live site stays as it was.

Markdown recipes (`.md`, with `## Ingredients` and numbered `## Directions`) also work.

## Change the site itself

`src/data/cookbook.json` holds the title, tagline, cover, meals, courses, menu sections, menu papers, themes, and read-aloud phrases. The build checks it and says what to fix.

The whole cookbook is also published as one index at `/cookbook.json`.

## Themes

Visitors pick a theme on the Settings page. **Blue Plate** is the default and **Heirloom** is the original look. To add one, copy a file in `src/themes/`, change the theme id inside it, and add it to `themes` in `src/data/cookbook.json`. `src/style.css` holds structure only.

## Easier to read

The round button in the corner opens reading help: text size, contrast, dyslexia-friendly fonts, a reading guide, less motion, and more. It is the open source [AccessibleWeb Widget](https://github.com/ifrederico/accessible-web-widget) (MIT), pinned to one version, and takes its colors from the theme. Its fonts are served from this site. It is a convenience for readers and does not make a site ADA or WCAG compliant by itself.

Animations live in `src/motion.css`. They stop for anyone whose device asks for reduced motion, and for "Stop Animations" in reading help.

## Sample recipes

Everything in `src/content/recipes/samples/` is filler. Delete the folder whenever you like. To keep one, move it up a folder; its link stays the same.

## Cook mode and the read-aloud voice

The GitHub deploy records each line with Kokoro, an open voice model, and publishes small MP3 files. It downloads the model inside GitHub's runner and calls no speech service. If recording fails, the site still deploys and a voice on the visitor's own device reads instead. `npm run narrate -- --list` prints every line it would record. Recording on your own computer needs `ffmpeg` and downloads the model (about 92 MB).

Voice commands run only where the browser can recognize speech on the device. Elsewhere the microphone stays off.

## Run locally

Use Node.js 24. Run `npm ci`, then `npm run dev`. Run `npm run build` to generate the static site in `dist/`.

## Publish on GitHub Pages

Push the project to your GitHub repository on `main`. In **Settings → Pages**, choose **GitHub Actions** as the source. Run the **Deploy cookbook to GitHub Pages** workflow once from the Actions tab if the initial push preceded that settings change. Later changes to `main` deploy automatically.

The public site has no recipe editing interface. GitHub repository access controls who can publish. A public repository also exposes the source files and commit history.
