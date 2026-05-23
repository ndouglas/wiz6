import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export interface ExtractDocsOpts {
  /** Repo-rooted absolute path to the docs directory (default: <repo>/docs). */
  docsDir: string;
  /** Output directory under extracted/ (default: extracted/docs). */
  outputDir: string;
}

export interface DocManifestEntry {
  /** Relative path within the docs tree (e.g. "re/pic.md"). */
  path: string;
  /** First-line title from the file (extracted from leading "# ..." heading). */
  title: string;
  /** File size in bytes. */
  bytes: number;
}

export interface DocManifest {
  entries: DocManifestEntry[];
}

function walkMd(root: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkMd(full, rel));
    } else if (name.endsWith('.md')) {
      out.push(rel);
    }
  }
  return out;
}

function extractTitle(content: string, fallback: string): string {
  for (const line of content.split('\n')) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) return m[1]!;
  }
  return fallback;
}

/**
 * Copy every .md file under `docsDir` into `outputDir` preserving the
 * subdirectory structure, and write a `manifest.json` listing all files
 * with their titles + sizes. The viewer fetches the manifest to render
 * a sidebar; clicks on entries fetch the corresponding .md.
 */
export function extractDocs(opts: ExtractDocsOpts): DocManifest {
  const entries: DocManifestEntry[] = [];
  const files = walkMd(opts.docsDir);
  for (const relPath of files) {
    const src = join(opts.docsDir, relPath);
    const dst = join(opts.outputDir, relPath);
    mkdirSync(dirname(dst), { recursive: true });
    const content = readFileSync(src, 'utf-8');
    writeFileSync(dst, content);
    entries.push({
      path: relPath,
      title: extractTitle(content, relative(opts.docsDir, src)),
      bytes: content.length,
    });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const manifest: DocManifest = { entries };
  mkdirSync(opts.outputDir, { recursive: true });
  writeFileSync(join(opts.outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
