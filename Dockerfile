FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000 4000

CMD ["node", "src/index.js"]
