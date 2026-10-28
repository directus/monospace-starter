FROM node:24-alpine
WORKDIR /checkr
COPY server.mjs seed.json ./
USER node
EXPOSE 4020
CMD ["node", "server.mjs"]
