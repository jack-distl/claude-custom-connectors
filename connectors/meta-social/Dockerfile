FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY connectors/meta-social/package.json connectors/meta-social/

RUN npm install --workspace=connectors/meta-social

COPY packages/shared/ packages/shared/
COPY connectors/meta-social/ connectors/meta-social/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=connectors/meta-social

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/connectors/meta-social/package.json connectors/meta-social/
COPY --from=builder /app/connectors/meta-social/dist connectors/meta-social/dist
COPY --from=builder /app/node_modules node_modules

EXPOSE 3000
CMD ["node", "connectors/meta-social/dist/index.js"]
