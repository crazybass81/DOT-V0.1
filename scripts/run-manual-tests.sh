#!/bin/bash

# DOT Platform 배포 검증 매뉴얼 테스트 자동 실행 스크립트
# 버전: 1.0.0
# 작성일: 2025-09-18

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

log_phase() {
    echo -e "${PURPLE}[단계]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# 전역 변수
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_LOG_FILE="$PROJECT_ROOT/logs/manual-tests/test-$(date '+%Y%m%d-%H%M%S').log"
MANUAL_TEST_RESULTS_DIR="$PROJECT_ROOT/tests/results"

# 디렉토리 생성
mkdir -p "$(dirname "$TEST_LOG_FILE")"
mkdir -p "$MANUAL_TEST_RESULTS_DIR"

# 도움말 표시
show_help() {
    cat << EOF
DOT Platform 배포 검증 매뉴얼 테스트 자동 실행 스크립트

사용법: $0 [옵션] [단계]

단계:
    all                   모든 테스트 단계 실행 (기본값)
    phase1               기본 배포 검증
    phase2               검증 스크립트 테스트
    phase3               성능 벤치마크 테스트
    phase4               리포팅 시스템 테스트
    phase5               통합 시나리오 테스트
    phase6               한국어 지원 검증
    phase7               보안 및 접근성 검증

옵션:
    -h, --help           이 도움말 표시
    --skip-setup         초기 설정 단계 건너뛰기
    --continue-on-error  오류 시에도 계속 진행
    --quick              빠른 테스트 (성능 테스트 시간 단축)
    --verbose            상세 로그 출력
    --dry-run            실제 실행 없이 계획만 표시

환경 변수:
    MANUAL_TEST_TIMEOUT    각 테스트 단계별 타임아웃 (초, 기본: 600)
    QUICK_TEST_MODE        빠른 테스트 모드 (true/false)
    CONTINUE_ON_ERROR      오류 시 계속 진행 (true/false)

예제:
    $0                                    # 모든 테스트 실행
    $0 phase3                            # 성능 벤치마크만 실행
    $0 --quick all                       # 빠른 모드로 모든 테스트 실행
    $0 --continue-on-error phase2        # 오류 무시하고 검증 스크립트 테스트

로그 파일: $TEST_LOG_FILE
EOF
}

# 설정 변수
TIMEOUT="${MANUAL_TEST_TIMEOUT:-600}"
SKIP_SETUP=false
CONTINUE_ON_ERROR=false
QUICK_MODE=false
VERBOSE=false
DRY_RUN=false
TARGET_PHASE="all"

# 명령행 인수 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --skip-setup)
            SKIP_SETUP=true
            shift
            ;;
        --continue-on-error)
            CONTINUE_ON_ERROR=true
            shift
            ;;
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        phase1|phase2|phase3|phase4|phase5|phase6|phase7|all)
            TARGET_PHASE="$1"
            shift
            ;;
        *)
            log_error "알 수 없는 옵션: $1"
            show_help
            exit 1
            ;;
    esac
done

# 테스트 시작 헤더
print_header() {
    echo "========================================"
    log_info "DOT Platform 배포 검증 매뉴얼 테스트 시작"
    log_info "테스트 ID: manual-test-$(date '+%Y%m%d-%H%M%S')"
    log_info "실행 모드: ${TARGET_PHASE}"
    log_info "로그 파일: $TEST_LOG_FILE"
    echo "========================================"
}

# 명령어 실행 함수
execute_command() {
    local cmd="$1"
    local description="$2"
    local timeout="${3:-$TIMEOUT}"

    log_phase "$description"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] 실행 예정: $cmd"
        return 0
    fi

    if [[ "$VERBOSE" == "true" ]]; then
        log_info "실행 명령어: $cmd"
    fi

    local start_time=$(date +%s)

    # 명령어 실행 (타임아웃 적용)
    if timeout "$timeout" bash -c "$cmd" 2>&1 | tee -a "$TEST_LOG_FILE"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log_success "$description 완료 (소요시간: ${duration}초)"
        return 0
    else
        local exit_code=$?
        log_error "$description 실패 (종료 코드: $exit_code)"

        if [[ "$CONTINUE_ON_ERROR" == "true" ]]; then
            log_warning "오류를 무시하고 계속 진행합니다"
            return 0
        else
            return $exit_code
        fi
    fi
}

