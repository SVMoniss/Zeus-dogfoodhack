# Root Dockerfile — serves the frontend when the Railway service's root
# directory is the repo root (its default). Same build as src/frontend/Dockerfile.
FROM node:20-alpine

WORKDIR /app

# Install dependencies (including devDeps: `next build` needs typescript,
# tailwindcss, postcss — plain `npm install` skips them when NODE_ENV=production).
COPY src/frontend/package*.json ./
RUN npm install --include=dev

# Public API base is inlined at build time. Default points at the live Railway
# demo backend so a plain deploy works with no extra config; override with
# --build-arg NEXT_PUBLIC_API_URL=<url> for any other backend.
ARG NEXT_PUBLIC_API_URL=https://zeus-dogfoodhack-production.up.railway.app
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy frontend source
COPY src/frontend/ ./

# Build
RUN npm run build

EXPOSE 3000

# Railway sets $PORT — next start must listen on it.
CMD ["sh", "-c", "npm start -- -p ${PORT:-3000}"]
