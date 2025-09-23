#!/bin/bash
# Vercel 빌드 스크립트 - 환경 변수 강제 설정

echo "🔧 Vercel 빌드 시작..."
echo "API URL: $REACT_APP_API_URL"
echo "Socket URL: $REACT_APP_SOCKET_URL"

# 환경 변수 명시적 설정
export REACT_APP_API_URL="http://100.25.70.173:3001/api/v1"
export REACT_APP_SOCKET_URL="ws://100.25.70.173:3001"
export REACT_APP_ENV="production"
export REACT_APP_ENABLE_SERVICE_WORKER="false"

echo "✅ 환경 변수 설정 완료"
echo "REACT_APP_API_URL=$REACT_APP_API_URL"

# 캐시 삭제
rm -rf build node_modules/.cache .vercel/output

# 빌드 실행
npm run build:vercel

echo "🎉 빌드 완료"