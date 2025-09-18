#!/bin/bash

# PostGIS 확장 설치 스크립트
# T013: PostGIS 확장 설치

set -e

echo "🗺️ Installing PostGIS extension..."

# 환경 변수 로드
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# 기본값 설정
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-dot_platform_dev}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres123}

# PostgreSQL 연결 문자열
export PGPASSWORD=$DB_PASSWORD

echo "📍 Connecting to database: $DB_NAME@$DB_HOST:$DB_PORT"

# PostGIS 확장 설치
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME <<EOF
-- PostGIS 확장 설치
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- UUID 확장 설치 (추가)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 설치 확인
SELECT PostGIS_full_version();
SELECT uuid_generate_v4();

-- 공간 참조 시스템 확인
SELECT COUNT(*) as srid_count FROM spatial_ref_sys;
EOF

if [ $? -eq 0 ]; then
  echo "✅ PostGIS extension installed successfully!"

  # 테스트 데이터베이스에도 설치
  echo "🗺️ Installing PostGIS in test database..."
  TEST_DB_NAME=${TEST_DB_NAME:-dot_platform_test}

  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TEST_DB_NAME <<EOF
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EOF

  echo "✅ PostGIS installed in test database!"
else
  echo "❌ Failed to install PostGIS extension"
  exit 1
fi

unset PGPASSWORD