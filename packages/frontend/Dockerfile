FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Build args for Next.js public env (used in browser; must point at host-accessible URLs)
ARG NEXT_PUBLIC_SOLARTICK_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_COPILOT_API_URL=http://localhost:8003
ARG NEXT_PUBLIC_TRADING_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_SOLARTICK_API_URL=$NEXT_PUBLIC_SOLARTICK_API_URL
ENV NEXT_PUBLIC_COPILOT_API_URL=$NEXT_PUBLIC_COPILOT_API_URL
ENV NEXT_PUBLIC_TRADING_API_URL=$NEXT_PUBLIC_TRADING_API_URL

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
