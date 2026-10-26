FROM node:24-alpine
WORKDIR /stripe
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.mjs billing.json ./
USER node
EXPOSE 4010
CMD ["node", "server.mjs"]
