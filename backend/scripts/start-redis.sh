#!/bin/bash

# Redis 컨테이너 실행 스크립트
# T012: Redis 컨테이너 실행

set -e

echo "🔴 Starting Redis container..."

# Docker Compose로 Redis 시작
docker-compose up -d redis

# 컨테이너가 준비될 때까지 대기
echo "⏳ Waiting for Redis to be ready..."
sleep 3

# 헬스체크
MAX_ATTEMPTS=20
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✅ Redis is ready!"

    # Redis 정보 출력
    echo "📊 Redis info:"
    docker-compose exec -T redis redis-cli INFO server | grep -E "redis_version|tcp_port"

    exit 0
  fi

  ATTEMPT=$((ATTEMPT + 1))
  echo "Attempt $ATTEMPT/$MAX_ATTEMPTS - Redis not ready yet..."
  sleep 1
done

echo "❌ Redis failed to start within timeout"
exit 1