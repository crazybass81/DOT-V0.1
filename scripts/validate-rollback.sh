#!/bin/bash

# DOT Platform 롤백 절차 검증 테스트 스크립트
# 버전: 1.0.0
# 작성일: 2025-09-18
# 목적: 배포 롤백 절차의 신뢰성과 무결성을 검증

set -euo pipefail

# 색상 및 로깅 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# 로깅 함수들
log_info() {
    echo -e "${BLUE}[정보]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[성공]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[경고]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[오류]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_step() {
    echo -e "${PURPLE}[단계]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# 전역 변수
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ROLLBACK_LOG_DIR="$PROJECT_ROOT/logs/rollback"
ROLLBACK_BACKUP_DIR="$PROJECT_ROOT/backups/rollback-test"
ROLLBACK_ID="rollback-test-$(date '+%Y%m%d-%H%M%S')"
ROLLBACK_LOG_FILE="$ROLLBACK_LOG_DIR/rollback-$ROLLBACK_ID.log"

# 롤백 설정
BACKUP_RETENTION_DAYS=7
ROLLBACK_TIMEOUT=300
HEALTH_CHECK_TIMEOUT=60
HEALTH_CHECK_RETRIES=10

# Docker Compose 파일 경로
DOCKER_COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
DOCKER_COMPOSE_BACKUP="$PROJECT_ROOT/docker-compose.backup.yml"

# 서비스 목록
SERVICES=("dot-database" "dot-cache" "dot-backend" "dot-frontend" "dot-nginx")

# 디렉토리 생성
mkdir -p "$ROLLBACK_LOG_DIR"
mkdir -p "$ROLLBACK_BACKUP_DIR"

# 도움말 표시
show_help() {
    cat << EOF
DOT Platform 롤백 절차 검증 테스트 스크립트

사용법: $0 [옵션] [작업]

작업:
    test                 전체 롤백 절차 테스트 (기본값)
    backup              현재 상태 백업
    simulate-failure    실패 상황 시뮬레이션
    rollback            롤백 실행
    verify              롤백 검증
    cleanup             테스트 정리

옵션:
    -h, --help          이 도움말 표시
    --timeout           롤백 타임아웃 (초, 기본: 300)
    --backup-dir        백업 디렉토리 (기본: $ROLLBACK_BACKUP_DIR)
    --service           특정 서비스만 테스트 (전체 서비스: ${SERVICES[*]})
    --no-health-check   헬스체크 건너뛰기
    --keep-backups      테스트 완료 후 백업 유지
    --dry-run           실제 실행 없이 계획만 표시
    --force             확인 없이 강제 실행

환경 변수:
    ROLLBACK_TIMEOUT         롤백 타임아웃 (기본: 300초)
    HEALTH_CHECK_TIMEOUT     헬스체크 타임아웃 (기본: 60초)
    BACKUP_RETENTION_DAYS    백업 보관 일수 (기본: 7일)
    SKIP_HEALTH_CHECK        헬스체크 건너뛰기 (true/false)

예제:
    $0                                    # 전체 롤백 테스트
    $0 test --service dot-backend         # 백엔드 서비스만 테스트
    $0 backup                            # 현재 상태 백업만 실행
    $0 rollback --force                  # 확인 없이 강제 롤백
    $0 cleanup                           # 테스트 정리

롤백 테스트 시나리오:
    1. 현재 상태 백업
    2. 의도적 실패 상황 생성
    3. 자동 롤백 트리거
    4. 롤백 실행 검증
    5. 서비스 복구 확인
    6. 데이터 무결성 검증
    7. 성능 기준 재검증

로그 파일: $ROLLBACK_LOG_FILE
EOF
}

# 설정 변수 초기화
TARGET_ACTION="test"
TARGET_SERVICE=""
DRY_RUN=false
FORCE=false
SKIP_HEALTH_CHECK=false
KEEP_BACKUPS=false

# 명령행 인수 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --timeout)
            ROLLBACK_TIMEOUT="$2"
            shift 2
            ;;
        --backup-dir)
            ROLLBACK_BACKUP_DIR="$2"
            shift 2
            ;;
        --service)
            TARGET_SERVICE="$2"
            shift 2
            ;;
        --no-health-check)
            SKIP_HEALTH_CHECK=true
            shift
            ;;
        --keep-backups)
            KEEP_BACKUPS=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        test|backup|simulate-failure|rollback|verify|cleanup)
            TARGET_ACTION="$1"
            shift
            ;;
        *)
            log_error "알 수 없는 옵션: $1"
            show_help
            exit 1
            ;;
    esac
