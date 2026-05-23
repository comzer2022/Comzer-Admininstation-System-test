# ビルドステージ
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 実行ステージ
FROM node:20-alpine
WORKDIR /app
ENV TZ=Asia/Tokyo
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
