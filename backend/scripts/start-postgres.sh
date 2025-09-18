#!/bin/bash

# PostgreSQL 컨테이너 실행 스크립트
# T011: PostgreSQL 컨테이너 실행

set -e

echo "🐘 Starting PostgreSQL container..."

# Docker Compose로 PostgreSQL 시작
docker-compose up -d postgres

# 컨테이너가 준비될 때까지 대기
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# 헬스체크
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready!"

    # PostGIS 확장 설치 확인
    echo "🗺️ Checking PostGIS extension..."
    docker-compose exec -T postgres psql -U postgres -d dot_platform_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;" || true
    docker-compose exec -T postgres psql -U postgres -d dot_platform_dev -c "SELECT PostGIS_version();"

    echo "✅ PostgreSQL with PostGIS is fully initialized!"
    exit 0
  fi

  ATTEMPT=$((ATTEMPT + 1))
  echo "Attempt $ATTEMPT/$MAX_ATTEMPTS - PostgreSQL not ready yet..."
  sleep 2
done

echo "❌ PostgreSQL failed to start within timeout"
exit 1