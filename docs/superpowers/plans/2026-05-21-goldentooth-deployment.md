# Wiz6 Goldentooth Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the wiz6 viewer to `https://wiz6.goldentooth.net`. Two phases: containerize the viewer (build via GitHub Actions, push to `ghcr.io/ndouglas/wiz6`) then deploy to the goldentooth Kubernetes cluster via Flux GitOps (`apps/wiz6/`).

**Architecture:**
- Multi-stage Dockerfile: pnpm install → run extractors against committed `original/` → build `packages/viewer/dist/` → final stage is nginx serving the static bundle with SPA fallback.
- GitHub Actions builds on every push to `main`, tags image with both `:latest` and `:<sha>`, pushes to ghcr.io via the built-in `GITHUB_TOKEN` (no PAT needed for pushing inside the repo).
- Cluster pulls the private image via a Kubernetes Secret (PAT with `read:packages` scope, SOPS-encrypted alongside the manifests).
- Ingress via the existing `goldentooth` Gateway in the `gateway` namespace — wiz6 just creates an `HTTPRoute` with hostname `wiz6.goldentooth.net`. external-dns populates DNS automatically; TLS is handled at the Gateway via cert-manager.

**Tech Stack:** Docker, GitHub Actions, nginx:alpine runtime, Kubernetes (Gateway API, kustomize via Flux), SOPS + Age for secret encryption. The wiz6 monorepo already builds via pnpm + tsx (no infra changes needed there).

**Out of scope (deferred):**
- LAN-only / Tailscale-only access modes — going straight to the public subdomain
- Multi-replica or HPA — single nginx replica is fine for a static-asset site
- Custom 404 page — SPA fallback covers all unmatched routes
- Per-environment configs (staging, prod) — there's one cluster

---

## Pre-flight

This plan spans two git repos:
- `~/Projects/ndouglas/wiz6` (private; the viewer source + image build)
- `~/Projects/goldentooth/gitops` (the cluster GitOps repo)

The Phase A tasks use a worktree off the wiz6 repo (consistent with prior stages). Phase B tasks edit the goldentooth/gitops repo directly.

### Manual setup before the executing agent starts

These are user-side prerequisites that can't be automated:

- [ ] **You must generate a GitHub PAT before Phase B begins.** Go to https://github.com/settings/tokens (classic). Scopes: `read:packages` only (or `read:packages` + `repo` if the image package inherits private visibility from a private repo — generally `read:packages` alone is enough for ghcr). Generate, copy the token, and export it in your shell:

```bash
export WIZ6_GHCR_PAT='<paste-the-pat-here>'
```

Keep this shell session open until Phase B Task B5 finishes encrypting the secret. The PAT must never appear in the transcript or committed files; it goes through `$WIZ6_GHCR_PAT` to a `kubectl create secret docker-registry --dry-run=client` command, then immediately into SOPS.

- [ ] **Verify SOPS is installed.**

```bash
which sops && sops --version
```

Expected: SOPS 3.x. If missing: `brew install sops`.

