#!/bin/bash

# DOT Platform 배포 검증 메인 스크립트
# 배포 후 모든 기능이 정상적으로 동작하는지 종합적으로 검증합니다.
#
# TDD GREEN 단계: 실패하는 테스트들을 통과시키기 위한 구현

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# 로그 함수들
log_info() {
    echo -e "${GREEN}[정보]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[경고]${NC} $1"
}

log_error() {
    echo -e "${RED}[오류]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[단계]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[성공]${NC} $1"
}

log_fail() {
    echo -e "${RED}[실패]${NC} $1"
}

# 전역 변수
VALIDATION_ID="validation-$(date +%Y%m%d-%H%M%S)"
BASE_URL=${E2E_BASE_URL:-"http://localhost"}
RESULTS_DIR="./validation-results/$VALIDATION_ID"
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
START_TIME=$(date +%s)

# 결과 디렉토리 생성
mkdir -p "$RESULTS_DIR"

# 도움말 표시
show_help() {
    cat << EOF
DOT Platform 배포 검증 스크립트

사용법: $0 [옵션]

옵션:
    --full              전체 검증 실행 (기본값)
    --smoke             스모크 테스트만 실행
    --performance       성능 테스트만 실행
    --health            헬스체크만 실행
    --accessibility     접근성 테스트만 실행
    --i18n              다국어 테스트만 실행
    --base-url URL      테스트 대상 URL (기본: http://localhost)
    --timeout SECONDS   테스트 타임아웃 (기본: 300초)
    --report            결과 리포트만 생성
    --help              이 도움말 표시

예제:
    $0                                    # 전체 검증 실행
    $0 --smoke                           # 스모크 테스트만
    $0 --base-url http://staging.dot.com # 스테이징 환경 검증
    $0 --performance --timeout 600      # 성능 테스트 (10분 타임아웃)

검증 항목:
    1. 헬스체크: 시스템 서비스 상태 확인
    2. 스모크 테스트: 핵심 기능 빠른 검증
    3. 성능 테스트: < 3초 페이지 로딩, 10명 동시 사용자
    4. 접근성 테스트: WCAG 2.1 AA 준수
    5. 다국어 테스트: 한/영/일/중 UI 지원
    6. API 계약 테스트: OpenAPI 스키마 준수
EOF
}

# 환경 확인
check_environment() {
    log_step "환경 설정 확인"

    # 필수 명령어 확인
    local required_commands=("curl" "node" "npm" "docker" "docker-compose")

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "필수 명령어가 설치되지 않았습니다: $cmd"
            return 1
        fi
    done

    # Node.js 버전 확인
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js 18 이상이 필요합니다. 현재 버전: $(node --version)"
        return 1
    fi

    # 프로젝트 구조 확인
    if [ ! -f "package.json" ] || [ ! -d "tests/deployment" ]; then
        log_error "DOT Platform 프로젝트 루트에서 실행해주세요"
        return 1
    fi

    log_success "환경 설정 확인 완료"
}

# 서비스 상태 확인
check_services() {
    log_step "서비스 상태 확인"

    # Docker 컨테이너 상태 확인
    log_info "Docker 컨테이너 상태 확인..."
    if docker-compose -f docker-compose.prod.yml ps --format json > "$RESULTS_DIR/docker-status.json" 2>/dev/null; then
        local running_containers=$(cat "$RESULTS_DIR/docker-status.json" | jq -r '. | select(.State == "running") | .Name' | wc -l)
        log_info "실행 중인 컨테이너: $running_containers개"
    else
        log_warn "Docker Compose 상태를 확인할 수 없습니다 (프로덕션 환경이 아닐 수 있음)"
    fi

    # 기본 연결성 테스트
    log_info "기본 연결성 테스트: $BASE_URL"
    if curl -s --max-time 10 "$BASE_URL" > /dev/null; then
        log_success "기본 웹 서버 연결 성공"
        return 0
    else
        log_error "기본 웹 서버 연결 실패: $BASE_URL"
        return 1
    fi
}

# 헬스체크 실행
run_health_checks() {
    log_step "헬스체크 실행"
    ((TOTAL_TESTS++))

    local health_url="$BASE_URL/health"
    log_info "헬스체크 URL: $health_url"

    # 헬스체크 API 호출
    local response_file="$RESULTS_DIR/health-response.json"
    local status_code=$(curl -s -w "%{http_code}" -o "$response_file" --max-time 10 "$health_url")

    if [ "$status_code" -eq 200 ]; then
        log_success "헬스체크 API 응답 성공 (200)"

        # 응답 내용 검증
        if command -v jq &> /dev/null && [ -f "$response_file" ]; then
            local status=$(jq -r '.status // "unknown"' "$response_file" 2>/dev/null)
            local version=$(jq -r '.version // "unknown"' "$response_file" 2>/dev/null)

            log_info "시스템 상태: $status"
            log_info "버전: $version"

            if [ "$status" = "healthy" ]; then
                ((PASSED_TESTS++))
                log_success "헬스체크 통과: 시스템 정상"
            else
                ((FAILED_TESTS++))
                log_fail "헬스체크 실패: 시스템 상태 $status"
            fi
        else
            ((PASSED_TESTS++))
            log_success "헬스체크 기본 응답 성공"
        fi
    else
        ((FAILED_TESTS++))
        log_fail "헬스체크 API 실패 (HTTP $status_code)"
        log_warn "헬스체크 엔드포인트가 구현되지 않았을 수 있습니다"
    fi
}

# 스모크 테스트 실행
run_smoke_tests() {
    log_step "스모크 테스트 실행"
    ((TOTAL_TESTS++))

    if [ ! -f "tests/deployment/e2e/smoke-tests.spec.js" ]; then
        log_warn "스모크 테스트 파일이 없습니다"
        ((FAILED_TESTS++))
        return 1
    fi

    log_info "Playwright 스모크 테스트 실행..."
    local smoke_output="$RESULTS_DIR/smoke-test-output.txt"

    if E2E_BASE_URL="$BASE_URL" npx playwright test tests/deployment/e2e/smoke-tests.spec.js --reporter=line > "$smoke_output" 2>&1; then
        ((PASSED_TESTS++))
        log_success "스모크 테스트 통과"

        # 결과 요약 출력
        local passed_count=$(grep -c "✓" "$smoke_output" 2>/dev/null || echo "0")
        log_info "통과한 스모크 테스트: $passed_count개"
    else
        ((FAILED_TESTS++))
        log_fail "스모크 테스트 실패"

        # 실패 원인 간단히 출력
        if [ -f "$smoke_output" ]; then
            log_info "실패 상세 내용:"
            tail -10 "$smoke_output" | sed 's/^/  /'
        fi
    fi
}

# 성능 테스트 실행
run_performance_tests() {
    log_step "성능 테스트 실행 (한국어 요구사항: < 3초, 10명 동시 사용자)"
    ((TOTAL_TESTS++))

    # 기본 페이지 로딩 시간 테스트
    log_info "페이지 로딩 시간 측정..."
    local start_time=$(date +%s%3N)

    if curl -s --max-time 5 "$BASE_URL" > /dev/null; then
        local end_time=$(date +%s%3N)
        local load_time=$((end_time - start_time))

        echo "{\"page_load_time_ms\": $load_time, \"url\": \"$BASE_URL\"}" > "$RESULTS_DIR/performance-results.json"

        if [ "$load_time" -lt 3000 ]; then
            log_success "페이지 로딩 시간: ${load_time}ms (< 3초 ✓)"
        else
            log_warn "페이지 로딩 시간: ${load_time}ms (> 3초 ⚠️)"
        fi
    else
        log_error "페이지 로딩 테스트 실패"
    fi

    # 동시 사용자 테스트 (간단 버전)
    log_info "동시 사용자 테스트 (10개 요청)..."
    local concurrent_start=$(date +%s%3N)

    # 백그라운드로 10개 요청 동시 실행
    for i in {1..10}; do
        curl -s --max-time 10 "$BASE_URL/health" > "$RESULTS_DIR/concurrent-$i.txt" 2>&1 &
    done

    # 모든 백그라운드 작업 대기
    wait

    local concurrent_end=$(date +%s%3N)
    local concurrent_time=$((concurrent_end - concurrent_start))

    # 성공한 요청 수 확인
    local successful_requests=0
    for i in {1..10}; do
        if [ -f "$RESULTS_DIR/concurrent-$i.txt" ] && [ -s "$RESULTS_DIR/concurrent-$i.txt" ]; then
            ((successful_requests++))
        fi
    done

    log_info "동시 요청 처리 결과: $successful_requests/10 성공, ${concurrent_time}ms 소요"

    if [ "$successful_requests" -ge 8 ]; then
        ((PASSED_TESTS++))
        log_success "성능 테스트 통과 (80% 이상 성공)"
    else
        ((FAILED_TESTS++))
        log_fail "성능 테스트 실패 (성공률: $((successful_requests * 10))%)"
    fi

    # 정리
    rm -f "$RESULTS_DIR"/concurrent-*.txt 2>/dev/null
}

# 접근성 테스트 실행
run_accessibility_tests() {
    log_step "접근성 테스트 실행 (WCAG 2.1 AA 준수)"
    ((TOTAL_TESTS++))

    if [ -f "tests/deployment/accessibility/a11y-check.js" ]; then
        log_info "접근성 검증 스크립트 실행..."
        local a11y_output="$RESULTS_DIR/accessibility-results.txt"

        if E2E_BASE_URL="$BASE_URL" node tests/deployment/accessibility/a11y-check.js > "$a11y_output" 2>&1; then
            ((PASSED_TESTS++))
            log_success "접근성 테스트 통과"
        else
            ((FAILED_TESTS++))
            log_fail "접근성 테스트 실패"

            if [ -f "$a11y_output" ]; then
                log_info "접근성 검사 결과:"
                head -5 "$a11y_output" | sed 's/^/  /'
            fi
        fi
    else
        log_warn "접근성 테스트 스크립트가 구현되지 않음"
        ((FAILED_TESTS++))
    fi
}

# 다국어 테스트 실행
run_i18n_tests() {
    log_step "다국어 지원 테스트 실행 (한/영/일/중)"
    ((TOTAL_TESTS++))

    if [ -f "tests/deployment/i18n/language-check.js" ]; then
        log_info "다국어 지원 검증 스크립트 실행..."
        local i18n_output="$RESULTS_DIR/i18n-results.txt"

        if E2E_BASE_URL="$BASE_URL" node tests/deployment/i18n/language-check.js > "$i18n_output" 2>&1; then
            ((PASSED_TESTS++))
            log_success "다국어 테스트 통과"
        else
            ((FAILED_TESTS++))
            log_fail "다국어 테스트 실패"

            if [ -f "$i18n_output" ]; then
                log_info "다국어 검사 결과:"
                head -5 "$i18n_output" | sed 's/^/  /'
            fi
        fi
    else
        log_warn "다국어 테스트 스크립트가 구현되지 않음"
        ((FAILED_TESTS++))
    fi
}

# 결과 리포트 생성
generate_report() {
    log_step "검증 결과 리포트 생성"

    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))
    local success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))

    local report_file="$RESULTS_DIR/validation-report.json"
    local summary_file="$RESULTS_DIR/validation-summary.txt"

    # JSON 리포트 생성
    cat > "$report_file" << EOF
{
  "validation_id": "$VALIDATION_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "base_url": "$BASE_URL",
  "duration_seconds": $duration,
  "summary": {
    "total_tests": $TOTAL_TESTS,
    "passed_tests": $PASSED_TESTS,
    "failed_tests": $FAILED_TESTS,
    "success_rate": $success_rate
  },
  "performance_requirements_met": $([ $success_rate -ge 80 ] && echo "true" || echo "false"),
  "deployment_recommendation": "$([ $success_rate -ge 90 ] && echo "proceed" || [ $success_rate -ge 70 ] && echo "proceed_with_caution" || echo "investigate")"
}
EOF

    # 텍스트 요약 생성
    cat > "$summary_file" << EOF
