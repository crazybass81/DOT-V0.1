# 프론트엔드 Dockerfile
# React 애플리케이션을 위한 multi-stage build

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

# 소스 복사
COPY . .

# React 빌드
ENV REACT_APP_API_URL=/api/v1
ENV GENERATE_SOURCEMAP=false
RUN npm run build

# Stage 3: Production with Nginx
FROM nginx:alpine AS runner

# 한글 지원 및 시간대 설정
RUN apk add --no-cache tzdata
ENV TZ=Asia/Seoul

# Nginx 설정 복사
COPY --from=builder /app/nginx.conf /etc/nginx/nginx.conf

# React 빌드 파일 복사
COPY --from=builder /app/build /usr/share/nginx/html

# 보안 헤더를 위한 추가 설정
RUN echo 'server_tokens off;' >> /etc/nginx/conf.d/security.conf && \
    echo 'add_header X-Frame-Options "SAMEORIGIN" always;' >> /etc/nginx/conf.d/security.conf && \
    echo 'add_header X-XSS-Protection "1; mode=block" always;' >> /etc/nginx/conf.d/security.conf && \
    echo 'add_header X-Content-Type-Options "nosniff" always;' >> /etc/nginx/conf.d/security.conf && \
    echo 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;' >> /etc/nginx/conf.d/security.conf

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost || exit 1

# non-root 사용자로 실행
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]