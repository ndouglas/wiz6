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

# Use nginx's default CMD (start nginx in the foreground)