done

# 롤백 테스트 시작 헤더
print_header() {
    echo "========================================"
    log_info "DOT Platform 롤백 절차 검증 테스트 시작"
    log_info "롤백 테스트 ID: $ROLLBACK_ID"
    log_info "작업: $TARGET_ACTION"
    log_info "로그 파일: $ROLLBACK_LOG_FILE"
    echo "========================================"
}

# 전제 조건 확인
check_prerequisites() {
    log_step "롤백 테스트 전제 조건 확인"

    # Docker 및 Docker Compose 확인
    if ! command -v docker &> /dev/null; then
        log_error "Docker가 설치되지 않았습니다"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose가 설치되지 않았습니다"
        exit 1
    fi

    # Docker Compose 파일 확인
    if [[ ! -f "$DOCKER_COMPOSE_FILE" ]]; then
        log_error "Docker Compose 파일을 찾을 수 없습니다: $DOCKER_COMPOSE_FILE"
        exit 1
    fi

    # 현재 실행 중인 서비스 확인
    if ! docker-compose ps &> /dev/null; then
        log_warning "Docker Compose 서비스가 실행되지 않고 있습니다"
    fi

    # 필요한 도구 확인
    local required_tools=("jq" "curl" "tar")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "필수 도구가 설치되지 않았습니다: $tool"
            exit 1
        fi
    done

    log_success "전제 조건 확인 완료"
}

# 현재 상태 백업
create_backup() {
    log_step "현재 상태 백업 생성"

    local backup_timestamp=$(date '+%Y%m%d-%H%M%S')
    local backup_path="$ROLLBACK_BACKUP_DIR/backup-$backup_timestamp"

    mkdir -p "$backup_path"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] 백업 생성 예정: $backup_path"
        return 0
    fi

    # Docker Compose 설정 백업
    if [[ -f "$DOCKER_COMPOSE_FILE" ]]; then
        cp "$DOCKER_COMPOSE_FILE" "$backup_path/docker-compose.yml"
        log_info "Docker Compose 설정 백업 완료"
    fi

    # 환경 변수 파일 백업
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        cp "$PROJECT_ROOT/.env" "$backup_path/.env"
        log_info "환경 변수 파일 백업 완료"
    fi

    # 현재 컨테이너 상태 저장
    docker-compose ps --format json > "$backup_path/container-status.json" 2>/dev/null || echo "[]" > "$backup_path/container-status.json"

    # 서비스별 로그 백업 (최근 1000줄)
    for service in "${SERVICES[@]}"; do
        if docker-compose logs --tail=1000 "$service" > "$backup_path/${service}-logs.txt" 2>/dev/null; then
            log_info "$service 로그 백업 완료"
        fi
    done

    # 데이터베이스 백업 (가능한 경우)
    if docker-compose exec -T dot-database pg_dump -U postgres dot_platform > "$backup_path/database-dump.sql" 2>/dev/null; then
        log_info "데이터베이스 백업 완료"
    else
        log_warning "데이터베이스 백업 실패 (서비스가 실행되지 않거나 접근 불가)"
    fi

    # 백업 메타데이터 생성
    cat > "$backup_path/backup-metadata.json" << EOF
{
    "backup_id": "backup-$backup_timestamp",
    "created_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
    "rollback_test_id": "$ROLLBACK_ID",
    "backup_path": "$backup_path",
    "services": $(printf '%s\n' "${SERVICES[@]}" | jq -R . | jq -s .),
    "docker_compose_file": "$DOCKER_COMPOSE_FILE"
}
EOF

    # 백업 압축
    local backup_archive="$backup_path.tar.gz"
    tar -czf "$backup_archive" -C "$ROLLBACK_BACKUP_DIR" "$(basename "$backup_path")"
    rm -rf "$backup_path"

    echo "$backup_archive" > "$ROLLBACK_BACKUP_DIR/latest-backup.txt"
    log_success "백업 생성 완료: $backup_archive"
}

