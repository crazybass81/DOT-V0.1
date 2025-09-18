#!/bin/bash

# DOT Platform 배포 스크립트
# Production 환경 배포 자동화

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 설정 변수
REGISTRY="your-registry.com"  # Docker 레지스트리 주소
PROJECT_NAME="dot-platform"
VERSION=${1:-"latest"}
ENVIRONMENT=${2:-"production"}

# 배포 모드 설정
DEPLOY_MODE="docker-compose"  # docker-compose, kubernetes, single-server

# 헬프 메시지
show_help() {
    cat << EOF
DOT Platform 배포 스크립트 (검증 통합 버전)

사용법: $0 [버전] [환경]

매개변수:
    버전     Docker 이미지 태그 (기본: latest)
    환경     배포 환경 (기본: production)

옵션:
    -h, --help      이 도움말 표시
    -t, --test      테스트 모드로 실행 (실제 배포 없음)
    -r, --rollback  이전 버전으로 롤백
    -s, --status    현재 배포 상태 확인

배포 검증 환경 변수:
    VALIDATION_MODE                검증 모드 (health, smoke, functional, performance, full)
                                  기본값: full
    VALIDATION_TIMEOUT             검증 타임아웃 (초)
                                  기본값: 300
    SKIP_VALIDATION               검증 건너뛰기 (true/false)
                                  기본값: false
    ROLLBACK_ON_VALIDATION_FAILURE 검증 실패 시 자동 롤백 (true/false)
                                  기본값: true

예제:
    $0                                      # latest 버전으로 full 검증 배포
    $0 v1.2.3 staging                      # v1.2.3 버전으로 staging 배포
    VALIDATION_MODE=smoke $0 v1.2.4         # smoke 테스트만으로 빠른 배포
    SKIP_VALIDATION=true $0 v1.2.5          # 검증 없이 배포 (권장하지 않음)
    $0 --rollback                           # 이전 버전으로 롤백

검증 단계 설명:
    health      - 기본 시스템 헬스체크 (60초)
    smoke       - 핵심 기능 스모크 테스트 (180초)
    functional  - 전체 기능 테스트 (300초)
    performance - 성능 및 로드 테스트 (한국어 요구사항 검증)
    full        - 모든 검증 (헬스체크, 성능, 기능, 접근성, 다국어)
EOF
}

# 환경 변수 확인
check_environment() {
    log_step "환경 설정 확인"

    # 필수 환경 변수 확인
    local required_vars=(
        "DATABASE_URL"
        "REDIS_URL"
        "JWT_SECRET"
        "SESSION_SECRET"
    )

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            log_error "필수 환경 변수가 설정되지 않았습니다: $var"
            exit 1
        fi
    done

    log_info "환경 변수 확인 완료"
}

# Docker 이미지 빌드
build_images() {
    log_step "Docker 이미지 빌드"

    # 백엔드 이미지 빌드
    log_info "백엔드 이미지 빌드 중..."
    docker build \
        -f Dockerfile.backend \
        -t ${PROJECT_NAME}-backend:${VERSION} \
        .

    # 프론트엔드 이미지 빌드
    log_info "프론트엔드 이미지 빌드 중..."
    docker build \
        -f Dockerfile.frontend \
        -t ${PROJECT_NAME}-frontend:${VERSION} \
        .

    log_info "이미지 빌드 완료"
}

# 이미지 태깅 및 푸시
push_images() {
    if [[ "$REGISTRY" != "your-registry.com" ]]; then
        log_step "Docker 이미지 푸시"

        # 백엔드 이미지
        docker tag ${PROJECT_NAME}-backend:${VERSION} ${REGISTRY}/${PROJECT_NAME}-backend:${VERSION}
        docker push ${REGISTRY}/${PROJECT_NAME}-backend:${VERSION}

        # 프론트엔드 이미지
        docker tag ${PROJECT_NAME}-frontend:${VERSION} ${REGISTRY}/${PROJECT_NAME}-frontend:${VERSION}
        docker push ${REGISTRY}/${PROJECT_NAME}-frontend:${VERSION}

        log_info "이미지 푸시 완료"
    else
        log_warn "Docker 레지스트리가 설정되지 않아 로컬에서만 사용합니다"
    fi
}

