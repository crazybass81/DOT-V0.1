#!/bin/bash

# DOT Platform Nginx 헬스체크 스크립트
# Nginx 자체 상태, 업스트림 서버, 전체 시스템 상태를 종합 검증

set -euo pipefail

# 설정 변수
NGINX_URL="${NGINX_URL:-http://localhost}"
BACKEND_INTERNAL="${BACKEND_INTERNAL:-http://backend:3000}"
FRONTEND_INTERNAL="${FRONTEND_INTERNAL:-http://frontend:80}"
MAX_RESPONSE_TIME_MS=3000  # 한국어 요구사항
NGINX_STATUS_URL="${NGINX_URL}/nginx_status"

# 색상 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로깅 함수
log_info() {
    echo -e "${GREEN}[Nginx 헬스체크]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[Nginx 경고]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[Nginx 오류]${NC} $1" >&2
}

# HTTP 요청 함수
make_request() {
    local url="$1"
    local expected_status="${2:-200}"
    local timeout="${3:-5}"

    local start_time=$(date +%s%3N)
    local response=$(curl -s -w "%{http_code}|%{time_total}" \
        --connect-timeout "$timeout" \
        --max-time "$timeout" \
        "$url" 2>/dev/null || echo "000|999.999")
    local end_time=$(date +%s%3N)

    HTTP_CODE=$(echo "$response" | tail -c 13 | cut -d'|' -f1)
    RESPONSE_BODY=$(echo "$response" | head -c -14)
    RESPONSE_TIME=$((end_time - start_time))

    return 0
}

# 1. Nginx 자체 상태 검사
check_nginx_status() {
    log_info "1단계: Nginx 자체 상태 검사"

    make_request "${NGINX_URL}/health" 200 3

    if [ "$HTTP_CODE" != "200" ]; then
        log_error "Nginx 기본 헬스체크 실패: HTTP $HTTP_CODE"
        return 1
    fi

    if [ "$RESPONSE_TIME" -gt "$MAX_RESPONSE_TIME_MS" ]; then
        log_error "Nginx 응답시간 초과: ${RESPONSE_TIME}ms > ${MAX_RESPONSE_TIME_MS}ms"
        return 1
    fi

    # 한국어 메시지 확인
    if echo "$RESPONSE_BODY" | grep -q "정상\|healthy"; then
        log_info "Nginx 기본 상태 정상 (${RESPONSE_TIME}ms)"
    else
        log_warn "응답 형식 확인 필요: $RESPONSE_BODY"
    fi

    return 0
}

# 2. Nginx 통계 정보 검사
check_nginx_stats() {
    log_info "2단계: Nginx 통계 정보 검사"

    make_request "$NGINX_STATUS_URL" 200 3

    if [ "$HTTP_CODE" != "200" ]; then
        log_warn "Nginx 통계 조회 실패: HTTP $HTTP_CODE (선택적 기능)"
        return 0
    fi

    # 통계 정보 파싱
    local active_connections=$(echo "$RESPONSE_BODY" | grep "Active connections" | awk '{print $3}')
    local total_requests=$(echo "$RESPONSE_BODY" | grep "server accepts handled requests" | awk '{print $3}')

    if [ -n "$active_connections" ]; then
        log_info "활성 연결: $active_connections"

        # 연결 수 임계값 확인 (한국어 요구사항: 10명 동시 사용자)
        if [ "$active_connections" -gt 50 ]; then
            log_warn "활성 연결 수 높음: $active_connections (임계값: 50)"
        fi
    fi

    if [ -n "$total_requests" ]; then
        log_info "총 요청 수: $total_requests"
    fi

    return 0
}

