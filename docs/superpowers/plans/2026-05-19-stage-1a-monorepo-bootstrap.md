# Stage 1a: Monorepo Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the pnpm monorepo skeleton from the design spec (`docs/superpowers/specs/2026-05-19-wiz6-webapp-design.md`) with three initial packages (`@wiz6/data`, `@wiz6/parser`, `@wiz6/viewer`), the engine-purity eslint rule, vitest wired up everywhere, and the DOS files moved into `original/`. No real parser logic yet — this stage produces a working, lintable, testable scaffold that subsequent stages will fill in.

**Architecture:** pnpm workspaces. Three packages: `@wiz6/data` (TypeScript types + zod schemas; no DOM, no Node-only imports), `@wiz6/parser` (Node CLI that will eventually read `original/` and write `extracted/`), `@wiz6/viewer` (Vite + React app — a developer-facing tool for browsing extracted assets; this is a small spec extension flagged at plan-introduction time). Each package has its own tsconfig and vitest config; root has shared base configs and a flat eslint config. The engine-purity rule is implemented as a `no-restricted-imports` constraint applied to `@wiz6/data` now (and to `@wiz6/engine` later, when that package exists).

**Tech Stack:** TypeScript 5.x, pnpm via corepack, vitest, zod, eslint 9 (flat config), Vite 6 + React 18 (viewer).

---

## File Structure

After this stage the repo looks like:

```
/
├── .gitignore                           (modified — DOS-file patterns removed since files moved)
├── .nvmrc                               (new)
├── .npmrc                               (new)
├── package.json                         (new — workspace root)
├── pnpm-workspace.yaml                  (new)
├── tsconfig.base.json                   (new)
├── eslint.config.mjs                    (new)
├── original/                            (new — all DOS files moved here)
│   ├── wroot.exe
│   ├── *.ovr
│   ├── *.dbs
│   ├── *.pic
│   └── ...
├── packages/
│   ├── data/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── schemas/manifest.ts
│   │   └── tests/
│   │       └── manifest.test.ts
│   ├── parser/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── cli.ts
│   │   └── tests/
│   │       └── cli.test.ts
│   └── viewer/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── vitest.config.ts
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   └── App.tsx
│       └── tests/
│           └── App.test.tsx
└── docs/                                (existing)
```

**File responsibilities:**

- `tsconfig.base.json` — shared TS compiler options (strict, ESM, NodeNext, target ES2022). Per-package tsconfigs extend it.
- `eslint.config.mjs` — flat config. Base rules for all TS files; overrides apply the `no-restricted-imports` engine-purity rule to `packages/data/**`.
- `@wiz6/data/src/schemas/manifest.ts` — first concrete zod schema, `ManifestSchema`, for the extraction manifest. Tiny but real; gives us something to test.
- `@wiz6/parser/src/cli.ts` — CLI entry stub. Reads `original/` path from argv, prints what it *would* do. Imports the `Manifest` type from `@wiz6/data` to prove cross-package wiring.
- `@wiz6/viewer/src/App.tsx` — React stub that renders a "Wiz6 Viewer" placeholder. Will be filled in subsequent stages.

---

## Task 1: Move DOS files into `original/` and clean up `.gitignore`

**Files:**
- Create directory: `original/`
- Move: 150-ish DOS files from repo root into `original/`
- Modify: `.gitignore` (remove rooted per-extension patterns now that files live in `/original/`, which is already ignored)

- [ ] **Step 1: Verify current state**

Run from repo root:

```bash
ls *.exe *.ovr *.dbs *.pic 2>&1 | head
ls -d original 2>&1 || echo "no original dir yet"
```

Expected: list of DOS files; `no original dir yet`.

- [ ] **Step 2: Create `original/` and move all DOS files into it**

Run from repo root:

```bash
mkdir -p original
mv *.bat *.com *.drv *.exe *.hdr *.dbs *.ovr *.pic *.cga *.ega *.t16 *.snd *.pif mo_info.txt original/
ls original/ | wc -l
ls *.exe 2>&1 || echo "root is clean"
```