# 데이터베이스 마이그레이션
run_migrations() {
    log_step "데이터베이스 마이그레이션 실행"

    # 마이그레이션 컨테이너 실행
    docker run --rm \
        --env-file .env.production \
        --network dot-platform_default \
        ${PROJECT_NAME}-backend:${VERSION} \
        npm run migrate

    log_info "마이그레이션 완료"
}

# 헬스체크 실행
health_check() {
    log_step "서비스 헬스체크"

    local max_attempts=30
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        log_info "헬스체크 시도 $attempt/$max_attempts"

        # 백엔드 헬스체크
        if curl -f http://localhost:3000/health > /dev/null 2>&1; then
            log_info "백엔드 서비스가 정상입니다"
            backend_healthy=true
        else
            backend_healthy=false
        fi

        # 프론트엔드 헬스체크
        if curl -f http://localhost:80/health > /dev/null 2>&1; then
            log_info "프론트엔드 서비스가 정상입니다"
            frontend_healthy=true
        else
            frontend_healthy=false
        fi

        if [[ "$backend_healthy" == true && "$frontend_healthy" == true ]]; then
            log_info "모든 서비스가 정상 상태입니다"
            return 0
        fi

        sleep 10
        ((attempt++))
    done

    log_error "헬스체크 실패: 서비스가 정상적으로 시작되지 않았습니다"
    return 1
}

# 배포 검증 실행 (새로 추가됨)
run_deployment_validation() {
    log_step "배포 검증 실행 (DOT Platform 검증 인프라)"

    # 검증 옵션 설정
    local validation_mode="${VALIDATION_MODE:-full}"
    local validation_timeout="${VALIDATION_TIMEOUT:-300}"
    local skip_validation="${SKIP_VALIDATION:-false}"

    if [[ "$skip_validation" == "true" ]]; then
        log_warn "배포 검증을 건너뜁니다 (SKIP_VALIDATION=true)"
        return 0
    fi

    log_info "검증 모드: $validation_mode (타임아웃: ${validation_timeout}초)"

    # 1. 기본 시스템 검증
    log_info "1단계: 기본 시스템 검증 실행"
    if ! ./scripts/validate-deployment.sh --mode health --timeout 60; then
        log_error "기본 시스템 검증 실패"
        return 1
    fi

    # 2. 성능 검증 (한국어 요구사항)
    log_info "2단계: 성능 검증 실행 (< 3초, 10명 동시 사용자)"
    if ! ./scripts/performance-validation.sh --target http://localhost --users 10 --duration 120; then
        log_error "성능 검증 실패 - 한국어 요구사항 미달"
        return 1
    fi

    # 3. 기능 검증 (스모크 테스트)
    if [[ "$validation_mode" == "full" || "$validation_mode" == "functional" ]]; then
        log_info "3단계: 기능 검증 실행 (스모크 테스트)"
        if ! ./scripts/validate-deployment.sh --mode smoke --timeout 180; then
            log_error "기능 검증 실패"
            return 1
        fi
    fi

    # 4. 접근성 및 다국어 검증
    if [[ "$validation_mode" == "full" ]]; then
        log_info "4단계: 접근성 및 다국어 검증 실행"

        # 접근성 검증
        if ! node tests/deployment/accessibility/a11y-check.js --url http://localhost --timeout 60; then
            log_warn "접근성 검증 실패 (경고로 처리)"
        fi

        # 다국어 검증
        if ! node tests/deployment/i18n/language-check.js --url http://localhost --languages ko,en,ja,zh; then
            log_warn "다국어 검증 실패 (경고로 처리)"
        fi
    fi

    # 5. K6 로드 테스트 (실제 부하 검증)
    if [[ "$validation_mode" == "full" || "$validation_mode" == "performance" ]]; then
        log_info "5단계: K6 로드 테스트 실행"
        if ! ./scripts/run-k6-tests.sh --url http://localhost --vus 10 --duration 2m; then
            log_error "K6 로드 테스트 실패"
            return 1
        fi
    fi

    # 6. 전체 검증 결과 리포트 생성
    log_info "6단계: 검증 결과 리포트 생성"
    local validation_report="./validation-reports/deploy-$(date +%Y%m%d_%H%M%S).json"

    if command -v ./scripts/generate-validation-report.sh &> /dev/null; then
        ./scripts/generate-validation-report.sh --output "$validation_report" --format json
    fi

    log_info "배포 검증 완료! 리포트: $validation_report"
    return 0
}

