# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94

FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime
ARG NEXAFLOW_REVISION=unknown
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXAFLOW_REVISION=${NEXAFLOW_REVISION}
RUN groupadd --system --gid 10001 nexaflow && useradd --system --uid 10001 --gid 10001 --home-dir /app --shell /usr/sbin/nologin nexaflow
COPY --from=production-dependencies --chown=nexaflow:nexaflow /app/node_modules ./node_modules
COPY --from=build --chown=nexaflow:nexaflow /app/.next ./.next
COPY --from=build --chown=nexaflow:nexaflow /app/public ./public
COPY --from=build --chown=nexaflow:nexaflow /app/package.json ./package.json
COPY --from=build --chown=nexaflow:nexaflow /app/next.config.ts ./next.config.ts
COPY --from=build --chown=nexaflow:nexaflow /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=nexaflow:nexaflow /app/src/server ./src/server
USER 10001:10001
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0"]
