FROM node:20-alpine
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server
RUN apk add --no-cache libc6-compat python3 g++ make
RUN npm i -g pnpm
RUN pnpm install --frozen-lockfile
RUN cd /app/artifacts/api-server && pnpm run build
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
