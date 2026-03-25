FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY connectors/sharepoint/package.json connectors/sharepoint/

RUN npm install --workspace=connectors/sharepoint

COPY packages/shared/ packages/shared/
COPY connectors/sharepoint/ connectors/sharepoint/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=connectors/sharepoint

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/connectors/sharepoint/package.json connectors/sharepoint/
COPY --from=builder /app/connectors/sharepoint/dist connectors/sharepoint/dist
COPY --from=builder /app/node_modules node_modules

EXPOSE 3000
CMD ["node", "connectors/sharepoint/dist/index.js"]