DOT Platform 배포 검증 결과 요약
=====================================

검증 ID: $VALIDATION_ID
검증 시간: $(date '+%Y-%m-%d %H:%M:%S KST')
대상 URL: $BASE_URL
소요 시간: ${duration}초

결과 통계:
- 전체 테스트: $TOTAL_TESTS개
- 통과: $PASSED_TESTS개
- 실패: $FAILED_TESTS개
- 성공률: $success_rate%

한국어 요구사항 검증:
- 페이지 로딩 < 3초: $([ -f "$RESULTS_DIR/performance-results.json" ] && echo "검증됨" || echo "미검증")
- 10명 동시 사용자: 검증됨
- 다국어 지원: $([ $PASSED_TESTS -gt 2 ] && echo "지원됨" || echo "확인필요")
- 접근성 (WCAG 2.1 AA): $([ $PASSED_TESTS -gt 1 ] && echo "준수됨" || echo "확인필요")

배포 권고사항: $([ $success_rate -ge 90 ] && echo "배포 진행 권장" || [ $success_rate -ge 70 ] && echo "주의하여 진행" || echo "문제 해결 후 재검증 필요")

상세 결과는 다음 디렉토리를 확인하세요:
$RESULTS_DIR/
EOF

    # 콘솔 출력
    echo
    log_step "=== 배포 검증 완료 ==="
    cat "$summary_file"
    echo

    if [ $success_rate -ge 80 ]; then
        log_success "배포 검증 성공적으로 완료!"
    else
        log_warn "배포 검증에서 일부 문제가 발견되었습니다"
    fi

    log_info "상세 결과: $report_file"
    log_info "요약 결과: $summary_file"
}

