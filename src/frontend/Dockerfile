FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Public API base is inlined at build time. Default points at the live Railway
# demo backend so a plain deploy works with no extra config; override with
# --build-arg NEXT_PUBLIC_API_URL=<url> (or the Railway variable of the same
# name) for any other backend. Local `npm run dev`/compose are unaffected
# (they set their own value at runtime).
ARG NEXT_PUBLIC_API_URL=https://zeus-dogfoodhack-production.up.railway.app
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy source
COPY . .

# Build
RUN npm run build

EXPOSE 3000

# Railway/Render set $PORT — next start must listen on it.
CMD ["sh", "-c", "npm start -- -p ${PORT:-3000}"]