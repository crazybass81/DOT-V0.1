#!/bin/bash

# DOT Platform PostgreSQL 헬스체크 스크립트
# 연결성, 쓰기 가능성, 응답 시간을 종합적으로 검증

set -euo pipefail

# 설정 변수
DB_USER="${DB_USER:-dotuser}"
DB_NAME="${DB_NAME:-dot_production}"
MAX_RESPONSE_TIME_MS=3000  # 한국어 요구사항: 3초 이내
TEST_TABLE="health_check_temp"

# 색상 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로깅 함수
log_info() {
    echo -e "${GREEN}[PostgreSQL 헬스체크]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[PostgreSQL 경고]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[PostgreSQL 오류]${NC} $1" >&2
}

# 응답 시간 측정 함수
measure_response_time() {
    local start_time=$(date +%s%3N)
    local result=$1
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))

    if [ $response_time -gt $MAX_RESPONSE_TIME_MS ]; then
        log_error "응답시간 초과: ${response_time}ms > ${MAX_RESPONSE_TIME_MS}ms"
        return 1
    fi

    log_info "응답시간: ${response_time}ms (정상)"
    return 0
}

# 1. 기본 연결성 검사
check_connection() {
    log_info "1단계: 데이터베이스 연결성 검사"

    local start_time=$(date +%s%3N)
    if ! pg_isready -U "$DB_USER" -d "$DB_NAME" -t 10; then
        log_error "데이터베이스 연결 실패"
        return 1
    fi
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))

    if [ $response_time -gt $MAX_RESPONSE_TIME_MS ]; then
        log_error "연결 응답시간 초과: ${response_time}ms"
        return 1
    fi

    log_info "연결 성공 (${response_time}ms)"
    return 0
}

# 2. 읽기 성능 검사
check_read_performance() {
    log_info "2단계: 읽기 성능 검사"

    local start_time=$(date +%s%3N)
    local result=$(psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT 1;" 2>/dev/null)
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))

    if [ -z "$result" ] || [ "$result" != " 1" ]; then
        log_error "읽기 테스트 실패"
        return 1
    fi

    if [ $response_time -gt $MAX_RESPONSE_TIME_MS ]; then
        log_error "읽기 응답시간 초과: ${response_time}ms"
        return 1
    fi

    log_info "읽기 성능 정상 (${response_time}ms)"
    return 0
}

# 3. 쓰기 성능 검사
check_write_performance() {
    log_info "3단계: 쓰기 성능 검사"

    # 임시 테이블 생성
    local start_time=$(date +%s%3N)
    psql -U "$DB_USER" -d "$DB_NAME" -c "
        CREATE TEMP TABLE $TEST_TABLE (
            id SERIAL PRIMARY KEY,
            test_data VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW()
        );
    " >/dev/null 2>&1

    # 데이터 삽입
    psql -U "$DB_USER" -d "$DB_NAME" -c "
        INSERT INTO $TEST_TABLE (test_data)
        VALUES ('health_check_$(date +%s)');
    " >/dev/null 2>&1

    # 데이터 조회 및 삭제
    local count=$(psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM $TEST_TABLE;")
    psql -U "$DB_USER" -d "$DB_NAME" -c "DROP TABLE $TEST_TABLE;" >/dev/null 2>&1

    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))

    if [ -z "$count" ] || [ "$count" -ne 1 ]; then
        log_error "쓰기 테스트 실패: 예상 1건, 실제 ${count}건"
        return 1
    fi

    if [ $response_time -gt $MAX_RESPONSE_TIME_MS ]; then
        log_error "쓰기 응답시간 초과: ${response_time}ms"
        return 1
    fi

    log_info "쓰기 성능 정상 (${response_time}ms)"
    return 0
}

# 4. 한국어 로케일 검사
check_korean_locale() {
    log_info "4단계: 한국어 로케일 검사"

    local encoding=$(psql -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW server_encoding;")
    local locale=$(psql -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW lc_collate;")

    encoding=$(echo "$encoding" | tr -d ' ')
    locale=$(echo "$locale" | tr -d ' ')

    if [ "$encoding" != "UTF8" ]; then
        log_error "인코딩 오류: $encoding (UTF8 필요)"
        return 1
    fi

    log_info "인코딩: $encoding (정상)"
    log_info "로케일: $locale"
    return 0
}

# 5. 연결 수 검사
check_connection_limits() {
    log_info "5단계: 연결 수 검사"

    local current_connections=$(psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity;")
    local max_connections=$(psql -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW max_connections;")

    current_connections=$(echo "$current_connections" | tr -d ' ')
    max_connections=$(echo "$max_connections" | tr -d ' ')

    local usage_percent=$((current_connections * 100 / max_connections))

    if [ $usage_percent -gt 80 ]; then
        log_warn "연결 사용률 높음: ${usage_percent}% (${current_connections}/${max_connections})"
    else
        log_info "연결 사용률: ${usage_percent}% (${current_connections}/${max_connections})"
    fi

    return 0
}

# 메인 헬스체크 실행
main() {
    log_info "=== DOT Platform PostgreSQL 헬스체크 시작 ==="

    # 전체 실행 시간 측정
    local total_start_time=$(date +%s%3N)

    # 순차적으로 모든 검사 실행
    if ! check_connection; then
        exit 1
    fi

    if ! check_read_performance; then
        exit 1
    fi

    if ! check_write_performance; then
        exit 1
    fi

    if ! check_korean_locale; then
        exit 1
    fi

    check_connection_limits

    local total_end_time=$(date +%s%3N)
    local total_time=$((total_end_time - total_start_time))

    log_info "=== 모든 검사 통과 (총 소요시간: ${total_time}ms) ==="

    # 성공 시 최소 정보만 stdout으로 출력 (Docker 로그용)
    echo "PostgreSQL 헬스체크 통과: ${total_time}ms"

    exit 0
}

# 스크립트 실행
main "$@"