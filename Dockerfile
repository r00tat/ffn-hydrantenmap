# https://nextjs.org/docs/deployment
# Install dependencies only when needed
ARG DOCKER_REGISTRY=""
FROM ${DOCKER_REGISTRY}node:24-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
# --ignore-scripts: a dependency's lifecycle scripts are the cheapest path to
# code execution in a supply-chain attack — they run at install time, before
# anyone has imported the package. Note that npm 11 does NOT prevent this on
# its own: it prints an "allow-scripts" warning listing the pending scripts and
# then runs them anyway, so the flag is what actually blocks execution.
# Nothing in this tree needs them (no node-gyp, no prebuild-install; the native
# bindings of sharp et al. ship as prebuilt platform packages via
# optionalDependencies).
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry.
# ENV NEXT_TELEMETRY_DISABLED 1

# next build inlined NEXT_PUBLIC_*-Werte fest ins Client-Bundle: was hier fehlt,
# ist im Browser dauerhaft undefined — ohne Firebase-Konfiguration scheitert
# schon getFirestore() mit '"projectId" not provided in firebase.initializeApp.'.
# .dockerignore hält .env* bewusst aus dem Image (sonst landet der lokale
# App-Check-Debug-Token im Bundle), deshalb kommt die Konfiguration als
# Build-Arg. Alles hier Aufgeführte ist ohnehin öffentlich, sobald das Bundle
# ausgeliefert ist — echte Secrets gehören weiterhin in die Laufzeitumgebung.
ARG NEXT_PUBLIC_FIREBASE_APIKEY=""
ARG NEXT_PUBLIC_FIRESTORE_DB=""
ARG NEXT_PUBLIC_OAUTH_CLIENT_ID=""
ARG NEXT_PUBLIC_RECAPTCHA_KEY=""
ARG NEXT_PUBLIC_BUILD_ID=""
ENV NEXT_PUBLIC_FIREBASE_APIKEY=${NEXT_PUBLIC_FIREBASE_APIKEY}
ENV NEXT_PUBLIC_FIRESTORE_DB=${NEXT_PUBLIC_FIRESTORE_DB}
ENV NEXT_PUBLIC_OAUTH_CLIENT_ID=${NEXT_PUBLIC_OAUTH_CLIENT_ID}
ENV NEXT_PUBLIC_RECAPTCHA_KEY=${NEXT_PUBLIC_RECAPTCHA_KEY}
ENV NEXT_PUBLIC_BUILD_ID=${NEXT_PUBLIC_BUILD_ID}

# Turbopacks Build-Cache in .next/cache/turbopack bringt hier nichts: Diese Stage
# startet aus einer frischen Layer, und nach unten kopiert werden nur
# .next/standalone und .next/static. Der Cache waere also ~430 MB, die geschrieben
# und nie gelesen werden. Siehe turbopackFileSystemCacheForBuild in next.config.js.
ENV DISABLE_TURBOPACK_BUILD_CACHE=1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "server.js"]
