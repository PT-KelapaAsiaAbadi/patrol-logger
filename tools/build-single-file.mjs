// Builds dist/patrol-prototype.html: one self-contained file with all CSS and JavaScript inlined.
// Used for hosts that accept a single HTML file, such as a Claude artifact.
//   npm run build
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist', 'patrol-prototype.html');

// Matches local stylesheet links, with or without a self-closing slash.
const stylesheetLink = /<link rel="stylesheet" href="(css\/[^"]+)"\s*\/?>\s*/g;
const moduleEntry = '<script type="module" src="js/main.js"></script>';

async function inlineStylesheets(html) {
  const files = [...html.matchAll(stylesheetLink)].map((match) => match[1]);
  const css = await Promise.all(files.map((file) => readFile(join(root, file), 'utf8')));
  const withoutLinks = html.replace(stylesheetLink, '');
  return withoutLinks.replace('</head>', `<style>\n${css.join('\n')}\n</style>\n</head>`);
}

async function bundleScripts() {
  const result = await build({
    entryPoints: [join(root, 'js', 'main.js')],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: false,
    write: false,
    legalComments: 'none',
  });
  // A literal "</script" inside the bundle would end the inline script early.
  return result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

const html = await readFile(join(root, 'index.html'), 'utf8');
if (!html.includes(moduleEntry)) throw new Error(`index.html no longer contains ${moduleEntry}`);

const withStyles = await inlineStylesheets(html);
const script = await bundleScripts();
const single = withStyles.replace(moduleEntry, () => `<script type="module">\n${script}</script>`);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, single);
console.log(`Wrote ${output} (${(single.length / 1024).toFixed(0)} KB)`);