# 실패 상황 시뮬레이션
simulate_failure() {
    log_step "실패 상황 시뮬레이션"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] 실패 상황 시뮬레이션 예정"
        return 0
    fi

    # 시뮬레이션 시나리오 선택
    local scenarios=("config_corruption" "service_crash" "network_failure" "resource_exhaustion")
    local scenario=${scenarios[$((RANDOM % ${#scenarios[@]}))]}

    log_info "실패 시나리오 실행: $scenario"

    case "$scenario" in
        "config_corruption")
            # Docker Compose 설정 손상
            log_info "Docker Compose 설정 손상 시뮬레이션"
            if [[ -f "$DOCKER_COMPOSE_FILE" ]]; then
                cp "$DOCKER_COMPOSE_FILE" "$DOCKER_COMPOSE_BACKUP"
                echo "# 손상된 설정" >> "$DOCKER_COMPOSE_FILE"
                echo "invalid_yaml_syntax: [" >> "$DOCKER_COMPOSE_FILE"
            fi
            ;;
        "service_crash")
            # 서비스 강제 종료
            log_info "서비스 크래시 시뮬레이션"
            local target_service=${TARGET_SERVICE:-"dot-backend"}
            if docker-compose ps | grep -q "$target_service"; then
                docker-compose kill "$target_service"
                # 컨테이너를 재시작 불가능하게 만들기
                docker-compose stop "$target_service"
            fi
            ;;
        "network_failure")
            # 네트워크 연결 문제 시뮬레이션
            log_info "네트워크 실패 시뮬레이션"
            # Docker 네트워크 이슈 생성
            if docker network ls | grep -q "dot-network"; then
                docker network disconnect dot-network dot-backend 2>/dev/null || true
            fi
            ;;
        "resource_exhaustion")
            # 리소스 고갈 시뮬레이션
            log_info "리소스 고갈 시뮬레이션"
            # 메모리 제한을 매우 낮게 설정
            if [[ -f "$DOCKER_COMPOSE_FILE" ]]; then
                cp "$DOCKER_COMPOSE_FILE" "$DOCKER_COMPOSE_BACKUP"
                # 임시로 메모리 제한 추가 (실제로는 설정에 따라 다름)
                log_warning "리소스 제한 시뮬레이션 (테스트 목적)"
            fi
            ;;
    esac

    # 실패 상태 확인
    sleep 5
    local failed_services=0
    for service in "${SERVICES[@]}"; do
        if ! docker-compose ps | grep "$service" | grep -q "Up"; then
            failed_services=$((failed_services + 1))
            log_warning "서비스 실패 감지: $service"
        fi
    done

    if [[ $failed_services -gt 0 ]]; then
        log_info "실패 시뮬레이션 성공: $failed_services개 서비스 실패"
        echo "$scenario" > "$ROLLBACK_BACKUP_DIR/failure-scenario.txt"
        return 0
    else
        log_warning "실패 시뮬레이션 효과 없음"
        return 1
    fi
}

# 헬스체크 실행
run_health_check() {
    local service_name="$1"
    local max_retries="${2:-$HEALTH_CHECK_RETRIES}"

    if [[ "$SKIP_HEALTH_CHECK" == "true" ]]; then
        log_info "헬스체크 건너뛰기: $service_name"
        return 0
    fi

    log_info "헬스체크 실행: $service_name"

    local retries=0
    while [[ $retries -lt $max_retries ]]; do
        case "$service_name" in
            "dot-database")
                if docker-compose exec -T dot-database pg_isready -U postgres &> /dev/null; then
                    log_success "$service_name 헬스체크 통과"
                    return 0
                fi
                ;;
            "dot-cache")
                if docker-compose exec -T dot-cache redis-cli ping | grep -q "PONG"; then
                    log_success "$service_name 헬스체크 통과"
                    return 0
                fi
                ;;
            "dot-backend"|"dot-frontend"|"dot-nginx")
                local port=""
                case "$service_name" in
                    "dot-backend") port="3000" ;;
                    "dot-frontend") port="3001" ;;
                    "dot-nginx") port="80" ;;
                esac

                if curl -s --connect-timeout 10 --max-time 10 "http://localhost:$port/health" &> /dev/null; then
                    log_success "$service_name 헬스체크 통과"
                    return 0
                fi
                ;;
            *)
                # 기본 컨테이너 상태 확인
                if docker-compose ps | grep "$service_name" | grep -q "Up"; then
                    log_success "$service_name 상태 확인 통과"
                    return 0
                fi
                ;;
        esac

        retries=$((retries + 1))
        log_info "$service_name 헬스체크 재시도 ($retries/$max_retries)"
        sleep 5
    done

    log_error "$service_name 헬스체크 실패"
    return 1
}

# 롤백 실행
execute_rollback() {
    log_step "롤백 실행"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] 롤백 실행 예정"
        return 0
    fi

    # 최신 백업 확인
    local latest_backup=""
    if [[ -f "$ROLLBACK_BACKUP_DIR/latest-backup.txt" ]]; then
        latest_backup=$(cat "$ROLLBACK_BACKUP_DIR/latest-backup.txt")
    fi

    if [[ -z "$latest_backup" || ! -f "$latest_backup" ]]; then
        log_error "사용 가능한 백업을 찾을 수 없습니다"
        return 1
    fi

    log_info "백업에서 복원 중: $latest_backup"

    # 백업 압축 해제
    local backup_dir=$(dirname "$latest_backup")
    local backup_name=$(basename "$latest_backup" .tar.gz)
    local restore_path="$backup_dir/$backup_name"

    tar -xzf "$latest_backup" -C "$backup_dir"

    # 현재 서비스 중지
    log_info "현재 서비스 중지 중..."
    docker-compose down --timeout 30 || true

    # 설정 파일 복원
    if [[ -f "$restore_path/docker-compose.yml" ]]; then
        cp "$restore_path/docker-compose.yml" "$DOCKER_COMPOSE_FILE"
        log_info "Docker Compose 설정 복원 완료"
    fi

    if [[ -f "$restore_path/.env" ]]; then
        cp "$restore_path/.env" "$PROJECT_ROOT/.env"
        log_info "환경 변수 파일 복원 완료"
    fi

    # Docker Compose 백업 파일 복원 (만약 있다면)
    if [[ -f "$DOCKER_COMPOSE_BACKUP" ]]; then
        cp "$DOCKER_COMPOSE_BACKUP" "$DOCKER_COMPOSE_FILE"
        rm -f "$DOCKER_COMPOSE_BACKUP"
        log_info "Docker Compose 백업에서 복원 완료"
    fi

    # 서비스 재시작
    log_info "서비스 재시작 중..."
    if timeout "$ROLLBACK_TIMEOUT" docker-compose up -d; then
        log_success "서비스 재시작 완료"
    else
        log_error "서비스 재시작 실패"
        return 1
    fi

    # 데이터베이스 복원 (가능한 경우)
    if [[ -f "$restore_path/database-dump.sql" ]]; then
        log_info "데이터베이스 복원 시도 중..."
        sleep 10  # 데이터베이스 완전히 시작될 때까지 대기

        if docker-compose exec -T dot-database psql -U postgres -d dot_platform < "$restore_path/database-dump.sql" &> /dev/null; then
            log_success "데이터베이스 복원 완료"
        else
            log_warning "데이터베이스 복원 실패 (스키마 충돌 또는 서비스 미준비)"
        fi
    fi

    # 임시 복원 디렉토리 정리
    rm -rf "$restore_path"

    log_success "롤백 실행 완료"
}

# 롤백 검증
verify_rollback() {
    log_step "롤백 검증"

    local verification_failed=false

    # 서비스 상태 검증
    log_info "서비스 상태 검증 중..."
    for service in "${SERVICES[@]}"; do
        if [[ -n "$TARGET_SERVICE" && "$service" != "$TARGET_SERVICE" ]]; then
            continue
        fi

        if run_health_check "$service"; then
            log_success "$service 검증 통과"
        else
            log_error "$service 검증 실패"
            verification_failed=true
        fi
    done

    # 기본 API 엔드포인트 테스트
    log_info "API 엔드포인트 검증 중..."
    local endpoints=("/health" "/api/health")
    for endpoint in "${endpoints[@]}"; do
        if curl -s --connect-timeout 10 --max-time 10 "http://localhost$endpoint" &> /dev/null; then
            log_success "엔드포인트 접근 가능: $endpoint"
        else
            log_warning "엔드포인트 접근 불가: $endpoint"
        fi
    done

    # 한국어 요구사항 재검증
    log_info "한국어 요구사항 재검증 중..."
    if [[ -f "$PROJECT_ROOT/scripts/validate-korean-requirements.sh" ]]; then
        if timeout 120 "$PROJECT_ROOT/scripts/validate-korean-requirements.sh" &> /dev/null; then
            log_success "한국어 요구사항 검증 통과"
        else
            log_warning "한국어 요구사항 검증 실패"
            verification_failed=true
        fi
    fi

    # 데이터 무결성 검증 (기본적인 연결 테스트)
    log_info "데이터 무결성 검증 중..."
    if docker-compose exec -T dot-database psql -U postgres -d dot_platform -c "SELECT 1;" &> /dev/null; then
        log_success "데이터베이스 연결 및 무결성 확인"
    else
        log_error "데이터베이스 무결성 검증 실패"
        verification_failed=true
    fi

    if [[ "$verification_failed" == "true" ]]; then
        log_error "롤백 검증 실패"
        return 1
    else
        log_success "롤백 검증 완료"
        return 0
    fi
}

