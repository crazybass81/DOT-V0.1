#!/bin/bash

# Vercel 통합 배포 스크립트
# 프론트엔드 + 백엔드를 하나의 Vercel 프로젝트로 배포

echo "🚀 DOT Platform Vercel 통합 배포 시작..."

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 환경 체크
echo -e "${YELLOW}📋 환경 체크 중...${NC}"
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Vercel CLI가 설치되지 않았습니다.${NC}"
    echo "다음 명령어로 설치하세요: npm i -g vercel"
    exit 1
fi

# 2. 프로젝트 루트로 이동
cd "$(dirname "$0")/.." || exit

# 3. 종속성 설치
echo -e "${YELLOW}📦 종속성 설치 중...${NC}"
npm install --legacy-peer-deps

# Frontend 종속성
echo -e "${YELLOW}📦 Frontend 종속성 설치 중...${NC}"
cd frontend && npm install --legacy-peer-deps && cd ..

# Backend 종속성
echo -e "${YELLOW}📦 Backend 종속성 설치 중...${NC}"
cd backend && npm install && cd ..

# 4. 빌드 테스트
echo -e "${YELLOW}🔨 Frontend 빌드 테스트 중...${NC}"
cd frontend && npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Frontend 빌드 실패${NC}"
    exit 1
fi
cd ..

# 5. Vercel 배포
echo -e "${GREEN}🚀 Vercel에 배포 중...${NC}"
vercel --prod

# 6. 배포 완료
echo -e "${GREEN}✅ 배포 완료!${NC}"
echo ""
echo "다음 단계:"
echo "1. Vercel Dashboard에서 환경 변수 설정"
echo "   - PostgreSQL 연결 정보"
echo "   - Redis 연결 정보"
echo "   - JWT 시크릿"
echo ""
echo "2. 데이터베이스 제공자 선택:"
echo "   - Vercel PostgreSQL (추천)"
echo "   - Supabase"
echo "   - PlanetScale"
echo "   - Neon"
echo ""
echo "3. Redis 제공자 선택:"
echo "   - Upstash Redis (추천)"
echo "   - Redis Cloud"
echo ""
echo "📝 환경 변수 예제는 .env.vercel.example 참조"