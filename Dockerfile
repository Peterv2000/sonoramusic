# Sonora Music — API + web estática
# Etapa 1: compilar la PWA
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Etapa 2: servidor de producción (sin dependencias externas en runtime)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# `type: module` y metadatos del paquete
COPY package*.json ./
COPY server ./server

# El API de Inicio reutiliza el motor de audio del cliente. Sin estos dos
# archivos `/api/v1/home` falla dentro del contenedor.
COPY src/player/audioFeatures.js ./src/player/audioFeatures.js
COPY src/data/catalog.js ./src/data/catalog.js

COPY --from=build /app/dist ./dist

EXPOSE 4173
VOLUME ["/app/server/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.mjs"]
