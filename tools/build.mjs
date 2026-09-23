// Builds dist/guard/index.html and dist/staff/index.html: one self-contained
// file per app, each bundled from its own entry point so it cannot contain the
// other app's code.
//   npm run build
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildSingleFileApp, root } from './lib/build-app.mjs';

for (const app of ['guard', 'staff']) {
  const html = await buildSingleFileApp(app);
  const output = join(root, 'dist', app, 'index.html');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
  console.log(`Wrote ${output} (${(html.length / 1024).toFixed(0)} KB)`);
}
