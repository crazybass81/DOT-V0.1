#!/bin/bash

# DOT Platform Redis 헬스체크 스크립트
# 연결성, 읽기/쓰기, 메모리 사용량을 종합적으로 검증

set -euo pipefail

# 설정 변수
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
MAX_RESPONSE_TIME_MS=1000  # Redis는 빠른 응답 필요
MAX_MEMORY_USAGE_PERCENT=85  # 메모리 사용률 임계값
TEST_KEY="healthcheck:$(date +%s)"

# 색상 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로깅 함수
log_info() {
    echo -e "${GREEN}[Redis 헬스체크]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[Redis 경고]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[Redis 오류]${NC} $1" >&2
}

# Redis CLI 명령 실행 함수
redis_cmd() {
    if [ -n "$REDIS_PASSWORD" ]; then
        redis-cli -a "$REDIS_PASSWORD" --no-auth-warning "$@"
    else
        redis-cli "$@"
    fi
}

# 1. 기본 연결성 검사
check_connection() {
    log_info "1단계: Redis 연결성 검사"

    local start_time=$(date +%s%3N)
    local result=$(redis_cmd ping 2>/dev/null || echo "FAILED")
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))

    if [ "$result" != "PONG" ]; then
        log_error "Redis 연결 실패: $result"
        return 1
    fi

    if [ $response_time -gt $MAX_RESPONSE_TIME_MS ]; then
        log_error "연결 응답시간 초과: ${response_time}ms > ${MAX_RESPONSE_TIME_MS}ms"
        return 1
    fi

    log_info "연결 성공 (${response_time}ms)"
    return 0
}

# 2. 읽기/쓰기 성능 검사
check_read_write_performance() {
    log_info "2단계: 읽기/쓰기 성능 검사"

    local test_value="health_check_$(date +%s%3N)"

    # 쓰기 테스트
    local start_time=$(date +%s%3N)
    local write_result=$(redis_cmd set "$TEST_KEY" "$test_value" EX 60 2>/dev/null || echo "FAILED")
    local write_end_time=$(date +%s%3N)
    local write_time=$((write_end_time - start_time))

    if [ "$write_result" != "OK" ]; then
        log_error "쓰기 테스트 실패: $write_result"
        return 1
    fi

    # 읽기 테스트
    local read_start_time=$(date +%s%3N)
    local read_result=$(redis_cmd get "$TEST_KEY" 2>/dev/null || echo "FAILED")
    local read_end_time=$(date +%s%3N)
    local read_time=$((read_end_time - read_start_time))

    if [ "$read_result" != "$test_value" ]; then
        log_error "읽기 테스트 실패: 예상 '$test_value', 실제 '$read_result'"
        return 1
    fi

    # 삭제 테스트
    redis_cmd del "$TEST_KEY" >/dev/null 2>&1

    local total_rw_time=$((write_time + read_time))

    if [ $total_rw_time -gt $MAX_RESPONSE_TIME_MS ]; then
        log_error "읽기/쓰기 응답시간 초과: ${total_rw_time}ms"
        return 1
    fi

    log_info "읽기/쓰기 성능 정상 (쓰기: ${write_time}ms, 읽기: ${read_time}ms)"
    return 0
}

# 3. 메모리 사용량 검사
check_memory_usage() {
    log_info "3단계: 메모리 사용량 검사"

    local memory_info=$(redis_cmd info memory 2>/dev/null | grep -E "used_memory:|maxmemory:")

    local used_memory=$(echo "$memory_info" | grep "used_memory:" | head -1 | cut -d: -f2 | tr -d '\r')
    local max_memory=$(echo "$memory_info" | grep "maxmemory:" | cut -d: -f2 | tr -d '\r')

    if [ "$max_memory" = "0" ]; then
        log_info "메모리 제한 없음 (used: $(($used_memory / 1024 / 1024))MB)"
        return 0
    fi

    local usage_percent=$((used_memory * 100 / max_memory))

    if [ $usage_percent -gt $MAX_MEMORY_USAGE_PERCENT ]; then
        log_error "메모리 사용률 초과: ${usage_percent}% > ${MAX_MEMORY_USAGE_PERCENT}%"
        return 1
    elif [ $usage_percent -gt 70 ]; then
        log_warn "메모리 사용률 높음: ${usage_percent}%"
    else
        log_info "메모리 사용률: ${usage_percent}% ($(($used_memory / 1024 / 1024))MB / $(($max_memory / 1024 / 1024))MB)"
    fi

    return 0
}

