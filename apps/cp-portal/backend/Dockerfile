# CP Portal backend — Cloud Run image.
#
# Node 20 to match CI (.github/workflows/_app-ci.yml uses actions/setup-node@v7
# with node-version 20). package.json pins no engines, so CI is the only
# statement we have about which runtime this is tested against.
FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first so the layer caches across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# server.js writes uploads here; create it up front so a first write does not
# fail on a read-only-ish container filesystem.
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

# server.js reads CP_PORT (server.js:25) and defaults to 4000. Cloud Run injects
# PORT and requires the container to listen on it. Bridge the two here rather
# than change application code for one deployment target.
CMD ["sh", "-c", "CP_PORT=${PORT:-8080} node server.js"]
