# Frontend image: Vite build, then nginx serving the static bundle.
# Base images are build args for the same reason as in backend/Dockerfile.
ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.27-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /src

# npm ci from the lockfile: a reproducible tree, and the layer is reused until the
# lockfile itself changes.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
# `npm run build` is `tsc -b && vite build`, so a type error fails the image build
# rather than shipping a bundle nobody type-checked.
RUN npm run build

FROM ${NGINX_IMAGE} AS runtime

# nginx-unprivileged already runs as uid 101 and keeps its pid and temp paths out of
# root-owned directories, so no USER or permission fixup is needed here.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