# Phase 1: 기본 배포 검증
run_phase1() {
    log_phase "Phase 1: 기본 배포 검증 시작"

    # 스크립트 실행 권한 확인
    execute_command "find $PROJECT_ROOT/scripts/ -name '*.sh' -exec chmod +x {} \\;" "스크립트 실행 권한 설정"
    execute_command "find $PROJECT_ROOT/scripts/ -name '*.sh' -exec bash -n {} \\;" "스크립트 구문 검사"

    # Docker 환경 확인
    execute_command "docker --version && docker-compose --version" "Docker 환경 확인"
    execute_command "docker ps" "Docker 서비스 상태 확인"

    # 기본 배포 실행
    if [[ -f "$PROJECT_ROOT/scripts/deploy.sh" ]]; then
        execute_command "$PROJECT_ROOT/scripts/deploy.sh" "DOT Platform 배포" 900
    else
        log_warning "deploy.sh 스크립트를 찾을 수 없습니다"
    fi

    log_success "Phase 1 완료"
}

# Phase 2: 검증 스크립트 테스트
run_phase2() {
    log_phase "Phase 2: 검증 스크립트 테스트 시작"

    # 시스템 검증
    if [[ -f "$PROJECT_ROOT/scripts/validate-system.sh" ]]; then
        execute_command "$PROJECT_ROOT/scripts/validate-system.sh" "시스템 검증"
    fi

    # 배포 검증
    if [[ -f "$PROJECT_ROOT/scripts/validate-deployment.sh" ]]; then
        execute_command "$PROJECT_ROOT/scripts/validate-deployment.sh" "배포 검증"
    fi

    # 한국어 요구사항 검증
    if [[ -f "$PROJECT_ROOT/scripts/validate-korean-requirements.sh" ]]; then
        execute_command "$PROJECT_ROOT/scripts/validate-korean-requirements.sh" "한국어 요구사항 검증"
    fi

    log_success "Phase 2 완료"
}

# Phase 3: 성능 벤치마크 테스트
run_phase3() {
    log_phase "Phase 3: 성능 벤치마크 테스트 시작"

    if [[ -f "$PROJECT_ROOT/scripts/benchmark-performance.sh" ]]; then
        # K6 설치 및 환경 설정
        execute_command "$PROJECT_ROOT/scripts/benchmark-performance.sh setup" "벤치마크 환경 설정"

        # 한국어 요구사항 벤치마크
        local duration_opt=""
        if [[ "$QUICK_MODE" == "true" ]]; then
            duration_opt="--duration 60"
            log_info "빠른 모드: 벤치마크 시간을 60초로 단축"
        fi

        execute_command "$PROJECT_ROOT/scripts/benchmark-performance.sh korean-requirements $duration_opt" "한국어 요구사항 벤치마크" 1200

        # 로드 테스트 (빠른 모드가 아닐 때만)
        if [[ "$QUICK_MODE" != "true" ]]; then
            execute_command "$PROJECT_ROOT/scripts/benchmark-performance.sh load-test --duration 300" "로드 테스트" 900
        fi
    else
        log_warning "benchmark-performance.sh 스크립트를 찾을 수 없습니다"
    fi

    log_success "Phase 3 완료"
}

# Phase 4: 리포팅 시스템 테스트
run_phase4() {
    log_phase "Phase 4: 리포팅 시스템 테스트 시작"

    if [[ -f "$PROJECT_ROOT/scripts/generate-report.sh" ]]; then
        # 검증 결과 리포트 생성
        execute_command "$PROJECT_ROOT/scripts/generate-report.sh --format all" "검증 결과 리포트 생성"

        # 리포트 파일 확인
        execute_command "ls -la $PROJECT_ROOT/reports/" "리포트 파일 목록 확인"
    else
        log_warning "generate-report.sh 스크립트를 찾을 수 없습니다"
    fi

    # 알림 시스템 테스트
    if [[ -f "$PROJECT_ROOT/scripts/validate-deployment.sh" ]]; then
        execute_command "$PROJECT_ROOT/scripts/validate-deployment.sh --force-alert" "강제 알림 생성 테스트"
        execute_command "ls -la $PROJECT_ROOT/logs/alerts/" "알림 로그 확인"
    fi

    log_success "Phase 4 완료"
}

# Phase 5: 통합 시나리오 테스트
run_phase5() {
    log_phase "Phase 5: 통합 시나리오 테스트 시작"

    # 전체 파이프라인 순차 실행
    local scripts=(
        "scripts/validate-system.sh:시스템 검증"
        "scripts/validate-deployment.sh:배포 검증"
        "scripts/validate-korean-requirements.sh:한국어 요구사항 검증"
    )

    for script_info in "${scripts[@]}"; do
        IFS=':' read -r script_path description <<< "$script_info"
        local full_path="$PROJECT_ROOT/$script_path"

        if [[ -f "$full_path" ]]; then
            execute_command "$full_path" "통합 테스트: $description"
        else
            log_warning "스크립트를 찾을 수 없습니다: $script_path"
        fi
    done

    # 실패 시나리오 테스트 (Docker Compose 사용 시)
    if command -v docker-compose &> /dev/null; then
        log_info "실패 시나리오 테스트 시작"

        # 서비스 중단 후 검증
        execute_command "docker-compose stop dot-backend 2>/dev/null || true" "백엔드 서비스 중단"
        execute_command "$PROJECT_ROOT/scripts/validate-deployment.sh || true" "서비스 중단 상태 검증"
        execute_command "docker-compose start dot-backend 2>/dev/null || true" "백엔드 서비스 재시작"

        # 복구 후 검증
        sleep 10
        execute_command "$PROJECT_ROOT/scripts/validate-deployment.sh" "서비스 복구 후 검증"
    fi

    log_success "Phase 5 완료"
}