# Docker Compose 배포
deploy_with_compose() {
    log_step "Docker Compose로 배포"

    # 환경 변수 파일 확인
    if [[ ! -f ".env.production" ]]; then
        log_error ".env.production 파일이 없습니다"
        exit 1
    fi

    # 기존 서비스 중지 (무중단 배포를 위해 선택적)
    log_info "서비스 업데이트 중..."

    # 이미지 버전 업데이트
    export BACKEND_IMAGE="${PROJECT_NAME}-backend:${VERSION}"
    export FRONTEND_IMAGE="${PROJECT_NAME}-frontend:${VERSION}"

    # 서비스 재시작
    docker-compose -f docker-compose.prod.yml up -d --force-recreate

    log_info "Docker Compose 배포 완료"
}

# Kubernetes 배포 (추후 구현)
deploy_with_kubernetes() {
    log_step "Kubernetes로 배포"
    log_warn "Kubernetes 배포는 아직 구현되지 않았습니다"
}

# 백업 생성
create_backup() {
    log_step "배포 전 백업 생성"

    local backup_name="backup_$(date +%Y%m%d_%H%M%S)"

    # 데이터베이스 백업
    docker exec dot-platform_postgres_1 pg_dump -U postgres dot_platform > "${backup_name}.sql"

    # 업로드된 파일 백업 (있는 경우)
    if [[ -d "./uploads" ]]; then
        tar -czf "${backup_name}_uploads.tar.gz" ./uploads
    fi

    log_info "백업 생성 완료: ${backup_name}"
}

# 롤백 실행
rollback() {
    log_step "이전 버전으로 롤백"

    # 이전 버전 확인
    local previous_version
    previous_version=$(docker images --format "table {{.Tag}}" ${PROJECT_NAME}-backend | grep -v "TAG\|latest" | head -1)

    if [[ -z "$previous_version" ]]; then
        log_error "롤백할 이전 버전을 찾을 수 없습니다"
        exit 1
    fi

    log_info "이전 버전으로 롤백: $previous_version"

    # 이전 버전으로 배포
    VERSION="$previous_version"
    deploy_with_compose

    log_info "롤백 완료"
}

# 검증 실패 시 롤백 (새로 추가됨)
rollback_on_failure() {
    log_step "검증 실패로 인한 롤백 실행"

    # 이전 버전 확인
    local previous_version
    previous_version=$(docker images --format "table {{.Tag}}" ${PROJECT_NAME}-backend | grep -v "TAG\|latest\|$VERSION" | head -1)

    if [[ -z "$previous_version" ]]; then
        log_error "롤백할 이전 버전을 찾을 수 없습니다"
        log_error "현재 서비스는 계속 실행되지만 검증 요구사항을 만족하지 않습니다"
        return 1
    fi

    log_warn "검증 실패: $VERSION → $previous_version 으로 롤백합니다"

    # 이전 버전으로 롤백
    VERSION="$previous_version"
    export BACKEND_IMAGE="${PROJECT_NAME}-backend:${VERSION}"
    export FRONTEND_IMAGE="${PROJECT_NAME}-frontend:${VERSION}"

    # 서비스 재시작
    docker-compose -f docker-compose.prod.yml up -d --force-recreate

    # 롤백 후 검증
    if health_check; then
        log_info "롤백 후 헬스체크 통과"

        # 롤백된 버전에 대한 기본 검증
        if ./scripts/validate-deployment.sh --mode health --timeout 60; then
            log_info "롤백 완료: 이전 버전이 정상적으로 작동합니다"
            send_notification "롤백 성공" "버전 $previous_version 으로 롤백 완료"
        else
            log_error "롤백된 버전도 검증 실패"
            send_notification "롤백 실패" "이전 버전도 검증 실패"
        fi
    else
        log_error "롤백 후 헬스체크 실패"
        send_notification "롤백 실패" "롤백 후에도 서비스 장애"
    fi

    return 0
}

