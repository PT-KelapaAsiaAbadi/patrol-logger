/**
 * Saves a generated file. Inside a published claude.ai artifact, normal download links are blocked,
 * so this uses the host's `downloads` capability when it exists. Anywhere else (your own hosting)
 * it falls back to the standard Blob + <a download> approach.
 */
interface DownloadsNs { save(req: { filename: string; data: string | Blob }): Promise<unknown> }
interface ClaudeHost { use(name: 'downloads'): Promise<DownloadsNs | null> }

let hostDownloads: Promise<DownloadsNs | null> | null = null;
function getHost(): Promise<DownloadsNs | null> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (!host) return Promise.resolve(null);
  return (hostDownloads ??= host.use('downloads').catch(() => null));
}

export async function saveFile(filename: string, data: string, mime: string): Promise<'saved' | 'declined'> {
  const host = await getHost();
  if (host) {
    try { await host.save({ filename, data }); return 'saved'; } catch { return 'declined'; }
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}
