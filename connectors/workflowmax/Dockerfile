FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY connectors/workflowmax/package.json connectors/workflowmax/

RUN npm install --workspace=connectors/workflowmax

COPY packages/shared/ packages/shared/
COPY connectors/workflowmax/ connectors/workflowmax/

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=connectors/workflowmax

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/connectors/workflowmax/package.json connectors/workflowmax/
COPY --from=builder /app/connectors/workflowmax/dist connectors/workflowmax/dist
COPY --from=builder /app/node_modules node_modules

EXPOSE 3000
CMD ["node", "connectors/workflowmax/dist/index.js"]