- [ ] **Verify kubectl is configured against the goldentooth cluster** (needed for the secret-creation dry-run in Task B5; the cluster doesn't actually need to be reachable since we only use `--dry-run=client`):

```bash
which kubectl
```

Expected: kubectl present. If missing: `brew install kubectl`.

---

# Phase A — Containerize wiz6

Worktree at `~/.config/superpowers/worktrees/wiz6/stage-deploy/`. All Phase A tasks operate inside this worktree.

## Pre-flight (Phase A)

- [ ] **Set up worktree on the latest `main`**

```bash
cd ~/Projects/ndouglas/wiz6
git worktree add ~/.config/superpowers/worktrees/wiz6/stage-deploy -b stage-deploy
cd ~/.config/superpowers/worktrees/wiz6/stage-deploy
pnpm install --frozen-lockfile
```

Expected: worktree created, install succeeds.

- [ ] **Run baseline tests to confirm starting state**

```bash
pnpm -r test
```

Expected: 82 data + 90 parser + 41 cli + 199 viewer = 412 tests passing.

---

## Task A1: Commit `original/` to the repo

The wiz6 repo currently `.gitignore`s `original/` (the actual Wiz6 game files). Since the repo is private and the Dockerfile needs those bytes to run extractors at build time, we commit them.

**Files:**
- Modify: `.gitignore` (remove `original` line)
- Add: `original/` directory contents

- [ ] **Step 1: Inspect the current .gitignore**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-deploy
cat .gitignore
```

Note which line(s) ignore `original/`. Likely just `original/` or `/original` on a line by itself.

- [ ] **Step 2: Remove the `original` ignore rule**

Edit `.gitignore` — delete the line that ignores `original/` (and only that line; preserve everything else, especially `node_modules`, `dist`, `extracted`).

- [ ] **Step 3: Verify the original files exist locally**

```bash
ls original/ | head -10
du -sh original/
```

Expected: at minimum `scenario.dbs`, `newgame.dbs`, `msg.dbs`, `wfont*.ega`, `wport*.ega`, screen `.ega` files, plus `misc.hdr` and `msg.hdr` (the Huffman tree files). Total size likely < 5 MB.

If `original/` is empty or missing files, STOP and report — the worktree's `original/` symlink (created in earlier stages) may need refreshing, or files need copying from elsewhere.

- [ ] **Step 4: Add and commit**

```bash
git add .gitignore original/
git status --short
```

Verify the staged files look right (just `.gitignore` + the files under `original/`).

```bash
git commit -m "feat: commit original/ game files for containerized builds

The repo is private; committing the Wizardry VI source bytes so the
Dockerfile can run extractors at build time without needing an
out-of-band file copy."
```

- [ ] **Step 5: Verify the commit**

```bash
git log -1 --stat | head -20
```

Expected: a single commit listing `.gitignore` + every file in `original/`.

---

## Task A2: nginx configuration

Static-asset serving with SPA fallback. One file.

**Files:**
- Create: `docker/nginx.conf`

- [ ] **Step 1: Create the docker/ directory**

```bash
mkdir -p docker
```

- [ ] **Step 2: Write `docker/nginx.conf`**

Content:

```nginx
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  # Gzip the small bundles + JSON data files
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
  gzip_min_length 1024;

  # SPA fallback: any path that doesn't match a real file falls back to
  # index.html so React Router (BrowserRouter) can handle the route.
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Hash-named assets get long-cache headers; SPA index never caches.
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  location = /index.html {
    add_header Cache-Control "no-store, no-cache, must-revalidate";
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add docker/nginx.conf
git commit -m "feat(deploy): nginx config with SPA fallback + asset caching"
```

---

## Task A3: Dockerfile + .dockerignore

Multi-stage build. Stage 1 runs the extractors and Vite build; Stage 2 is nginx serving the static bundle.

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Write `.dockerignore`**

Keep the build context small. Crucially, do NOT exclude `original/` — the build needs it. Exclude `extracted/` since the build regenerates it inside the container.

```
.git
.github
.claude
.config
.cache

node_modules
**/node_modules

# Build outputs — regenerated inside the container
extracted
**/dist

# Local-only artifacts
*.log
.DS_Store
docs
.worktrees
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

# --- Stage 1: builder ----------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm via corepack and pin to the version in package.json
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy the whole repo. The .dockerignore keeps the context small.
COPY . .

# Install deps. Use frozen-lockfile to ensure deterministic builds.
RUN pnpm install --frozen-lockfile

# Run extractors. Requires original/ to be committed (see Task A1).
RUN pnpm wiz6 extract --all

# Build the viewer. Vite's publicDir is set to ./extracted at the repo
# root, so the build output already includes the extracted JSON files
# under dist/.
RUN pnpm --filter @wiz6/viewer build

# --- Stage 2: runtime ----------------------------------------------------
FROM nginx:alpine AS runtime

# Replace the default site config with our SPA config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built static bundle (includes extracted JSONs via Vite publicDir)
COPY --from=builder /app/packages/viewer/dist /usr/share/nginx/html

EXPOSE 80

# Use nginx's default CMD
```

- [ ] **Step 3: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat(deploy): multi-stage Dockerfile (extractor → vite build → nginx)"
```

---

## Task A4: GitHub Actions workflow

Build on every push to `main`, push to `ghcr.io/ndouglas/wiz6` tagged with both `:latest` and `:<sha>`.

**Files:**
- Create: `.github/workflows/build-image.yml`

- [ ] **Step 1: Create the workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write `.github/workflows/build-image.yml`**

```yaml
name: build-image

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract image metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,format=long

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-image.yml
git commit -m "feat(deploy): GitHub Actions workflow building image to ghcr.io"
```

---

## Task A5: Local smoke test

Build the image on the developer's machine and verify it serves the site.

**Files:** none (verification only)

- [ ] **Step 1: Build the image**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-deploy
docker build -t wiz6-viewer:smoke .
```

Expected: build completes successfully. Builder stage runs extractors (~5-10s), Vite build (~5-10s), then assembles the runtime image. Final image size should be ~30-50 MB (nginx:alpine + the dist bundle).

If the build fails:
- "missing original/scenario.dbs" or similar — Task A1 didn't actually commit the files. Stop and report.
- pnpm version mismatch — pin to the version in `package.json`'s `packageManager` field. If the Dockerfile pins 9.12.0 but `package.json` has a different version, update the Dockerfile to match.
- "extract failed: HTTP 500" or similar — the extractor is throwing. Run `pnpm wiz6 extract --all` locally to see the error.

- [ ] **Step 2: Run the container and smoke-test it**

```bash
docker run --rm -d --name wiz6-smoke -p 18080:80 wiz6-viewer:smoke
# Wait a beat for nginx to start
sleep 1
# Fetch the index
curl -fsS http://localhost:18080/ | grep -q '<div id="root">' && echo "root present" || echo "root MISSING"
# Fetch a deep-link path → should still serve index.html (SPA fallback)
curl -fsS http://localhost:18080/monsters/giant-rat | grep -q '<div id="root">' && echo "spa fallback works" || echo "spa fallback BROKEN"
# Fetch the scenario data
curl -fsS -o /dev/null -w "scenario.json: %{http_code} %{size_download} bytes\n" http://localhost:18080/scenario/scenario.json
docker stop wiz6-smoke
```

Expected output:
```
root present
spa fallback works
scenario.json: 200 NNNNN bytes
```

`NNNNN` should be ~2.3 MB (uncompressed JSON). If nginx is serving gzip, may show smaller.

- [ ] **Step 3: No commit (verification only)**

If everything passed, move on. If anything failed, fix the underlying issue (likely in the Dockerfile or nginx.conf) and re-run.

---

## Task A6: Merge worktree to main and push to GitHub

Push the new branch's commits onto `main` so GitHub Actions runs the first build.

- [ ] **Step 1: Run the full test suite from the worktree one more time**

```bash
cd ~/.config/superpowers/worktrees/wiz6/stage-deploy
pnpm -r test
```

Expected: 412 tests pass. None of the deploy changes should have touched code.

- [ ] **Step 2: Switch to main and merge**

```bash
cd ~/Projects/ndouglas/wiz6
git checkout main
git merge stage-deploy --no-ff -m "Merge: containerize wiz6 viewer for goldentooth deployment

Multi-stage Dockerfile (extractor → vite build → nginx), nginx config
with SPA fallback, GitHub Actions workflow building to ghcr.io. The
original/ game files are now committed (private repo)."
```

Expected: clean merge.

- [ ] **Step 3: Verify tests on main**

```bash
pnpm -r test
```

Expected: 412 tests pass.

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```

Expected: push succeeds. Note any output about the GitHub repo URL — confirms the actual remote is `github.com:ndouglas/wiz6` (or whatever).

- [ ] **Step 5: Clean up worktree + branch**

```bash
git worktree remove --force ~/.config/superpowers/worktrees/wiz6/stage-deploy
git worktree prune
git branch -d stage-deploy
```

---

## Task A7: Verify the image is built and published

After Task A6's push, GitHub Actions runs `build-image.yml`. Wait for it to complete and confirm the image is at ghcr.io.

- [ ] **Step 1: Wait for the workflow run**

```bash
gh run list --workflow=build-image.yml --limit 1
```

If `gh` is not installed: `brew install gh` and `gh auth login` first. Or check at https://github.com/<owner>/wiz6/actions in the browser.

Expected: a row showing the most recent run, status `queued` → `in_progress` → `completed` with `conclusion: success`.

If it's still queued/in_progress, poll:

```bash
gh run watch <run-id> --exit-status
```

Expected on success: exit 0.

- [ ] **Step 2: Verify the image exists at ghcr.io**

```bash
gh api /user/packages/container/wiz6/versions --jq '.[0:3] | .[] | {id, name, metadata: {container: {tags: .metadata.container.tags}}}'
```

Expected: at least one version with tags including `latest` and `sha-<commit>`.

If `gh api` doesn't work, browse to https://github.com/users/<owner>/packages/container/package/wiz6.

- [ ] **Step 3: Note the exact tag for Phase B**

The Kubernetes deployment in Phase B should reference a specific tag, not `:latest`, so the cluster doesn't pull a different version on restart. Capture the SHA-based tag:

```bash
gh api /user/packages/container/wiz6/versions --jq '.[0].metadata.container.tags[]' | grep '^sha-'
```

Expected: `sha-<40-hex-chars>`. Write it down — Phase B Task B2 references it.

---

# Phase B — Deploy to goldentooth

All Phase B tasks operate in `~/Projects/goldentooth/gitops`. This is a different git repo than wiz6 — no worktree pattern; edit directly and push.

## Pre-flight (Phase B)

- [ ] **Verify the manual prerequisites are met** (from the Pre-flight section above):
  - `$WIZ6_GHCR_PAT` is set in your shell
  - `sops --version` shows 3.x
  - `kubectl version --client` shows a recent version

- [ ] **Cd into the gitops repo and verify you're on `main`**

```bash
cd ~/Projects/goldentooth/gitops
git status
git pull
```

Expected: on `main`, clean tree, up to date with origin.

- [ ] **Verify SOPS .sops.yaml is readable**

```bash
cat .sops.yaml
```

Expected: Age recipient `age179hfp3n7e42d2fazj09tvjjxpav6ztr3z98g0hwaxpunyfd7rcnqcv0x27` (or whatever the current key is). Note the recipient — needed for encryption.

---

## Task B1: namespace.yaml

**Files:**
- Create: `apps/wiz6/namespace.yaml`

- [ ] **Step 1: Create the directory**

```bash
cd ~/Projects/goldentooth/gitops
mkdir -p apps/wiz6
```

- [ ] **Step 2: Write namespace.yaml**

```yaml
---
apiVersion: v1
kind: Namespace
metadata:
  name: wiz6
```

---

## Task B2: deployment.yaml

Single-replica nginx deployment pulling from ghcr.io. References the image-pull secret from Task B5 (created later but the deployment can reference it by name; Flux ordering doesn't require the secret to exist first since the cluster's reconciliation will retry).

**Files:**
- Create: `apps/wiz6/deployment.yaml`

- [ ] **Step 1: Write deployment.yaml**

Use the exact `sha-<...>` tag from Phase A Task A7 Step 3 (NOT `:latest` — pinning means restarts don't accidentally pull a different image).

```yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wiz6
  namespace: wiz6
spec:
  replicas: 1
  selector:
    matchLabels:
      app: wiz6
  template:
    metadata:
      labels:
        app: wiz6
    spec:
      imagePullSecrets:
        - name: ghcr-pull
      containers:
        - name: viewer
          # Replace <sha> with the actual tag from Phase A Task A7 Step 3.
          image: ghcr.io/ndouglas/wiz6:sha-<sha>
          ports:
            - name: http
              containerPort: 80
              protocol: TCP
          resources:
            requests:
              cpu: 50m
              memory: 32Mi
            limits:
              cpu: 200m
              memory: 128Mi
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 5
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 1
            periodSeconds: 5
```

REPLACE the `<sha>` placeholder. The string must match exactly what GitHub Container Registry has tagged (e.g., `sha-abc123def456...`).

---

## Task B3: service.yaml

**Files:**
- Create: `apps/wiz6/service.yaml`

- [ ] **Step 1: Write service.yaml**

```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: wiz6
  namespace: wiz6
spec:
  type: ClusterIP
  selector:
    app: wiz6
  ports:
    - name: http
      port: 80
      targetPort: http
      protocol: TCP
```

---

## Task B4: httproute.yaml

References the existing `goldentooth` Gateway in the `gateway` namespace, matching the pattern used by `apps/gatus/httproute.yaml`.

**Files:**
- Create: `apps/wiz6/httproute.yaml`

- [ ] **Step 1: Write httproute.yaml**

```yaml
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: wiz6
  namespace: wiz6
spec:
  parentRefs:
    - name: goldentooth
      namespace: gateway
      sectionName: https
  hostnames:
    - wiz6.goldentooth.net
  rules:
    - backendRefs:
        - name: wiz6
          port: 80
```

---

## Task B5: ghcr-pull secret (SOPS-encrypted)

The most sensitive task. Create a `kubernetes.io/dockerconfigjson` secret from the PAT in `$WIZ6_GHCR_PAT`, then immediately encrypt it with SOPS.

**Files:**
- Create: `apps/wiz6/secret.yaml` (committed in encrypted form ONLY)

- [ ] **Step 1: Verify the PAT is loaded into your shell**

```bash
[ -n "$WIZ6_GHCR_PAT" ] && echo "PAT loaded (length: ${#WIZ6_GHCR_PAT})" || echo "PAT NOT SET"
```

Expected: "PAT loaded (length: 40)" or similar. If "NOT SET", export it (see the Pre-flight section) and re-run.

- [ ] **Step 2: Generate the secret YAML via `kubectl --dry-run=client`**

```bash
cd ~/Projects/goldentooth/gitops
kubectl create secret docker-registry ghcr-pull \
  --namespace=wiz6 \
  --docker-server=ghcr.io \
  --docker-username=ndouglas \
  --docker-password="$WIZ6_GHCR_PAT" \
  --dry-run=client \
  -o yaml > apps/wiz6/secret.yaml
```

If the GitHub username is different from `ndouglas`, substitute it.

- [ ] **Step 3: Verify the secret was written without the PAT in plaintext logs**

```bash
head -3 apps/wiz6/secret.yaml
```

Expected: `apiVersion: v1`, `data:`, then a base64 blob. The PAT is base64-encoded in the `data.\.dockerconfigjson` field, NOT plaintext.

DO NOT commit at this stage — the base64 is trivially reversible. Encrypt first.

- [ ] **Step 4: Encrypt with SOPS**

```bash
sops --encrypt --in-place apps/wiz6/secret.yaml
```

Expected: file now contains `data: ENC[AES256_GCM,...]` blobs and a `sops:` footer. The Age recipient should match `.sops.yaml`.

Verify:

```bash
head -10 apps/wiz6/secret.yaml
grep -q "ENC\[AES256_GCM" apps/wiz6/secret.yaml && echo "encrypted" || echo "NOT ENCRYPTED — STOP"
```

Expected: "encrypted". If "NOT ENCRYPTED", STOP and report — committing an unencrypted secret would leak the PAT.

- [ ] **Step 5: Unset the env var to limit blast radius**

```bash
unset WIZ6_GHCR_PAT
```

The PAT lives only inside the encrypted file from here on.

---

## Task B6: kustomization.yaml

Wraps the wiz6 manifests into a Kustomize bundle. Matches the pattern in `apps/gatus/kustomization.yaml`.

**Files:**
- Create: `apps/wiz6/kustomization.yaml`

- [ ] **Step 1: Write kustomization.yaml**

```yaml
---
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - deployment.yaml
  - service.yaml
  - httproute.yaml
  - secret.yaml
```

---

## Task B7: Flux Kustomization entry (apps/wiz6.yaml)

The per-app Flux Kustomization that tells Flux to reconcile `apps/wiz6/`. Mirrors `apps/gatus.yaml`.

**Files:**
- Create: `apps/wiz6.yaml`

- [ ] **Step 1: Write apps/wiz6.yaml**

```yaml
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: wiz6
  namespace: flux-system
spec:
  interval: 30m0s
  path: ./apps/wiz6
  prune: true
  retryInterval: 2m0s
  sourceRef:
    kind: GitRepository
    name: flux-system
  targetNamespace: wiz6
  timeout: 3m0s
  wait: true
```

---

## Task B8: Add wiz6 to apps/kustomization.yaml

The top-level `apps/kustomization.yaml` lists every app's entry file. Add wiz6.

**Files:**
- Modify: `apps/kustomization.yaml`

- [ ] **Step 1: Inspect current content**

```bash
cat apps/kustomization.yaml
```

Expected: a `resources:` list with entries like `httpbin.yaml`, `metallb.yaml`, `gatus.yaml`, plus directory entries like `mcp`, `theatre`, `pds`.

- [ ] **Step 2: Add `wiz6.yaml` to the resources list**

Insert `- wiz6.yaml` in the `resources:` list, alphabetically ordered (or following whatever convention the existing list uses).

After edit, verify with `cat`:

```bash
cat apps/kustomization.yaml
```

Expected: the new entry appears.

---

## Task B9: Commit + push goldentooth/gitops

Single commit covering all of Phase B.

- [ ] **Step 1: Inspect the diff**

```bash
cd ~/Projects/goldentooth/gitops
git status --short
git diff --stat
```

Expected staged-or-modified files:
- `apps/wiz6/namespace.yaml` (new)
- `apps/wiz6/deployment.yaml` (new)
- `apps/wiz6/service.yaml` (new)
- `apps/wiz6/httproute.yaml` (new)
- `apps/wiz6/secret.yaml` (new, encrypted)
- `apps/wiz6/kustomization.yaml` (new)
- `apps/wiz6.yaml` (new)
- `apps/kustomization.yaml` (modified, +1 line)

- [ ] **Step 2: Final safety check — secret is encrypted**

```bash
grep -q "ENC\[AES256_GCM" apps/wiz6/secret.yaml && echo "OK encrypted" || (echo "ABORT — secret unencrypted"; exit 1)
```

Expected: "OK encrypted". If not, STOP — re-run Task B5 Step 4.

- [ ] **Step 3: Commit**

```bash
git add apps/wiz6/ apps/wiz6.yaml apps/kustomization.yaml
git commit -m "feat(apps): wiz6 viewer at wiz6.goldentooth.net

Deploys ghcr.io/ndouglas/wiz6 as a single nginx replica behind the
goldentooth Gateway. Static-site SPA serving the reverse-engineered
Wizardry VI data tables. Pull secret encrypted via SOPS."
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

Expected: push succeeds. Flux's `flux-system` Kustomization reconciles every 30 minutes by default but can be forced with `flux reconcile kustomization apps --with-source`. The user can do that manually after the push if they want to skip the wait.

---

## Task B10: Verify the deployment

After the push, wait for Flux to sync (or force a reconcile) and verify the site is reachable.

- [ ] **Step 1: Force a Flux reconcile (optional but faster)**

```bash
flux reconcile kustomization apps --with-source 2>&1 | tail -5
```

If `flux` CLI is not installed locally, skip this step — Flux will reconcile within 30 minutes on its own.

- [ ] **Step 2: Check the wiz6 namespace + deployment status**

```bash
kubectl get pods -n wiz6
kubectl describe deployment wiz6 -n wiz6 | head -40
```

Expected: one `wiz6-xxxxx-yyyyy` pod in `Running` state. If `ImagePullBackOff`:

```bash
kubectl describe pod -n wiz6 -l app=wiz6 | tail -20
```

Look for the specific pull-error message:
- "no basic auth credentials" → image-pull secret didn't decrypt correctly. Verify `kubectl get secret ghcr-pull -n wiz6 -o yaml | grep dockerconfig | head -1` shows a base64 blob. If empty, SOPS failed to decrypt. Check that Flux has access to the Age key (`kubectl get secret sops-age -n flux-system` should exist).
- "manifest unknown" → the SHA tag in deployment.yaml is wrong. Verify against the actual ghcr.io tag.
- "denied" → the PAT lacks `read:packages` scope, or the package visibility doesn't allow that user. Re-generate the PAT with correct scopes.

- [ ] **Step 3: Verify DNS resolves**

```bash
dig +short wiz6.goldentooth.net
```

Expected: an A record returning a public IP. If empty, external-dns hasn't reconciled yet — wait a minute and retry.

- [ ] **Step 4: Verify the site loads**

```bash
curl -fsS https://wiz6.goldentooth.net/ | grep -q '<div id="root">' && echo "site live" || echo "site NOT loading"
curl -fsS -o /dev/null -w "scenario: %{http_code} %{size_download} bytes\n" https://wiz6.goldentooth.net/scenario/scenario.json
```

Expected:
```
site live
scenario: 200 NNNNNN bytes
```

If the cert is not yet issued (cert-manager via Step-CA takes a moment), you may see an SSL error. Wait 30 seconds and retry.

- [ ] **Step 5: Sanity-check a deep-link**

```bash
curl -fsS https://wiz6.goldentooth.net/monsters/giant-rat | grep -q '<div id="root">' && echo "deep-link works" || echo "deep-link BROKEN"
```

Expected: "deep-link works" (the SPA fallback returns index.html for any path).

- [ ] **Step 6: Browser sanity check** (manual, by the user)

Open https://wiz6.goldentooth.net/ in a browser. Verify:
- Landing page renders with the titlepag hero
- Nav bar works
- Click "Monsters" → split-view loads, list populates with 189 filled monsters
- Click a monster → detail tabs work
- Hard-reload `/monsters/giant-rat` → still works (SPA fallback)

If any of those fail, note which and report back.

---

## Finishing the stage

Phase A has already merged + pushed in Task A6. Phase B was committed + pushed in Task B9. No worktree cleanup needed for Phase B (no worktree was created).

Hand off to the user — let them know the site is live at https://wiz6.goldentooth.net/ and any caveats from Task B10 verification.

---

## Out of scope (deferred, for follow-up stages)

- **CI for the cluster manifests** — no PR-time validation of the YAML; if a yaml has a typo, Flux only complains after merge. Adding a `kustomize build` check in a CI workflow would catch this earlier.
- **Automated SHA updates** — currently the deployment.yaml hardcodes the image SHA. A future stage could either switch to `:latest` (with `imagePullPolicy: Always`) or wire up Flux's image automation controller to bump the SHA on each push.
- **Staging environment** — there's one cluster; no staging vs. prod separation.
- **Cluster monitoring for wiz6** — gatus has a ServiceMonitor (Prometheus); wiz6 doesn't. Add later if useful.
- **Multi-region / CDN** — single cluster, single replica; if traffic becomes an issue (it won't), Cloudflare in front would help.

## Risks

- **PAT lifecycle** — GitHub PATs expire (max 1 year for fine-grained, never for classic). When this PAT expires, image pulls will fail; the secret needs re-rotation via the same Task B5 process. Document the expiry date somewhere (calendar reminder, secret-rotation runbook).
- **First build duration** — the GitHub Actions build runs the full extractor + Vite build. ~1-2 minutes on Actions hardware. Subsequent builds benefit from `cache-from: type=gha`.
- **Image size** — `node:20-alpine` is ~180 MB; with the extracted JSONs and dist, total image is ~250 MB layers but only ~50 MB compressed for pull. Acceptable for a Pi cluster.
- **Bandwidth** — `scenario.json` is 2.3 MB uncompressed, ~80 KB gzipped (nginx config enables gzip). Each visitor downloads it once. No concerns.
