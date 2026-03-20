FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY connectors/_template/package.json connectors/_template/

RUN npm install --workspace=connectors/_template

COPY packages/shared/ packages/shared/
COPY connectors/_template/ connectors/_template/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=connectors/_template

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/connectors/_template/package.json connectors/_template/
COPY --from=builder /app/connectors/_template/dist connectors/_template/dist
COPY --from=builder /app/node_modules node_modules

EXPOSE 3000
CMD ["node", "connectors/_template/dist/index.js"]
