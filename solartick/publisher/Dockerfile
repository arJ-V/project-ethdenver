FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json index.ts ./
COPY abi/ ./abi/

ENV NODE_ENV=production
CMD ["npx", "tsx", "index.ts"]