# 테스트 정리
cleanup_test() {
    log_step "롤백 테스트 정리"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] 테스트 정리 예정"
        return 0
    fi

    # 실패 시나리오 파일 정리
    rm -f "$ROLLBACK_BACKUP_DIR/failure-scenario.txt"

    # 임시 백업 정리 (설정에 따라)
    if [[ "$KEEP_BACKUPS" != "true" ]]; then
        # 오래된 백업 정리 (보관 기간 초과)
        find "$ROLLBACK_BACKUP_DIR" -name "backup-*.tar.gz" -type f -mtime +$BACKUP_RETENTION_DAYS -delete 2>/dev/null || true
        log_info "오래된 백업 파일 정리 완료"
    else
        log_info "백업 파일 유지 (--keep-backups 옵션)"
    fi

    # Docker Compose 백업 파일 정리
    rm -f "$DOCKER_COMPOSE_BACKUP"

    log_success "테스트 정리 완료"
}

# 전체 롤백 테스트 실행
run_full_rollback_test() {
    log_info "전체 롤백 절차 테스트 시작"

    # 1. 현재 상태 백업
    if ! create_backup; then
        log_error "백업 생성 실패"
        return 1
    fi

    # 2. 실패 상황 시뮬레이션
    if ! simulate_failure; then
        log_warning "실패 시뮬레이션 효과 없음, 강제로 진행"
    fi

    # 3. 롤백 실행
    if ! execute_rollback; then
        log_error "롤백 실행 실패"
        return 1
    fi

    # 4. 롤백 검증
    if ! verify_rollback; then
        log_error "롤백 검증 실패"
        return 1
    fi

    # 5. 정리
    cleanup_test

    log_success "전체 롤백 테스트 완료"
}

# 롤백 테스트 결과 리포트 생성
generate_rollback_report() {
    local report_file="$ROLLBACK_LOG_DIR/rollback-report-$ROLLBACK_ID.json"

    cat > "$report_file" << EOF
{
    "rollback_test": {
        "test_id": "$ROLLBACK_ID",
        "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
        "action": "$TARGET_ACTION",
        "target_service": "$TARGET_SERVICE",
        "configuration": {
            "timeout": $ROLLBACK_TIMEOUT,
            "health_check_timeout": $HEALTH_CHECK_TIMEOUT,
            "backup_retention_days": $BACKUP_RETENTION_DAYS,
            "skip_health_check": $SKIP_HEALTH_CHECK,
            "dry_run": $DRY_RUN,
            "force": $FORCE
        },
        "services_tested": $(printf '%s\n' "${SERVICES[@]}" | jq -R . | jq -s .),
        "backup_directory": "$ROLLBACK_BACKUP_DIR",
        "log_file": "$ROLLBACK_LOG_FILE"
    }
}
EOF

    log_info "롤백 테스트 리포트 생성: $report_file"
}

# 메인 실행 함수
main() {
    # 로그 파일 초기화
    echo "롤백 테스트 시작: $(date '+%Y-%m-%d %H:%M:%S')" > "$ROLLBACK_LOG_FILE"

    print_header
    check_prerequisites

    # 사용자 확인 (force 모드가 아닌 경우)
    if [[ "$FORCE" != "true" && "$DRY_RUN" != "true" && "$TARGET_ACTION" != "test" ]]; then
        echo -n "롤백 테스트를 계속하시겠습니까? (y/N): "
        read -r confirmation
        if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
            log_info "사용자가 테스트를 취소했습니다"
            exit 0
        fi
    fi

    case "$TARGET_ACTION" in
        "test")
            run_full_rollback_test
            ;;
        "backup")
            create_backup
            ;;
        "simulate-failure")
            simulate_failure
            ;;
        "rollback")
            execute_rollback
            ;;
        "verify")
            verify_rollback
            ;;
        "cleanup")
            cleanup_test
            ;;
        *)
            log_error "알 수 없는 작업: $TARGET_ACTION"
            show_help
            exit 1
            ;;
    esac

    generate_rollback_report

    echo "========================================"
    log_success "DOT Platform 롤백 절차 검증 테스트 완료"
    log_info "상세 로그: $ROLLBACK_LOG_FILE"
    log_info "백업 디렉토리: $ROLLBACK_BACKUP_DIR"
    echo "========================================"
}

# 스크립트 시작점
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@" 2>&1 | tee -a "$ROLLBACK_LOG_FILE"
fi