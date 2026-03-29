FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY connectors/linkedin/package.json connectors/linkedin/

RUN npm install --workspace=connectors/linkedin

COPY packages/shared/ packages/shared/
COPY connectors/linkedin/ connectors/linkedin/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=connectors/linkedin

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/connectors/linkedin/package.json connectors/linkedin/
COPY --from=builder /app/connectors/linkedin/dist connectors/linkedin/dist
COPY --from=builder /app/node_modules node_modules

EXPOSE 3000
CMD ["node", "connectors/linkedin/dist/index.js"]
