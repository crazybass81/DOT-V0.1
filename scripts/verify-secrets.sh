#!/bin/bash

# GitHub Secrets 설정 확인 스크립트
# Vercel 배포 준비 상태를 확인합니다

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "======================================"
echo "   GitHub Secrets 설정 가이드"
echo "======================================"
echo ""

# Vercel 프로젝트 정보 표시
echo -e "${BLUE}📋 Vercel 프로젝트 정보:${NC}"
echo "  Organization ID: team_ZRA46B1Ng8n027CYnt0PzJzr"
echo "  Project ID: prj_D6dcyGv6dOXC82Kx1bkuwy2EiB08"
echo "  Token: 86e3NBJcqpDLeaH6GYXtmx36"
echo ""

echo -e "${YELLOW}⚠️  다음 단계를 따라주세요:${NC}"
echo ""
echo "1. GitHub Secrets 페이지 열기:"
echo "   ${BLUE}https://github.com/crazybass81/DOT-V0.1/settings/secrets/actions${NC}"
echo ""
echo "2. 'New repository secret' 클릭 후 추가:"
echo ""
echo "   ${GREEN}VERCEL_TOKEN${NC}"
echo "   Value: 86e3NBJcqpDLeaH6GYXtmx36"
echo ""
echo "   ${GREEN}VERCEL_ORG_ID${NC}"
echo "   Value: team_ZRA46B1Ng8n027CYnt0PzJzr"
echo ""
echo "   ${GREEN}VERCEL_PROJECT_ID${NC}"
echo "   Value: prj_D6dcyGv6dOXC82Kx1bkuwy2EiB08"
echo ""

# Vercel CLI 테스트
echo -e "${BLUE}🔍 Vercel 연결 테스트:${NC}"
if command -v vercel &> /dev/null; then
    export VERCEL_TOKEN="86e3NBJcqpDLeaH6GYXtmx36"
    export VERCEL_ORG_ID="team_ZRA46B1Ng8n027CYnt0PzJzr"
    export VERCEL_PROJECT_ID="prj_D6dcyGv6dOXC82Kx1bkuwy2EiB08"

    if vercel whoami --token="$VERCEL_TOKEN" 2>/dev/null; then
        echo -e "${GREEN}✅ Vercel Token 유효함!${NC}"
    else
        echo -e "${RED}❌ Vercel Token 확인 실패${NC}"
    fi
else
    echo "  Vercel CLI가 설치되지 않았습니다"
    echo "  npm install -g vercel 으로 설치하세요"
fi

echo ""
echo "======================================"
echo -e "${GREEN}준비 완료!${NC}"
echo "======================================"
echo ""
echo "GitHub Secrets 설정 후:"
echo "1. GitHub Actions 페이지에서 워크플로우 재실행"
echo "   https://github.com/crazybass81/DOT-V0.1/actions"
echo ""
echo "2. 또는 새 커밋 푸시:"
echo "   git commit --allow-empty -m 'trigger: Vercel 자동 배포 테스트'"
echo "   git push origin main"
echo ""