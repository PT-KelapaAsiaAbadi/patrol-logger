// Bundles one app into a single self-contained HTML string.
// Shared by `npm run build` and `npm run build:demo`.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Local stylesheet links, with or without a self-closing slash. */
const stylesheetLink = /[ \t]*<link rel="stylesheet" href="((?:\.\.\/|styles\/)[^"]+)"\s*\/?>\n?/g;
const moduleEntry = '<script type="module" src="src/main.js"></script>';

/**
 * Markers that must not appear in an app's bundle. Each app is bundled from its
 * own entry point, so this is a guard against an import sneaking across the two
 * apps rather than a filter.
 */
const FORBIDDEN = {
  guard: [
    ['renderDashboard', 'dashboard code'],
    ['renderSetup', 'setup code'],
    ['seedDemoSite', 'demo code'],
  ],
  staff: [
    ['CheckpointScanner', 'guard scanner'],
    ['showGuardApp', 'guard screens'],
  ],
};

async function inlineStylesheets(app, html) {
  const appDir = join(root, 'apps', app);
  const files = [...html.matchAll(stylesheetLink)].map((match) => match[1]);
  const css = await Promise.all(files.map((file) => readFile(join(appDir, file), 'utf8')));
  return html.replace(stylesheetLink, '').replace('</head>', `<style>\n${css.join('\n')}\n</style>\n  </head>`);
}

async function bundle(app) {
  const result = await build({
    entryPoints: [join(root, 'apps', app, 'src', 'main.js')],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    write: false,
    legalComments: 'none',
  });
  return result.outputFiles[0].text;
}

function checkOutput(app, script) {
  const found = FORBIDDEN[app].filter(([marker]) => script.includes(marker));
  if (found.length) {
    const what = found.map(([, description]) => description).join(', ');
    throw new Error(`The ${app} bundle contains ${what}. The two apps must not import each other.`);
  }
}

/** @param {'guard' | 'staff'} app @returns {Promise<string>} */
export async function buildSingleFileApp(app) {
  const html = await readFile(join(root, 'apps', app, 'index.html'), 'utf8');
  if (!html.includes(moduleEntry)) throw new Error(`apps/${app}/index.html no longer contains ${moduleEntry}`);

  const script = await bundle(app);
  checkOutput(app, script);

  const withStyles = await inlineStylesheets(app, html);
  // A literal "</script" inside the bundle would end the inline script early.
  const safeScript = script.replace(/<\/script/gi, '<\\/script');
  return withStyles.replace(moduleEntry, () => `<script type="module">\n${safeScript}</script>`);
}
