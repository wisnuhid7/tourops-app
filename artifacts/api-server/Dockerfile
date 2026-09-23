FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN apk add --no-cache libc6-compat python3 g++ make
RUN npm i -g pnpm
COPY . .
RUN pnpm install --prod
RUN pnpm run build
ENV NODE_ENV=production
CMD ["node", "--env-file=.env", "--enable-source-maps", "./dist/index.mjs"]