# 4. 연결 수 검사
check_connected_clients() {
    log_info "4단계: 클라이언트 연결 수 검사"

    local clients_info=$(redis_cmd info clients 2>/dev/null | grep "connected_clients:")
    local connected_clients=$(echo "$clients_info" | cut -d: -f2 | tr -d '\r')

    if [ -z "$connected_clients" ]; then
        log_error "클라이언트 정보 조회 실패"
        return 1
    fi

    if [ "$connected_clients" -gt 100 ]; then
        log_warn "클라이언트 연결 수 많음: $connected_clients"
    else
        log_info "클라이언트 연결 수: $connected_clients"
    fi

    return 0
}

# 5. 지속성 검사 (AOF)
check_persistence() {
    log_info "5단계: 데이터 지속성 검사"

    local persistence_info=$(redis_cmd info persistence 2>/dev/null | grep -E "aof_enabled:|aof_last_write_status:")

    local aof_enabled=$(echo "$persistence_info" | grep "aof_enabled:" | cut -d: -f2 | tr -d '\r')
    local aof_status=$(echo "$persistence_info" | grep "aof_last_write_status:" | cut -d: -f2 | tr -d '\r')

    if [ "$aof_enabled" = "1" ]; then
        if [ "$aof_status" = "ok" ]; then
            log_info "AOF 지속성 정상"
        else
            log_error "AOF 상태 오류: $aof_status"
            return 1
        fi
    else
        log_warn "AOF 지속성 비활성화"
    fi

    return 0
}

# 6. 한국어 데이터 처리 검사
check_korean_support() {
    log_info "6단계: 한국어 데이터 처리 검사"

    local korean_test_key="한글테스트:$(date +%s)"
    local korean_test_value="안녕하세요 DOT Platform 헬스체크입니다"

    # 한글 데이터 저장
    local store_result=$(redis_cmd set "$korean_test_key" "$korean_test_value" EX 60 2>/dev/null || echo "FAILED")

    if [ "$store_result" != "OK" ]; then
        log_error "한글 데이터 저장 실패: $store_result"
        return 1
    fi

    # 한글 데이터 조회
    local retrieve_result=$(redis_cmd get "$korean_test_key" 2>/dev/null || echo "FAILED")

    if [ "$retrieve_result" != "$korean_test_value" ]; then
        log_error "한글 데이터 조회 실패: 예상 '$korean_test_value', 실제 '$retrieve_result'"
        redis_cmd del "$korean_test_key" >/dev/null 2>&1
        return 1
    fi

    # 정리
    redis_cmd del "$korean_test_key" >/dev/null 2>&1

    log_info "한글 데이터 처리 정상"
    return 0
}

# 메인 헬스체크 실행
main() {
    log_info "=== DOT Platform Redis 헬스체크 시작 ==="

    # 전체 실행 시간 측정
    local total_start_time=$(date +%s%3N)

    # 순차적으로 모든 검사 실행
    if ! check_connection; then
        exit 1
    fi

    if ! check_read_write_performance; then
        exit 1
    fi

    if ! check_memory_usage; then
        exit 1
    fi

    if ! check_connected_clients; then
        exit 1
    fi

    if ! check_persistence; then
        exit 1
    fi

    if ! check_korean_support; then
        exit 1
    fi

    local total_end_time=$(date +%s%3N)
    local total_time=$((total_end_time - total_start_time))

    log_info "=== 모든 검사 통과 (총 소요시간: ${total_time}ms) ==="

    # 성공 시 최소 정보만 stdout으로 출력 (Docker 로그용)
    echo "Redis 헬스체크 통과: ${total_time}ms"

    exit 0
}

# 스크립트 실행
main "$@"