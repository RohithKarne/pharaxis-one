# CP Portal frontend — Cloud Run image (static SPA + same-origin /api proxy).
#
# The SPA fetches relative paths and has no API-base helper, so the API has to
# be reachable on the same origin. nginx serves the build and proxies /api to
# the backend Cloud Run service. BACKEND_URL is baked in at build time.
FROM node:20-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
ARG BACKEND_URL
ARG BACKEND_HOST
COPY --from=build /src/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN sed -i "s#BACKEND_URL_PLACEHOLDER#${BACKEND_URL}#g; s#BACKEND_HOST_PLACEHOLDER#${BACKEND_HOST}#g" \
      /etc/nginx/conf.d/default.conf \
 && rm -f /etc/nginx/conf.d/../nginx.conf.default \
 && grep -q "${BACKEND_HOST}" /etc/nginx/conf.d/default.conf \
      || (echo "BACKEND_URL/BACKEND_HOST not substituted — refusing to build a proxy that points nowhere" && exit 1)
EXPOSE 8080