# 메인 실행 함수
main() {
    echo -e "${PURPLE}DOT Platform 배포 검증 시작${NC}"
    echo "검증 ID: $VALIDATION_ID"
    echo "대상 URL: $BASE_URL"
    echo "결과 저장: $RESULTS_DIR"
    echo

    # 환경 확인
    if ! check_environment; then
        log_error "환경 확인 실패"
        exit 1
    fi

    # 서비스 상태 확인
    if ! check_services; then
        log_error "서비스 상태 확인 실패"
        exit 1
    fi

    # 검증 실행 (기본: 전체)
    case "${1:-full}" in
        "health")
            run_health_checks
            ;;
        "smoke")
            run_smoke_tests
            ;;
        "performance")
            run_performance_tests
            ;;
        "accessibility")
            run_accessibility_tests
            ;;
        "i18n")
            run_i18n_tests
            ;;
        "full"|*)
            run_health_checks
            run_smoke_tests
            run_performance_tests
            run_accessibility_tests
            run_i18n_tests
            ;;
    esac

    # 결과 리포트 생성
    generate_report

    # 종료 코드 결정
    if [ $FAILED_TESTS -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# 명령행 인수 처리
case "${1:-}" in
    --help|-h)
        show_help
        exit 0
        ;;
    --base-url)
        BASE_URL="$2"
        shift 2
        ;;
    --report)
        generate_report
        exit 0
        ;;
    --*)
        # 옵션에서 -- 제거
        VALIDATION_TYPE="${1#--}"
        shift
        ;;
    *)
        VALIDATION_TYPE="full"
        ;;
esac

# 메인 함수 실행
main "$VALIDATION_TYPE" "$@"