# 배포 상태 확인
check_status() {
    log_step "배포 상태 확인"

    # 실행 중인 컨테이너 확인
    log_info "실행 중인 서비스:"
    docker-compose -f docker-compose.prod.yml ps

    # 로그 확인
    log_info "최근 로그:"
    docker-compose -f docker-compose.prod.yml logs --tail=20

    # 리소스 사용량 확인
    log_info "리소스 사용량:"
    docker stats --no-stream
}

# 클린업
cleanup() {
    log_step "정리 작업"

    # 사용하지 않는 이미지 정리
    docker image prune -f

    # 사용하지 않는 컨테이너 정리
    docker container prune -f

    log_info "정리 작업 완료"
}

# 알림 전송 (Slack, 이메일 등)
send_notification() {
    local status=$1
    local message=$2

    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚀 DOT Platform 배포 $status: $message\"}" \
            "$SLACK_WEBHOOK_URL"
    fi

    log_info "배포 알림 전송: $status"
}

# 메인 배포 함수
main() {
    local start_time=$(date +%s)

    log_info "DOT Platform 배포 시작 (버전: $VERSION, 환경: $ENVIRONMENT)"

    # 환경 확인
    check_environment

    # 백업 생성
    create_backup

    # 이미지 빌드
    build_images

    # 이미지 푸시
    push_images

    # 배포 실행
    case "$DEPLOY_MODE" in
        "docker-compose")
            deploy_with_compose
            ;;
        "kubernetes")
            deploy_with_kubernetes
            ;;
        *)
            log_error "지원되지 않는 배포 모드: $DEPLOY_MODE"
            exit 1
            ;;
    esac

    # 마이그레이션 실행
    run_migrations

    # 헬스체크
    if health_check; then
        log_info "기본 헬스체크 통과"
    else
        log_error "배포 실패: 헬스체크 실패"
        send_notification "실패" "버전 $VERSION 헬스체크 실패"
        exit 1
    fi

    # 배포 검증 실행
    if run_deployment_validation; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        log_info "배포 및 검증 성공! (소요 시간: ${duration}초)"
        send_notification "성공" "버전 $VERSION 배포 및 검증 완료 (${duration}초)"
    else
        log_error "배포 실패: 검증 단계 실패"
        log_warn "서비스는 실행 중이지만 검증 요구사항을 만족하지 않습니다"
        send_notification "경고" "버전 $VERSION 배포됨, 검증 실패"

        # 검증 실패 시 롤백 여부 결정
        if [[ "${ROLLBACK_ON_VALIDATION_FAILURE:-true}" == "true" ]]; then
            log_warn "검증 실패로 인한 자동 롤백을 시작합니다..."
            rollback_on_failure
            exit 1
        else
            log_warn "검증 실패했지만 롤백하지 않습니다 (ROLLBACK_ON_VALIDATION_FAILURE=false)"
            exit 2  # 다른 종료 코드로 구분
        fi
    fi

    # 정리 작업
    cleanup
}

# 명령행 인수 처리
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    -t|--test)
        log_info "테스트 모드 실행"
        DRY_RUN=true
        main
        ;;
    -r|--rollback)
        rollback
        ;;
    -s|--status)
        check_status
        ;;
    *)
        main
        ;;
esac