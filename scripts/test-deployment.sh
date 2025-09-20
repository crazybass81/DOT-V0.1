#!/bin/bash

# DOT Platform 배포 테스트 스크립트
# GitHub Actions 자동 배포 파이프라인 검증

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 함수 정의
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# 환경 변수 확인
check_env() {
    print_info "환경 변수 확인 중..."

    required_vars=(
        "VERCEL_TOKEN"
        "VERCEL_ORG_ID"
        "VERCEL_PROJECT_ID"
        "EC2_HOST"
        "EC2_USER"
    )

    missing_vars=()
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=($var)
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        print_error "필수 환경 변수가 누락되었습니다: ${missing_vars[*]}"
        echo "docs/deployment-secrets-setup.md를 참고하여 설정하세요."
        exit 1
    fi

    print_success "모든 환경 변수가 설정되었습니다."
}

# Vercel 연결 테스트
test_vercel() {
    print_info "Vercel 연결 테스트 중..."

    # Vercel CLI 설치 확인
    if ! command -v vercel &> /dev/null; then
        print_info "Vercel CLI 설치 중..."
        npm install -g vercel
    fi

    # Vercel 프로젝트 확인
    cd frontend
    if vercel list --token="$VERCEL_TOKEN" &> /dev/null; then
        print_success "Vercel 연결 성공!"
    else
        print_error "Vercel 연결 실패. 토큰을 확인하세요."
        exit 1
    fi
    cd ..
}

# EC2 SSH 연결 테스트
test_ec2() {
    print_info "EC2 SSH 연결 테스트 중..."

    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no \
        "$EC2_USER@$EC2_HOST" "echo 'SSH 연결 성공'" &> /dev/null; then
        print_success "EC2 SSH 연결 성공!"
    else
        print_error "EC2 SSH 연결 실패. SSH 키와 호스트를 확인하세요."
        exit 1
    fi
}

# Docker 상태 확인
test_docker() {
    print_info "EC2 Docker 상태 확인 중..."

    docker_status=$(ssh -o StrictHostKeyChecking=no \
        "$EC2_USER@$EC2_HOST" "docker --version 2>&1" || echo "Docker not found")

    if [[ "$docker_status" == *"Docker version"* ]]; then
        print_success "Docker 설치 확인: $docker_status"
    else
        print_error "Docker가 설치되지 않았습니다."
        print_info "EC2에서 다음 명령을 실행하세요:"
        echo "  sudo apt update && sudo apt install -y docker.io docker-compose"
        exit 1
    fi
}

# GitHub Actions 시뮬레이션
test_github_actions() {
    print_info "GitHub Actions 배포 시뮬레이션..."

    # 현재 브랜치 확인
    current_branch=$(git branch --show-current)
    print_info "현재 브랜치: $current_branch"

    # 변경사항 확인
    if [[ $(git status --porcelain) ]]; then
        print_info "커밋되지 않은 변경사항이 있습니다."
        git status --short
    fi

    # 워크플로우 파일 확인
    workflows=(
        ".github/workflows/frontend-deploy.yml"
        ".github/workflows/backend-deploy.yml"
        ".github/workflows/full-deploy.yml"
    )

    for workflow in "${workflows[@]}"; do
        if [ -f "$workflow" ]; then
            print_success "워크플로우 파일 존재: $workflow"
        else
            print_error "워크플로우 파일 없음: $workflow"
        fi
    done
}

# API 헬스체크
test_api_health() {
    print_info "API 헬스체크 테스트 중..."

    # Backend 헬스체크
    backend_url="http://$EC2_HOST:3001/health"
    backend_response=$(curl -s -o /dev/null -w "%{http_code}" "$backend_url" 2>/dev/null || echo "000")

    if [ "$backend_response" = "200" ]; then
        print_success "Backend API 정상 작동 (HTTP $backend_response)"
    else
        print_error "Backend API 응답 없음 (HTTP $backend_response)"
        print_info "URL: $backend_url"
    fi

    # Frontend 확인 (Vercel)
    if [ -n "$VERCEL_APP_URL" ]; then
        frontend_response=$(curl -s -o /dev/null -w "%{http_code}" "$VERCEL_APP_URL" 2>/dev/null || echo "000")
        if [ "$frontend_response" = "200" ]; then
            print_success "Frontend 정상 작동 (HTTP $frontend_response)"
        else
            print_error "Frontend 응답 없음 (HTTP $frontend_response)"
        fi
    fi
}

# 배포 시뮬레이션
simulate_deployment() {
    print_info "배포 프로세스 시뮬레이션 시작..."

    # 1. 코드 변경 시뮬레이션
    print_info "1. 코드 변경 감지 시뮬레이션..."
    echo "// Deployment test: $(date)" >> frontend/src/test-deploy.js
    echo "// Deployment test: $(date)" >> backend/src/test-deploy.js

    # 2. Git 커밋
    print_info "2. Git 커밋 생성..."
    git add .
    git commit -m "test: 자동 배포 테스트 - $(date +%Y%m%d-%H%M%S)" || true

    # 3. 푸시 시뮬레이션 (dry-run)
    print_info "3. Git push 시뮬레이션 (dry-run)..."
    git push --dry-run origin "$current_branch"

    print_success "배포 시뮬레이션 완료!"
    print_info "실제 배포를 시작하려면 다음 명령을 실행하세요:"
    echo "  git push origin $current_branch"
}

# 정리
cleanup() {
    print_info "테스트 파일 정리 중..."
    rm -f frontend/src/test-deploy.js backend/src/test-deploy.js
    git checkout -- . 2>/dev/null || true
    print_success "정리 완료!"
}

# 메인 실행
main() {
    echo "======================================"
    echo "DOT Platform 자동 배포 테스트"
    echo "======================================"
    echo ""

    # 환경 변수 확인
    check_env

    # 연결 테스트
    test_vercel
    test_ec2
    test_docker

    # GitHub Actions 확인
    test_github_actions

    # API 상태 확인
    test_api_health

    # 배포 시뮬레이션
    read -p "배포 시뮬레이션을 실행하시겠습니까? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        simulate_deployment
    fi

    # 정리
    cleanup

    echo ""
    echo "======================================"
    print_success "모든 테스트 완료!"
    echo "======================================"
    echo ""
    echo "다음 단계:"
    echo "1. GitHub 리포지토리 Settings → Secrets에서 필수 시크릿 설정"
    echo "2. git push origin main 으로 자동 배포 트리거"
    echo "3. GitHub Actions 탭에서 배포 진행 상황 모니터링"
}

# 트랩 설정 (에러 시 정리)
trap cleanup EXIT

# 실행
main "$@"