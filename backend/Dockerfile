# 백엔드 Dockerfile
# Multi-stage build를 통한 최적화

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# 의존성 캐싱을 위해 package*.json만 먼저 복사
COPY package*.json ./
RUN npm install --omit=dev

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

# 소스코드 복사
COPY . .

# 빌드가 필요한 경우 (현재는 별도 빌드 없음)
# RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

# 보안을 위한 non-root 사용자 생성
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 필수 패키지 설치 (한글 지원 및 시간대)
RUN apk add --no-cache tzdata
ENV TZ=Asia/Seoul

# Production 의존성 복사
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# 사용자 전환
USER nodejs

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# 포트 노출
EXPOSE 3000

# 환경 변수
ENV NODE_ENV=production

# 실행 명령
CMD ["node", "src/server.js"]