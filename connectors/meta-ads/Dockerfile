FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY connectors/meta-ads/package.json connectors/meta-ads/

RUN npm install --workspace=connectors/meta-ads

COPY packages/shared/ packages/shared/
COPY connectors/meta-ads/ connectors/meta-ads/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=connectors/meta-ads

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/connectors/meta-ads/package.json connectors/meta-ads/
COPY --from=builder /app/connectors/meta-ads/dist connectors/meta-ads/dist
COPY --from=builder /app/node_modules node_modules

EXPOSE 3000
CMD ["node", "connectors/meta-ads/dist/index.js"]
