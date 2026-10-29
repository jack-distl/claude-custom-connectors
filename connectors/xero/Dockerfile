FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY connectors/xero/package.json connectors/xero/

RUN npm install --workspace=connectors/xero

COPY packages/shared/ packages/shared/
COPY connectors/xero/ connectors/xero/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=connectors/xero

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/connectors/xero/package.json connectors/xero/
COPY --from=builder /app/connectors/xero/dist connectors/xero/dist
COPY --from=builder /app/node_modules node_modules

EXPOSE 3000
CMD ["node", "connectors/xero/dist/index.js"]
