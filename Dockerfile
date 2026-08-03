FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:22-alpine AS release
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
RUN npm install --omit=dev

# Cloud Run sets PORT automatically; the app reads it via process.env.PORT
EXPOSE 8080

ENTRYPOINT ["node", "dist/index.js"]
