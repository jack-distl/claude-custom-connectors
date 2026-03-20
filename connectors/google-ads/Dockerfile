FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY connectors/google-ads/package.json connectors/google-ads/

RUN npm install --workspace=connectors/google-ads

COPY packages/shared/ packages/shared/
COPY connectors/google-ads/ connectors/google-ads/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=connectors/google-ads

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/connectors/google-ads/package.json connectors/google-ads/
COPY --from=builder /app/connectors/google-ads/dist connectors/google-ads/dist
COPY --from=builder /app/node_modules node_modules

EXPOSE 3000
CMD ["node", "connectors/google-ads/dist/index.js"]
