# TI Assistant image for ktn, built from the repo root by ktn-build-publish.yml.
# Ignore rules live in Dockerfile.dockerignore next to this file.
# glibc base (not Alpine) so sharp's prebuilt binaries work.
# --ignore-scripts: the only package that needs its install script is pprof
# (Google Cloud profiler, unused here), which has no Node 24 prebuild and
# would need a compiler. sharp and next ship prebuilt optional packages.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM node:24-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm installs both libc variants of these; this image is glibc only.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  && rm -rf node_modules/@next/swc-linux-*-musl node_modules/@img/*linuxmusl*

FROM node:24-slim AS build
WORKDIR /app
# NEXT_PUBLIC_* values are inlined into the client bundle at build time,
# so the image is tied to one Firebase project and one public URL.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_BASE_URL
RUN test -n "$NEXT_PUBLIC_FIREBASE_PROJECT_ID" -a -n "$NEXT_PUBLIC_BASE_URL" \
  || { echo "Set the NEXT_PUBLIC_FIREBASE_* and NEXT_PUBLIC_BASE_URL build args (see .env.example)." >&2; exit 1; }
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && rm -rf build/cache

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
# next start writes its image-optimisation cache under build/cache.
COPY --chown=node:node --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY --from=build /app/server ./server
COPY package.json next.config.js ./
USER node
EXPOSE 3000
# Plain `next start`; `npm start` also loads the Google Cloud profiler.
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