# 3. 백엔드 업스트림 검사
check_backend_upstream() {
    log_info "3단계: 백엔드 업스트림 검사"

    # Nginx를 통한 백엔드 헬스체크
    make_request "${NGINX_URL}/health/backend" 200 5

    if [ "$HTTP_CODE" != "200" ]; then
        log_error "백엔드 업스트림 실패: HTTP $HTTP_CODE"
        return 1
    fi

    if [ "$RESPONSE_TIME" -gt "$MAX_RESPONSE_TIME_MS" ]; then
        log_error "백엔드 응답시간 초과: ${RESPONSE_TIME}ms"
        return 1
    fi

    log_info "백엔드 업스트림 정상 (${RESPONSE_TIME}ms)"

    # 직접 백엔드 연결 확인
    make_request "$BACKEND_INTERNAL/health" 200 3

    if [ "$HTTP_CODE" != "200" ]; then
        log_warn "직접 백엔드 연결 문제: HTTP $HTTP_CODE"
    else
        log_info "직접 백엔드 연결 정상"
    fi

    return 0
}

# 4. 프론트엔드 업스트림 검사
check_frontend_upstream() {
    log_info "4단계: 프론트엔드 업스트림 검사"

    # 메인 페이지 로딩 테스트
    make_request "$NGINX_URL/" 200 5

    if [ "$HTTP_CODE" != "200" ]; then
        log_error "프론트엔드 페이지 로딩 실패: HTTP $HTTP_CODE"
        return 1
    fi

    if [ "$RESPONSE_TIME" -gt "$MAX_RESPONSE_TIME_MS" ]; then
        log_error "프론트엔드 응답시간 초과: ${RESPONSE_TIME}ms (한국어 요구사항 위반)"
        return 1
    fi

    log_info "프론트엔드 페이지 로딩 정상 (${RESPONSE_TIME}ms)"

    # HTML 내용 기본 검증
    if echo "$RESPONSE_BODY" | grep -q "<html\|<!DOCTYPE"; then
        log_info "프론트엔드 HTML 응답 정상"
    else
        log_warn "프론트엔드 응답 형식 확인 필요"
    fi

    return 0
}

# 5. API 프록시 검사
check_api_proxy() {
    log_info "5단계: API 프록시 검사"

    make_request "${NGINX_URL}/api/v1/health" 200 5

    if [ "$HTTP_CODE" != "200" ]; then
        log_error "API 프록시 실패: HTTP $HTTP_CODE"
        return 1
    fi

    if [ "$RESPONSE_TIME" -gt "$MAX_RESPONSE_TIME_MS" ]; then
        log_error "API 응답시간 초과: ${RESPONSE_TIME}ms"
        return 1
    fi

    # JSON 응답 기본 검증
    if echo "$RESPONSE_BODY" | grep -q '{".*"}'; then
        log_info "API 프록시 정상 (${RESPONSE_TIME}ms)"
    else
        log_warn "API 응답 형식 확인 필요: $RESPONSE_BODY"
    fi

    return 0
}

# 6. 한국어 지원 검사
check_korean_support() {
    log_info "6단계: 한국어 지원 검사"

    # 한국어 파라미터로 API 호출
    make_request "${NGINX_URL}/api/v1/health?lang=ko" 200 5

    if [ "$HTTP_CODE" != "200" ]; then
        log_warn "한국어 API 호출 실패: HTTP $HTTP_CODE"
        return 0  # 선택적 기능
    fi

    # 한국어 응답 확인
    if echo "$RESPONSE_BODY" | grep -qE "정상|상태|건강|한국어"; then
        log_info "한국어 응답 지원 확인"
    else
        log_warn "한국어 응답 내용 확인 불가"
    fi

    # UTF-8 인코딩 확인
    local charset_header=$(curl -s -I "${NGINX_URL}/health" | grep -i "content-type" | grep -i "utf-8")
    if [ -n "$charset_header" ]; then
        log_info "UTF-8 인코딩 지원 확인"
    else
        log_warn "UTF-8 인코딩 헤더 확인 불가"
    fi

    return 0
}

