FROM node:20-alpine AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY artifacts/tourops ./artifacts/tourops
RUN npm i -g pnpm
RUN pnpm install --frozen-lockfile
RUN cd /app/artifacts/tourops && pnpm run build

FROM nginx:stable-alpine
COPY --from=build /app/artifacts/tourops/dist /usr/share/nginx/html
COPY artifacts/tourops/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
