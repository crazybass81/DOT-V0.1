#!/bin/bash

# DOT Platform 백엔드 헬스체크 스크립트
# API 응답, 데이터베이스 연결, 인증 시스템 등을 종합적으로 검증

set -euo pipefail

# 설정 변수
BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
MAX_RESPONSE_TIME_MS=3000  # 한국어 요구사항: 3초 이내
HEALTH_ENDPOINT="/health"
API_ENDPOINT="/api/v1/health"
AUTH_ENDPOINT="/api/v1/auth/check"

# 색상 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로깅 함수
log_info() {
    echo -e "${GREEN}[백엔드 헬스체크]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[백엔드 경고]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[백엔드 오류]${NC} $1" >&2
}

# HTTP 요청 함수 (응답시간 포함)
make_request() {
    local url="$1"
    local expected_status="${2:-200}"
    local timeout="${3:-10}"

    local start_time=$(date +%s%3N)

    # curl 결과를 변수에 저장 (stderr를 stdout으로 리다이렉트)
    local response=$(curl -s -w "%{http_code}|%{time_total}" \
        --connect-timeout "$timeout" \
        --max-time "$timeout" \
        "$url" 2>/dev/null || echo "000|999.999")

    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))

    # HTTP 상태 코드와 응답 시간 분리
    local http_code=$(echo "$response" | tail -c 13 | cut -d'|' -f1)
    local curl_time=$(echo "$response" | tail -c 13 | cut -d'|' -f2)
    local body=$(echo "$response" | head -c -14)

    # 응답 결과 출력 (전역 변수로 설정)
    HTTP_CODE="$http_code"
    RESPONSE_BODY="$body"
    RESPONSE_TIME="$response_time"
    CURL_TIME="$curl_time"

    return 0
}

# 1. 기본 헬스체크 엔드포인트 검사
check_health_endpoint() {
    log_info "1단계: 기본 헬스체크 엔드포인트 검사"

    make_request "${BACKEND_URL}${HEALTH_ENDPOINT}" 200 10

    if [ "$HTTP_CODE" != "200" ]; then
        log_error "헬스체크 엔드포인트 응답 실패: HTTP $HTTP_CODE"
        return 1
    fi

    if [ "$RESPONSE_TIME" -gt "$MAX_RESPONSE_TIME_MS" ]; then
        log_error "헬스체크 응답시간 초과: ${RESPONSE_TIME}ms > ${MAX_RESPONSE_TIME_MS}ms"
        return 1
    fi

    log_info "헬스체크 엔드포인트 정상 (${RESPONSE_TIME}ms, HTTP $HTTP_CODE)"
    return 0
}

# 2. API 엔드포인트 검사
check_api_endpoint() {
    log_info "2단계: API 헬스체크 엔드포인트 검사"

    make_request "${BACKEND_URL}${API_ENDPOINT}" 200 10

    if [ "$HTTP_CODE" != "200" ]; then
        log_error "API 헬스체크 응답 실패: HTTP $HTTP_CODE"
        return 1
    fi

    # JSON 응답 검증
    if ! echo "$RESPONSE_BODY" | grep -q '"status"'; then
        log_error "API 응답 형식 오류: JSON status 필드 없음"
        return 1
    fi

    if [ "$RESPONSE_TIME" -gt "$MAX_RESPONSE_TIME_MS" ]; then
        log_error "API 응답시간 초과: ${RESPONSE_TIME}ms > ${MAX_RESPONSE_TIME_MS}ms"
        return 1
    fi

    log_info "API 엔드포인트 정상 (${RESPONSE_TIME}ms, HTTP $HTTP_CODE)"
    return 0
}

# 3. 데이터베이스 연결 검사
check_database_connection() {
    log_info "3단계: 데이터베이스 연결 검사"

    make_request "${BACKEND_URL}/api/v1/health/database" 200 15

    if [ "$HTTP_CODE" != "200" ]; then
        log_error "데이터베이스 헬스체크 실패: HTTP $HTTP_CODE"
        if [ "$HTTP_CODE" = "503" ]; then
            log_error "데이터베이스 연결 문제 (Service Unavailable)"
        fi
        return 1
    fi

    # 데이터베이스 응답 내용 검증
    if echo "$RESPONSE_BODY" | grep -q '"database":"connected"'; then
        log_info "데이터베이스 연결 정상 (${RESPONSE_TIME}ms)"
    else
        log_error "데이터베이스 상태 확인 실패: $RESPONSE_BODY"
        return 1
    fi

    return 0
}

