FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY connectors/monday-proxy/package.json connectors/monday-proxy/

RUN npm install --workspace=connectors/monday-proxy

COPY packages/shared/ packages/shared/
COPY connectors/monday-proxy/ connectors/monday-proxy/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=connectors/monday-proxy

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/connectors/monday-proxy/package.json connectors/monday-proxy/
COPY --from=builder /app/connectors/monday-proxy/dist connectors/monday-proxy/dist
COPY --from=builder /app/node_modules node_modules

EXPOSE 3000
CMD ["node", "connectors/monday-proxy/dist/index.js"]
