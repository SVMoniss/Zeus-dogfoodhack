FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Public API base is inlined at build time: pass --build-arg
# NEXT_PUBLIC_API_URL=<public backend URL> when deploying
# (Railway: set the variable before build; same value as env).
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy source
COPY . .

# Build
RUN npm run build

EXPOSE 3000

# Railway/Render set $PORT — next start must listen on it.
CMD ["sh", "-c", "npm start -- -p ${PORT:-3000}"]