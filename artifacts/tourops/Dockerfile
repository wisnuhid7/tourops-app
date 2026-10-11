FROM nginx:stable-alpine
COPY artifacts/tourops/dist/public /usr/share/nginx/html
COPY artifacts/tourops/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
