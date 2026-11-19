# 🐳 Flowboard: oru container la website + API
# Step 1 website ah build pannum, step 2 server mattum (chinna image, dev tools illa)

# ---------- 1) Website build (React → flowboard/dist) ----------
FROM node:24-alpine AS web
WORKDIR /app/flowboard
COPY flowboard/package.json flowboard/package-lock.json ./
RUN npm ci
COPY flowboard/ ./
RUN npm run build

# ---------- 2) Server (production) ----------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    LOG_FORMAT=json
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/ ./
COPY --from=web /app/flowboard/dist /app/flowboard/dist

# 🔒 root ah oadaadhe: "node" user (hack aanaalum container la periya power illa)
USER node
EXPOSE 3001

# 🩺 Docker 30 second ku oru thadavai "uyiroda irukkiyaa?" nu kekkum
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "index.ts"]
