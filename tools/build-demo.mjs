// Builds dist/patrol-demo.html: both apps in one file, for hosts that accept a
// single HTML file such as a Claude artifact.
//   npm run build:demo
//
// Each app is embedded as base64 and written into a blank iframe at runtime.
// A blank (about:blank) frame inherits this page's origin, so both apps share
// one storage area exactly as they do in development. A srcdoc frame would get
// an opaque origin instead, and the demo could not seed data in one app and use
// it in the other. Base64 also avoids escaping a whole document into markup.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildSingleFileApp, root } from './lib/build-app.mjs';

const SHELL_SCRIPT = '    <script>';

const shell = await readFile(join(root, 'dev', 'demo-shell', 'index.html'), 'utf8');
if (!shell.includes(SHELL_SCRIPT)) throw new Error('The demo shell no longer has an inline script');

let demo = shell;
const blocks = [];
for (const app of ['guard', 'staff']) {
  const src = ` src="../../apps/${app}/"`;
  if (!demo.includes(src)) throw new Error(`The demo shell no longer loads apps/${app}/ with${src}`);
  demo = demo.replace(src, '');
  const base64 = Buffer.from(await buildSingleFileApp(app), 'utf8').toString('base64');
  blocks.push(`    <script type="text/plain" id="inline-${app}">${base64}</script>`);
}

// The blocks go before the shell's script, which reads them as it loads.
demo = demo.replace(SHELL_SCRIPT, `${blocks.join('\n')}\n${SHELL_SCRIPT}`);

const output = join(root, 'dist', 'patrol-demo.html');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, demo);
console.log(`Wrote ${output} (${(demo.length / 1024).toFixed(0)} KB)`);