# 4. Redis 연결 검사
check_redis_connection() {
    log_info "4단계: Redis 연결 검사"

    make_request "${BACKEND_URL}/api/v1/health/redis" 200 10

    if [ "$HTTP_CODE" != "200" ]; then
        log_error "Redis 헬스체크 실패: HTTP $HTTP_CODE"
        return 1
    fi

    # Redis 응답 내용 검증
    if echo "$RESPONSE_BODY" | grep -q '"redis":"connected"'; then
        log_info "Redis 연결 정상 (${RESPONSE_TIME}ms)"
    else
        log_error "Redis 상태 확인 실패: $RESPONSE_BODY"
        return 1
    fi

    return 0
}

# 5. 인증 시스템 검사
check_auth_system() {
    log_info "5단계: 인증 시스템 검사"

    make_request "${BACKEND_URL}${AUTH_ENDPOINT}" 401 10

    # 인증이 필요한 엔드포인트이므로 401이 정상
    if [ "$HTTP_CODE" != "401" ] && [ "$HTTP_CODE" != "200" ]; then
        log_error "인증 시스템 응답 오류: HTTP $HTTP_CODE (401 또는 200 예상)"
        return 1
    fi

    if [ "$RESPONSE_TIME" -gt "$MAX_RESPONSE_TIME_MS" ]; then
        log_error "인증 시스템 응답시간 초과: ${RESPONSE_TIME}ms"
        return 1
    fi

    log_info "인증 시스템 정상 (${RESPONSE_TIME}ms, HTTP $HTTP_CODE)"
    return 0
}

# 6. 메모리 사용량 검사
check_memory_usage() {
    log_info "6단계: 애플리케이션 메모리 사용량 검사"

    make_request "${BACKEND_URL}/api/v1/health/memory" 200 10

    if [ "$HTTP_CODE" != "200" ]; then
        log_warn "메모리 사용량 정보 조회 실패: HTTP $HTTP_CODE"
        return 0  # 선택적 검사이므로 실패해도 전체는 성공
    fi

    # 메모리 사용량 정보 파싱 시도
    if echo "$RESPONSE_BODY" | grep -q '"memory"'; then
        local memory_info=$(echo "$RESPONSE_BODY" | grep -o '"memory":[^}]*}')
        log_info "메모리 정보: $memory_info"
    else
        log_warn "메모리 정보 파싱 실패"
    fi

    return 0
}

# 7. 한국어 API 응답 검사
check_korean_response() {
    log_info "7단계: 한국어 API 응답 검사"

    make_request "${BACKEND_URL}/api/v1/health?lang=ko" 200 10

    if [ "$HTTP_CODE" != "200" ]; then
        log_error "한국어 API 응답 실패: HTTP $HTTP_CODE"
        return 1
    fi

    # 한국어 메시지 포함 여부 확인
    if echo "$RESPONSE_BODY" | grep -q "정상\|상태\|건강"; then
        log_info "한국어 API 응답 정상"
    else
        log_warn "한국어 메시지 확인 불가: $RESPONSE_BODY"
    fi

    return 0
}

# 메인 헬스체크 실행
main() {
    log_info "=== DOT Platform 백엔드 헬스체크 시작 ==="
    log_info "대상 URL: $BACKEND_URL"

    # 전체 실행 시간 측정
    local total_start_time=$(date +%s%3N)

    # 순차적으로 모든 검사 실행
    if ! check_health_endpoint; then
        exit 1
    fi

    if ! check_api_endpoint; then
        exit 1
    fi

    if ! check_database_connection; then
        exit 1
    fi

    if ! check_redis_connection; then
        exit 1
    fi

    if ! check_auth_system; then
        exit 1
    fi

    # 선택적 검사들 (실패해도 전체 실패하지 않음)
    check_memory_usage
    check_korean_response

    local total_end_time=$(date +%s%3N)
    local total_time=$((total_end_time - total_start_time))

    log_info "=== 모든 핵심 검사 통과 (총 소요시간: ${total_time}ms) ==="

    # 성공 시 최소 정보만 stdout으로 출력 (Docker 로그용)
    echo "백엔드 헬스체크 통과: ${total_time}ms"

    exit 0
}

# 스크립트 실행
main "$@"