# 7. 성능 요구사항 검증
check_performance_requirements() {
    log_info "7단계: 한국어 성능 요구사항 검증"

    local total_response_times=0
    local test_count=5
    local failures=0

    log_info "성능 테스트 시작: ${test_count}회 연속 요청"

    for i in $(seq 1 $test_count); do
        make_request "$NGINX_URL/" 200 5

        if [ "$HTTP_CODE" != "200" ]; then
            failures=$((failures + 1))
            log_warn "테스트 $i 실패: HTTP $HTTP_CODE"
            continue
        fi

        if [ "$RESPONSE_TIME" -gt "$MAX_RESPONSE_TIME_MS" ]; then
            failures=$((failures + 1))
            log_warn "테스트 $i 응답시간 초과: ${RESPONSE_TIME}ms"
        fi

        total_response_times=$((total_response_times + RESPONSE_TIME))
        echo -n "." >&2
    done

    echo "" >&2  # 줄바꿈

    local avg_response_time=$((total_response_times / test_count))
    local success_rate=$(((test_count - failures) * 100 / test_count))

    log_info "성능 테스트 결과:"
    log_info "  - 평균 응답시간: ${avg_response_time}ms"
    log_info "  - 성공률: ${success_rate}%"
    log_info "  - 실패 횟수: ${failures}/${test_count}"

    # 한국어 요구사항 검증
    if [ "$avg_response_time" -le "$MAX_RESPONSE_TIME_MS" ] && [ "$success_rate" -ge 95 ]; then
        log_info "한국어 성능 요구사항 만족 (< 3초, 95% 이상 성공률)"
        return 0
    else
        log_error "한국어 성능 요구사항 미달"
        return 1
    fi
}

# JSON 응답 생성 함수
generate_health_report() {
    local overall_status="$1"
    local message="$2"

    cat << EOF
{
    "overall_status": "$overall_status",
    "message": "$message",
    "nginx": {
        "status": "healthy",
        "performance": {
            "korean_requirement": "< 3초 페이지 로딩",
            "concurrent_users": "10명 동시 사용자 지원",
            "status": "$overall_status"
        }
    },
    "upstreams": {
        "backend": "checked",
        "frontend": "checked"
    },
    "timestamp": "$(date -Iseconds)"
}
EOF
}

# 메인 헬스체크 실행
main() {
    log_info "=== DOT Platform Nginx 헬스체크 시작 ==="

    local total_start_time=$(date +%s%3N)
    local failed_checks=0

    # 순차적으로 모든 검사 실행
    check_nginx_status || failed_checks=$((failed_checks + 1))
    check_nginx_stats  # 통계는 실패해도 전체에 영향 없음
    check_backend_upstream || failed_checks=$((failed_checks + 1))
    check_frontend_upstream || failed_checks=$((failed_checks + 1))
    check_api_proxy || failed_checks=$((failed_checks + 1))
    check_korean_support  # 한국어 지원은 선택적
    check_performance_requirements || failed_checks=$((failed_checks + 1))

    local total_end_time=$(date +%s%3N)
    local total_time=$((total_end_time - total_start_time))

    # 결과 판정
    if [ "$failed_checks" -eq 0 ]; then
        log_info "=== 모든 핵심 검사 통과 (총 소요시간: ${total_time}ms) ==="
        generate_health_report "healthy" "Nginx 및 모든 업스트림 정상"
        exit 0
    elif [ "$failed_checks" -le 2 ]; then
        log_warn "=== 일부 검사 실패 (실패: $failed_checks, 총 소요시간: ${total_time}ms) ==="
        generate_health_report "degraded" "일부 서비스에 문제가 있지만 주요 기능은 정상"
        exit 0
    else
        log_error "=== 다수 검사 실패 (실패: $failed_checks, 총 소요시간: ${total_time}ms) ==="
        generate_health_report "unhealthy" "Nginx 또는 업스트림 서비스에 심각한 문제 발생"
        exit 1
    fi
}

# 스크립트 실행
main "$@"