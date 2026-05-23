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

function walkExt(root: string, ext: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkExt(full, ext, rel));
    } else if (name.endsWith(ext)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Copy every .md file under `docsDir` into `outputDir` preserving the
 * subdirectory structure, write a `manifest.json` listing the .md files
 * with their titles + sizes (consumed by `DocsPage`'s sidebar), and ALSO
 * copy any `findings/*.json` files verbatim so the Overlays / Engineering
 * Notes pages can fetch them at `/docs/re/findings/<name>.json`.
 *
 * The findings JSONs are NOT included in the doc manifest — they're not
 * markdown, so the docs sidebar shouldn't try to render them. They're
 * served as static asset files for direct-fetch consumers.
 */
export function extractDocs(opts: ExtractDocsOpts): DocManifest {
  const entries: DocManifestEntry[] = [];
  const mdFiles = walkMd(opts.docsDir);
  for (const relPath of mdFiles) {
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
  // Findings JSONs — copy through to extracted/docs/ verbatim. Not in
  // the manifest; fetched directly by /explore/overlays pages.
  const jsonFiles = walkExt(opts.docsDir, '.json');
  for (const relPath of jsonFiles) {
    const src = join(opts.docsDir, relPath);
    const dst = join(opts.outputDir, relPath);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, readFileSync(src));
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const manifest: DocManifest = { entries };
  mkdirSync(opts.outputDir, { recursive: true });
  writeFileSync(join(opts.outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