Expected: count is ~150; "root is clean".

- [ ] **Step 3: Simplify `.gitignore`** — remove the rooted per-extension patterns since `/original/` is already ignored

Open `.gitignore` and replace its current "Original Wizardry VI DOS files" block (the `/*.bat` through `/mo_info.txt` lines) with a single comment line. The full new `.gitignore`:

```gitignore
# Project layout
/original/
/extracted/
/.superpowers/

# Build artifacts
node_modules/
dist/
build/
*.tsbuildinfo

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/

# Original Wizardry VI DOS files now live in /original/ (ignored above).
```

- [ ] **Step 4: Confirm git sees no DOS files as untracked**

Run:

```bash
git status --short
```

Expected: only `.gitignore` shows as modified. No untracked DOS files.

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: move DOS files into original/ and simplify .gitignore"
```

---

## Task 2: Pin Node version and enable pnpm via corepack

**Files:**
- Create: `.nvmrc`
- Create: `.npmrc`

- [ ] **Step 1: Pin Node to LTS**

Create `.nvmrc`:

```
20
```

- [ ] **Step 2: Configure pnpm via `.npmrc`**

Create `.npmrc`:

```
auto-install-peers=true
node-linker=isolated
```

(Defaults are fine for most things; we set `auto-install-peers` because peer-dep prompts are noise, and we make `node-linker` explicit so future engineers don't second-guess it.)

- [ ] **Step 3: Enable corepack and prepare pnpm**

Run:

```bash
corepack enable
corepack prepare pnpm@9 --activate
pnpm --version
```

Expected: a version string starting with `9.`.

- [ ] **Step 4: Commit**

```bash
git add .nvmrc .npmrc
git commit -m "chore: pin node 20 and enable pnpm via corepack"
```

---

## Task 3: Create root `package.json` and pnpm workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "wiz6",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "lint": "eslint .",
    "test": "pnpm -r --filter './packages/*' test",
    "build": "pnpm -r --filter './packages/*' build",
    "typecheck": "pnpm -r --filter './packages/*' typecheck"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "eslint": "^9.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.2",
    "typescript-eslint": "^8.5.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
pnpm install
```

Expected: no errors; `node_modules/` created at root.

- [ ] **Step 4: Verify lockfile exists and is ignored correctly**

Run:

```bash
ls pnpm-lock.yaml
git status --short
```

Expected: `pnpm-lock.yaml` exists; `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` show as untracked.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: scaffold pnpm workspace root"
```

---

## Task 4: Create `tsconfig.base.json`

**Files:**
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create the shared TS config**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore: add shared tsconfig.base.json"
```

---

## Task 5: Create flat ESLint config

**Files:**
- Create: `eslint.config.mjs`

- [ ] **Step 1: Create the flat config**

```js
// eslint.config.mjs
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/node_modules/**', 'original/**', 'extracted/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
```

- [ ] **Step 2: Run lint on an empty tree (should succeed trivially)**

Run:

```bash
pnpm lint
```

Expected: no errors (nothing to lint yet).

- [ ] **Step 3: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore: add flat eslint config"
```

---

## Task 6: Scaffold `@wiz6/data` package with TDD

**Files:**
- Create: `packages/data/package.json`
- Create: `packages/data/tsconfig.json`
- Create: `packages/data/vitest.config.ts`
- Create: `packages/data/src/index.ts`
- Create: `packages/data/src/schemas/manifest.ts`
- Create: `packages/data/tests/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ManifestSchema, type Manifest } from '../src/index.js';

