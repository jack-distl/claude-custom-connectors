FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY connectors/se-ranking/package.json connectors/se-ranking/

RUN npm install --workspace=connectors/se-ranking

COPY packages/shared/ packages/shared/
COPY connectors/se-ranking/ connectors/se-ranking/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=connectors/se-ranking

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/connectors/se-ranking/package.json connectors/se-ranking/
COPY --from=builder /app/connectors/se-ranking/dist connectors/se-ranking/dist
COPY --from=builder /app/node_modules node_modules

EXPOSE 3000
CMD ["node", "connectors/se-ranking/dist/index.js"]
