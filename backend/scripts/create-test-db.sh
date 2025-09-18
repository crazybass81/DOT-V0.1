#!/bin/bash

# 테스트 데이터베이스 생성 스크립트
# T014: 테스트 데이터베이스 생성

set -e

echo "🧪 Creating test database..."

# 환경 변수 로드
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# 기본값 설정
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres123}
TEST_DB_NAME=${TEST_DB_NAME:-dot_platform_test}

# PostgreSQL 연결
export PGPASSWORD=$DB_PASSWORD

echo "📍 Creating test database: $TEST_DB_NAME"

# 데이터베이스가 존재하면 삭제
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres <<EOF
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = '$TEST_DB_NAME'
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS $TEST_DB_NAME;
EOF

# 테스트 데이터베이스 생성
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres <<EOF
CREATE DATABASE $TEST_DB_NAME
  WITH OWNER = $DB_USER
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.utf8'
  LC_CTYPE = 'en_US.utf8'
  TABLESPACE = pg_default
  CONNECTION LIMIT = -1;

\c $TEST_DB_NAME;

-- PostGIS 확장 설치
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Row Level Security 활성화를 위한 설정
ALTER DATABASE $TEST_DB_NAME SET row_security = on;

-- 기본 스키마 권한 설정
GRANT ALL ON SCHEMA public TO $DB_USER;
EOF

if [ $? -eq 0 ]; then
  echo "✅ Test database created successfully!"

  # 테스트 데이터베이스 정보 확인
  echo "📊 Test database info:"
  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TEST_DB_NAME -c "\l $TEST_DB_NAME"
  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TEST_DB_NAME -c "\dx"
else
  echo "❌ Failed to create test database"
  exit 1
fi

unset PGPASSWORD

echo "✅ Test database '$TEST_DB_NAME' is ready for testing!"