describe('ManifestSchema', () => {
  it('accepts a valid manifest', () => {
    const valid: Manifest = {
      schemaVersion: 1,
      generatedAt: '2026-05-19T00:00:00Z',
      sourceChecksum: 'abc123',
      assets: [],
    };
    expect(() => ManifestSchema.parse(valid)).not.toThrow();
  });

  it('rejects a manifest missing schemaVersion', () => {
    const invalid = {
      generatedAt: '2026-05-19T00:00:00Z',
      sourceChecksum: 'abc123',
      assets: [],
    };
    expect(() => ManifestSchema.parse(invalid)).toThrow();
  });
});
```

- [ ] **Step 2: Create the package scaffold**

Create `packages/data/package.json`:

```json
{
  "name": "@wiz6/data",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

Create `packages/data/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

Create `packages/data/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Install deps**

Run:

```bash
pnpm install
```

Expected: zod and vitest installed in `packages/data/`.

- [ ] **Step 4: Run the test (should fail — no schema yet)**

Run:

```bash
pnpm --filter @wiz6/data test
```

Expected: FAIL with module-not-found error for `../src/index.js`.

- [ ] **Step 5: Implement the schema**

Create `packages/data/src/schemas/manifest.ts`:

```ts
import { z } from 'zod';

export const ManifestAssetSchema = z.object({
  kind: z.string(),
  id: z.string(),
  path: z.string(),
  sourceFile: z.string(),
  sourceOffset: z.number().int().nonnegative().optional(),
  sourceLength: z.number().int().nonnegative().optional(),
});

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  sourceChecksum: z.string(),
  assets: z.array(ManifestAssetSchema),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestAsset = z.infer<typeof ManifestAssetSchema>;
```

Create `packages/data/src/index.ts`:

```ts
export {
  ManifestSchema,
  ManifestAssetSchema,
  type Manifest,
  type ManifestAsset,
} from './schemas/manifest.js';
```

- [ ] **Step 6: Run the test (should pass now)**

Run:

```bash
pnpm --filter @wiz6/data test
```

Expected: 2 tests pass.

- [ ] **Step 7: Run typecheck and lint**

Run:

```bash
pnpm --filter @wiz6/data typecheck
pnpm lint
```

Expected: both succeed.

- [ ] **Step 8: Commit**

```bash
git add packages/data pnpm-lock.yaml
git commit -m "feat(data): scaffold @wiz6/data with ManifestSchema"
```

---

## Task 7: Scaffold `@wiz6/parser` package with TDD

**Files:**
- Create: `packages/parser/package.json`
- Create: `packages/parser/tsconfig.json`
- Create: `packages/parser/vitest.config.ts`
- Create: `packages/parser/src/index.ts`
- Create: `packages/parser/src/cli.ts`
- Create: `packages/parser/tests/cli.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/parser/tests/cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describePlan, type Plan } from '../src/index.js';

describe('describePlan', () => {
  it('returns a Plan describing what would be parsed for a given originalDir', () => {
    const plan: Plan = describePlan({ originalDir: '/path/to/original' });
    expect(plan.originalDir).toBe('/path/to/original');
    expect(plan.schemaVersion).toBe(1);
    expect(Array.isArray(plan.steps)).toBe(true);
  });
});
```

- [ ] **Step 2: Create the package scaffold**

Create `packages/parser/package.json`:

```json
{
  "name": "@wiz6/parser",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "bin": {
    "wiz6-parse": "./src/cli.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": {
    "@wiz6/data": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "vitest": "^2.1.0"
  }
}
```

Create `packages/parser/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

Create `packages/parser/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Install deps**

Run:

```bash
pnpm install
```

Expected: workspace link to `@wiz6/data` created.

- [ ] **Step 4: Run the test (should fail)**

Run:

```bash
pnpm --filter @wiz6/parser test
```

Expected: FAIL with module-not-found error for `../src/index.js`.

- [ ] **Step 5: Implement minimal `describePlan` and CLI stub**

Create `packages/parser/src/index.ts`:

```ts
import type { Manifest } from '@wiz6/data';

export interface Plan {
  originalDir: string;
  schemaVersion: Manifest['schemaVersion'];
  steps: string[];
}

export function describePlan(opts: { originalDir: string }): Plan {
  return {
    originalDir: opts.originalDir,
    schemaVersion: 1,
    steps: [],
  };
}
```

Create `packages/parser/src/cli.ts`:

```ts
#!/usr/bin/env node
import { describePlan } from './index.js';

const originalDir = process.argv[2] ?? './original';
const plan = describePlan({ originalDir });
console.log(JSON.stringify(plan, null, 2));
```

- [ ] **Step 6: Run the test (should pass)**

Run:

```bash
pnpm --filter @wiz6/parser test
```

Expected: 1 test passes.

- [ ] **Step 7: Smoke-run the CLI**

Run:

```bash
pnpm exec tsx packages/parser/src/cli.ts ./original
```

Expected: prints JSON `{ "originalDir": "./original", "schemaVersion": 1, "steps": [] }`.

- [ ] **Step 8: Typecheck + lint**

Run:

```bash
pnpm --filter @wiz6/parser typecheck
pnpm lint
```

Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add packages/parser pnpm-lock.yaml
git commit -m "feat(parser): scaffold @wiz6/parser with describePlan + CLI stub"
```

---

## Task 8: Scaffold `@wiz6/viewer` (Vite + React)

**Files:**
- Create: `packages/viewer/package.json`
- Create: `packages/viewer/tsconfig.json`
- Create: `packages/viewer/vite.config.ts`
- Create: `packages/viewer/vitest.config.ts`
- Create: `packages/viewer/index.html`
- Create: `packages/viewer/src/main.tsx`
- Create: `packages/viewer/src/App.tsx`
- Create: `packages/viewer/tests/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/App.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App.js';

describe('App', () => {
  it('renders the viewer heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /wiz6 viewer/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Create package scaffold**

Create `packages/viewer/package.json`:

```json
{
  "name": "@wiz6/viewer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@wiz6/data": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "vite": "^5.4.6",
    "vitest": "^2.1.0"
  }
}
```

Create `packages/viewer/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src/**/*"]
}
```

Create `packages/viewer/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

Create `packages/viewer/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.tsx'],
  },
});
```

Create `packages/viewer/tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Create `packages/viewer/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Wiz6 Viewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Install deps**

Run:

```bash
pnpm install
```

Expected: dependencies installed.

- [ ] **Step 4: Run the test (should fail)**

Run:

```bash
pnpm --filter @wiz6/viewer test
```

Expected: FAIL with module-not-found for `../src/App.js`.

- [ ] **Step 5: Implement App + entry**

Create `packages/viewer/src/App.tsx`:

```tsx
export function App() {
  return (
    <main>
      <h1>Wiz6 Viewer</h1>
      <p>Stage 1a scaffold. Real content lands in Stage 1b+.</p>
    </main>
  );
}
```

Create `packages/viewer/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Run the test (should pass)**

Run:

```bash
pnpm --filter @wiz6/viewer test
```

Expected: 1 test passes.

- [ ] **Step 7: Verify the viewer builds**

Run:

```bash
pnpm --filter @wiz6/viewer build
```

Expected: build succeeds, `packages/viewer/dist/` created.

- [ ] **Step 8: Typecheck + lint**

Run:

```bash
pnpm --filter @wiz6/viewer typecheck
pnpm lint
```

Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add packages/viewer pnpm-lock.yaml
git commit -m "feat(viewer): scaffold @wiz6/viewer Vite + React skeleton"
```

---

## Task 9: Add engine-purity ESLint rule for `@wiz6/data`

**Files:**
- Modify: `eslint.config.mjs`
- Create: `packages/data/tests/purity.test.ts`

The rule we want: any file under `packages/data/**` must not import from Node-only modules (`fs`, `path`, `node:*`, etc.) or DOM globals. This is the same rule that will later apply to `@wiz6/engine`.

- [ ] **Step 1: Write a failing purity test**

Create `packages/data/tests/purity.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('engine-purity eslint rule', () => {
  it('flags Node-only imports inside packages/data/src/**', () => {
    const repoRoot = join(import.meta.dirname, '..', '..', '..');
    const probePath = join(repoRoot, 'packages/data/src/__purity_probe.ts');
    writeFileSync(probePath, "import { readFileSync } from 'node:fs';\nconsole.log(readFileSync);\n");
    try {
      let output = '';
      try {
        execSync(`pnpm exec eslint ${probePath}`, { cwd: repoRoot, encoding: 'utf8' });
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        output = (e.stdout ?? '') + (e.stderr ?? '');
      }
      expect(output).toMatch(/no-restricted-imports/);
    } finally {
      rmSync(probePath, { force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test (should fail — no rule yet)**

Run:

```bash
pnpm --filter @wiz6/data test
```

Expected: FAIL — the lint output doesn't contain `no-restricted-imports`.

- [ ] **Step 3: Add the rule to `eslint.config.mjs`**

Append to `eslint.config.mjs` (after the existing rules block):

```js
  {
    // Engine-purity rule: @wiz6/data source must not import Node-only modules.
    // Scoped to src/ so tests (which legitimately use node:child_process, node:fs, etc.) are unaffected.
    files: ['packages/data/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['node:*'], message: '@wiz6/data must remain Node-free (engine-purity rule).' },
          { group: ['fs', 'path', 'os', 'child_process', 'crypto', 'http', 'https', 'net', 'stream', 'url', 'util', 'worker_threads'], message: '@wiz6/data must remain Node-free (engine-purity rule).' },
        ],
      }],
    },
  },
```

- [ ] **Step 4: Run the test (should pass)**

Run:

```bash
pnpm --filter @wiz6/data test
```

Expected: PASS — lint output now mentions `no-restricted-imports`.

- [ ] **Step 5: Run full lint (should still be clean — no real violations)**

Run:

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs packages/data/tests/purity.test.ts
git commit -m "feat(lint): enforce engine purity on @wiz6/data"
```

---

## Task 10: Wire up cross-cutting scripts and verify

**Files:**
- Modify: `package.json` (root) — add `verify` script
- Create: `docs/re/.gitkeep` (placeholder so the docs/re directory exists in git from Stage 1a forward)

- [ ] **Step 1: Add the `verify` script to root `package.json`**

Modify the `scripts` block of `package.json` (root) to:

```json
  "scripts": {
    "lint": "eslint .",
    "test": "pnpm -r --filter './packages/*' test",
    "build": "pnpm -r --filter './packages/*' build",
    "typecheck": "pnpm -r --filter './packages/*' typecheck",
    "verify": "pnpm lint && pnpm typecheck && pnpm test"
  },
```

- [ ] **Step 2: Create `docs/re/.gitkeep`**

```bash
touch docs/re/.gitkeep
```

- [ ] **Step 3: Run the full verify**

Run:

```bash
pnpm verify
```

Expected: lint passes, all packages typecheck, all tests pass across all three packages.

- [ ] **Step 4: Commit**

```bash
git add package.json docs/re/.gitkeep
git commit -m "chore: add pnpm verify script and reserve docs/re/"
```

---

## Stage Completion Checklist

After Task 10 completes, the following should all be true:

- [ ] `original/` contains all the DOS files; repo root has no game-data files
- [ ] `pnpm install` works from a clean checkout
- [ ] `pnpm verify` passes (lint + typecheck + test across `@wiz6/data`, `@wiz6/parser`, `@wiz6/viewer`)
- [ ] `pnpm --filter @wiz6/viewer dev` serves the placeholder page (manual check: visit the URL it prints, see "Wiz6 Viewer" heading)
- [ ] `@wiz6/parser` CLI runs and prints a plan JSON given a directory argument
- [ ] Writing `import { readFileSync } from 'node:fs'` anywhere in `packages/data/src/**` fails `pnpm lint` with a `no-restricted-imports` error

When all green, this stage is complete and Stage 1b (first format parser: titlepage EGA image, with format documentation in `docs/re/`) is ready to plan.