# Phase 6: 한국어 지원 검증
run_phase6() {
    log_phase "Phase 6: 한국어 지원 검증 시작"

    # UTF-8 인코딩 테스트
    execute_command "curl -s -H 'Accept-Language: ko-KR' http://localhost/api/health || echo '서버 응답 없음'" "한국어 API 응답 테스트"
    execute_command "grep -r '한국어' $PROJECT_ROOT/logs/ | head -5 || echo '한국어 로그 없음'" "로그 파일 한국어 인코딩 확인"

    # 다국어 지원 테스트
    local languages=("en-US:영어" "ja-JP:일본어" "zh-CN:중국어")
    for lang_info in "${languages[@]}"; do
        IFS=':' read -r lang_code lang_name <<< "$lang_info"
        execute_command "curl -s -H 'Accept-Language: $lang_code' http://localhost/api/health || echo '${lang_name} 응답 없음'" "${lang_name} API 응답 테스트"
    done

    log_success "Phase 6 완료"
}

# Phase 7: 보안 및 접근성 검증
run_phase7() {
    log_phase "Phase 7: 보안 및 접근성 검증 시작"

    # 기본 보안 검증
    execute_command "netstat -tlnp | grep -E '(3000|5432|6379)' || echo '포트 확인 완료'" "포트 노출 상태 확인"

    if command -v docker-compose &> /dev/null; then
        execute_command "docker-compose config | grep -E '(POSTGRES_PASSWORD|REDIS_PASSWORD)' || echo '패스워드 설정 확인 완료'" "기본 인증 정보 확인"
    fi

    # SSL/TLS 설정 확인 (운영환경)
    execute_command "curl -I https://localhost 2>/dev/null || echo 'HTTPS 설정 없음 (개발환경)'" "HTTPS 설정 확인"

    log_success "Phase 7 완료"
}

# 모든 단계 실행
run_all_phases() {
    log_info "모든 테스트 단계를 순차적으로 실행합니다"

    if [[ "$SKIP_SETUP" != "true" ]]; then
        run_phase1
    fi

    run_phase2
    run_phase3
    run_phase4
    run_phase5
    run_phase6
    run_phase7
}

# 테스트 결과 요약
generate_test_summary() {
    local test_end_time=$(date '+%Y-%m-%d %H:%M:%S')
    local summary_file="$MANUAL_TEST_RESULTS_DIR/test-summary-$(date '+%Y%m%d-%H%M%S').json"

    cat > "$summary_file" << EOF
{
    "test_execution": {
        "start_time": "$(date '+%Y-%m-%d %H:%M:%S')",
        "end_time": "$test_end_time",
        "target_phase": "$TARGET_PHASE",
        "mode": {
            "quick_mode": $QUICK_MODE,
            "continue_on_error": $CONTINUE_ON_ERROR,
            "skip_setup": $SKIP_SETUP,
            "dry_run": $DRY_RUN
        }
    },
    "log_file": "$TEST_LOG_FILE",
    "summary_file": "$summary_file"
}
EOF

    log_info "테스트 요약 파일 생성: $summary_file"
}

# 메인 실행 함수
main() {
    print_header

    # 로그 파일에 시작 시간 기록
    echo "테스트 시작: $(date '+%Y-%m-%d %H:%M:%S')" > "$TEST_LOG_FILE"

    case "$TARGET_PHASE" in
        all)
            run_all_phases
            ;;
        phase1)
            run_phase1
            ;;
        phase2)
            run_phase2
            ;;
        phase3)
            run_phase3
            ;;
        phase4)
            run_phase4
            ;;
        phase5)
            run_phase5
            ;;
        phase6)
            run_phase6
            ;;
        phase7)
            run_phase7
            ;;
        *)
            log_error "알 수 없는 단계: $TARGET_PHASE"
            show_help
            exit 1
            ;;
    esac

    generate_test_summary

    echo "========================================"
    log_success "DOT Platform 배포 검증 매뉴얼 테스트 완료"
    log_info "상세 로그: $TEST_LOG_FILE"
    log_info "테스트 결과: $MANUAL_TEST_RESULTS_DIR/"
    echo "========================================"
}

# 스크립트 시작점
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi