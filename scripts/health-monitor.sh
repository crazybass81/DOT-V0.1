#!/bin/bash

# DOT Platform 헬스 모니터링 스크립트
# 지속적인 시스템 헬스 체크 및 장애 감지

set -euo pipefail

# 색상 정의
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# 한국어 로그 메시지 색상 지원
log_info() {
    echo -e "${GREEN}[정보]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[경고]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[오류]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${CYAN}[디버그]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
    fi
}

log_step() {
    echo -e "${BLUE}[단계]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${PURPLE}[성공]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# 설정 변수
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
readonly LOG_DIR="${PROJECT_DIR}/logs"
readonly HEALTH_LOG="${LOG_DIR}/health-monitor.log"
readonly ALERT_LOG="${LOG_DIR}/health-alerts.log"
readonly STATUS_FILE="${LOG_DIR}/health-status.json"

# 기본 설정값
MONITORING_INTERVAL=${MONITORING_INTERVAL:-30}  # 30초 간격
MAX_LOG_SIZE=${MAX_LOG_SIZE:-10485760}          # 10MB
RETENTION_DAYS=${RETENTION_DAYS:-7}             # 7일 보관
ALERT_COOLDOWN=${ALERT_COOLDOWN:-300}           # 5분 알림 쿨다운

# Docker Compose 파일 경로
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"
COMPOSE_PROD_FILE="${PROJECT_DIR}/docker-compose.prod.yml"

# 헬스체크 임계값 (한국어 요구사항 기반)
readonly MAX_RESPONSE_TIME=3000     # 3초 (3000ms)
readonly MAX_CONCURRENT_USERS=10    # 10명 동시 사용자
readonly MIN_MEMORY_FREE=512        # 512MB 최소 여유 메모리
readonly MAX_CPU_USAGE=80           # 80% 최대 CPU 사용률
readonly MAX_DISK_USAGE=85          # 85% 최대 디스크 사용률

# 알림 상태 추적
declare -A ALERT_LAST_SENT

# 도움말 표시
show_help() {
    cat << EOF
DOT Platform 헬스 모니터링 스크립트

사용법:
    $0 [옵션]

옵션:
    --interval SECONDS    모니터링 간격 설정 (기본값: 30초)
    --daemon              백그라운드 데몬으로 실행
    --stop                실행 중인 데몬 중지
    --status              현재 헬스 상태 확인
    --logs                최근 로그 확인
    --alerts              최근 알림 확인
    --cleanup             오래된 로그 파일 정리
    --debug               디버그 모드 활성화
    --help                이 도움말 표시

예시:
    $0 --daemon                    # 백그라운드에서 모니터링 시작
    $0 --interval 60 --daemon      # 60초 간격으로 모니터링
    $0 --status                    # 현재 상태 확인
    $0 --stop                      # 모니터링 중지

Korean Requirements:
    - 페이지 로딩: < 3초
    - 동시 사용자: 10명 지원
    - 24/7 모니터링 지원
EOF
}

# 로그 디렉토리 초기화
init_logging() {
    mkdir -p "$LOG_DIR"

    # 로그 파일 크기 제한
    if [[ -f "$HEALTH_LOG" ]] && [[ $(stat -f%z "$HEALTH_LOG" 2>/dev/null || stat -c%s "$HEALTH_LOG" 2>/dev/null || echo 0) -gt $MAX_LOG_SIZE ]]; then
        mv "$HEALTH_LOG" "${HEALTH_LOG}.old"
        log_info "헬스 로그 파일 롤오버 완료"
    fi
}

# PID 파일 관리
readonly PID_FILE="${LOG_DIR}/health-monitor.pid"

start_daemon() {
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        log_error "헬스 모니터링이 이미 실행 중입니다 (PID: $(cat "$PID_FILE"))"
        return 1
    fi

    log_info "헬스 모니터링 데몬을 시작합니다... (간격: ${MONITORING_INTERVAL}초)"
    nohup "$0" --monitor-loop > "${LOG_DIR}/monitor-daemon.log" 2>&1 &
    echo $! > "$PID_FILE"
    log_success "헬스 모니터링 데몬이 시작되었습니다 (PID: $!)"
}

stop_daemon() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            rm -f "$PID_FILE"
            log_success "헬스 모니터링 데몬을 중지했습니다 (PID: $pid)"
        else
            log_warning "헬스 모니터링 데몬이 이미 중지되어 있습니다"
            rm -f "$PID_FILE"
        fi
    else
        log_warning "실행 중인 헬스 모니터링 데몬을 찾을 수 없습니다"
    fi
}

# Docker 서비스 헬스체크
check_docker_services() {
    log_debug "Docker 서비스 헬스체크 시작"

    local compose_file="$COMPOSE_FILE"
    if [[ -f "$COMPOSE_PROD_FILE" ]]; then
        compose_file="$COMPOSE_PROD_FILE"
    fi

    if ! docker-compose -f "$compose_file" ps > /dev/null 2>&1; then
        log_error "Docker Compose 서비스에 접근할 수 없습니다"
        return 1
    fi

    local services_status=$(docker-compose -f "$compose_file" ps --format json 2>/dev/null || echo "[]")
    local unhealthy_services=()

    while IFS= read -r service; do
        if [[ -n "$service" ]]; then
            local service_name=$(echo "$service" | jq -r '.Name // empty' 2>/dev/null || echo "unknown")
            local service_state=$(echo "$service" | jq -r '.State // empty' 2>/dev/null || echo "unknown")
            local service_health=$(echo "$service" | jq -r '.Health // empty' 2>/dev/null || echo "unknown")

            if [[ "$service_state" != "running" ]] || [[ "$service_health" == "unhealthy" ]]; then
                unhealthy_services+=("$service_name ($service_state, $service_health)")
                log_warning "서비스 상태 이상: $service_name - 상태: $service_state, 헬스: $service_health"
            fi
        fi
    done <<< "$(echo "$services_status" | jq -c '.[]' 2>/dev/null || echo "")"

    if [[ ${#unhealthy_services[@]} -gt 0 ]]; then
        send_alert "docker_services" "Docker 서비스 상태 이상" "비정상 서비스: ${unhealthy_services[*]}"
        return 1
    else
        log_debug "모든 Docker 서비스가 정상 상태입니다"
        return 0
    fi
}

# 웹 애플리케이션 헬스체크
check_web_health() {
    log_debug "웹 애플리케이션 헬스체크 시작"

    local base_url="${BASE_URL:-http://localhost}"
    local start_time=$(date +%s%3N)

    # 메인 페이지 응답 확인
    if ! curl -s --max-time 5 "$base_url" > /dev/null; then
        send_alert "web_health" "웹 애플리케이션 접근 불가" "URL: $base_url"
        return 1
    fi

    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))

    # 한국어 요구사항: < 3초 (3000ms) 페이지 로딩
    if [[ $response_time -gt $MAX_RESPONSE_TIME ]]; then
        send_alert "web_performance" "페이지 응답 시간 초과" "응답시간: ${response_time}ms (임계값: ${MAX_RESPONSE_TIME}ms)"
        log_warning "페이지 응답 시간이 임계값을 초과했습니다: ${response_time}ms > ${MAX_RESPONSE_TIME}ms"
        return 1
    fi

    log_debug "웹 애플리케이션 헬스체크 성공: ${response_time}ms"
    return 0
}

# API 헬스체크
check_api_health() {
    log_debug "API 헬스체크 시작"

    local api_url="${API_URL:-http://localhost/health}"
    local start_time=$(date +%s%3N)

    local response=$(curl -s --max-time 10 -w "%{http_code}" "$api_url" 2>/dev/null || echo "000")
    local http_code="${response: -3}"
    local response_body="${response%???}"

    local end_time=$(date +%s%3N)
    local api_response_time=$((end_time - start_time))

    if [[ "$http_code" != "200" ]]; then
        send_alert "api_health" "API 헬스체크 실패" "HTTP 코드: $http_code, URL: $api_url"
        return 1
    fi

    # API 응답 시간 확인 (500ms 임계값)
    if [[ $api_response_time -gt 500 ]]; then
        send_alert "api_performance" "API 응답 시간 지연" "응답시간: ${api_response_time}ms (임계값: 500ms)"
        log_warning "API 응답 시간이 지연되었습니다: ${api_response_time}ms"
    fi

    log_debug "API 헬스체크 성공: ${api_response_time}ms"
    return 0
}

# 시스템 리소스 확인
check_system_resources() {
    log_debug "시스템 리소스 확인 시작"

    # 메모리 사용률 확인
    local memory_info=$(free -m)
    local memory_available=$(echo "$memory_info" | awk 'NR==2{print $7}')

    if [[ -n "$memory_available" ]] && [[ $memory_available -lt $MIN_MEMORY_FREE ]]; then
        send_alert "memory" "메모리 부족 경고" "사용 가능한 메모리: ${memory_available}MB (최소 요구: ${MIN_MEMORY_FREE}MB)"
        log_warning "메모리 부족: ${memory_available}MB < ${MIN_MEMORY_FREE}MB"
    fi

    # CPU 사용률 확인
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    cpu_usage=${cpu_usage%.*}  # 소수점 제거

    if [[ -n "$cpu_usage" ]] && [[ $cpu_usage -gt $MAX_CPU_USAGE ]]; then
        send_alert "cpu" "CPU 사용률 높음" "CPU 사용률: ${cpu_usage}% (임계값: ${MAX_CPU_USAGE}%)"
        log_warning "높은 CPU 사용률: ${cpu_usage}% > ${MAX_CPU_USAGE}%"
    fi

    # 디스크 사용률 확인
    local disk_usage=$(df -h "$PROJECT_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')

    if [[ -n "$disk_usage" ]] && [[ $disk_usage -gt $MAX_DISK_USAGE ]]; then
        send_alert "disk" "디스크 사용률 높음" "디스크 사용률: ${disk_usage}% (임계값: ${MAX_DISK_USAGE}%)"
        log_warning "높은 디스크 사용률: ${disk_usage}% > ${MAX_DISK_USAGE}%"
    fi

    log_debug "시스템 리소스 확인 완료 - 메모리: ${memory_available}MB, CPU: ${cpu_usage}%, 디스크: ${disk_usage}%"
    return 0
}

# 데이터베이스 연결 확인
check_database_health() {
    log_debug "데이터베이스 헬스체크 시작"

    # PostgreSQL 컨테이너 확인
    if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "dot-postgres"; then
        # 간단한 연결 테스트
        if docker exec -i $(docker ps -q -f name=dot-postgres) pg_isready > /dev/null 2>&1; then
            log_debug "PostgreSQL 데이터베이스 연결 정상"
            return 0
        else
            send_alert "database" "PostgreSQL 연결 실패" "데이터베이스 서버가 응답하지 않습니다"
            return 1
        fi
    else
        send_alert "database" "PostgreSQL 컨테이너 없음" "PostgreSQL 컨테이너를 찾을 수 없습니다"
        return 1
    fi
}

# Redis 연결 확인
check_redis_health() {
    log_debug "Redis 헬스체크 시작"

    # Redis 컨테이너 확인
    if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "dot-redis"; then
        # Redis ping 테스트
        if docker exec -i $(docker ps -q -f name=dot-redis) redis-cli ping | grep -q "PONG"; then
            log_debug "Redis 연결 정상"
            return 0
        else
            send_alert "redis" "Redis 연결 실패" "Redis 서버가 응답하지 않습니다"
            return 1
        fi
    else
        send_alert "redis" "Redis 컨테이너 없음" "Redis 컨테이너를 찾을 수 없습니다"
        return 1
    fi
}

# 알림 전송 (쿨다운 기능 포함)
send_alert() {
    local alert_type="$1"
    local alert_title="$2"
    local alert_message="$3"

    local current_time=$(date +%s)
    local last_sent_key="${alert_type}_${alert_title}"
    local last_sent=${ALERT_LAST_SENT[$last_sent_key]:-0}

    # 쿨다운 확인
    if [[ $((current_time - last_sent)) -lt $ALERT_COOLDOWN ]]; then
        log_debug "알림 쿨다운 중: $alert_title (남은 시간: $((ALERT_COOLDOWN - (current_time - last_sent)))초)"
        return 0
    fi

    # 알림 로그 기록
    local alert_entry=$(cat << EOF
{
    "timestamp": "$(date -Iseconds)",
    "type": "$alert_type",
    "title": "$alert_title",
    "message": "$alert_message",
    "severity": "warning"
}
EOF
)

    echo "$alert_entry" >> "$ALERT_LOG"
    log_error "$alert_title: $alert_message"

    # 알림 전송 시간 기록
    ALERT_LAST_SENT[$last_sent_key]=$current_time

    # TODO: 실제 환경에서는 Slack, Discord, 이메일 등으로 알림 전송
    # send_slack_notification "$alert_title" "$alert_message"
    # send_email_notification "$alert_title" "$alert_message"
}

# 전체 헬스체크 실행
run_health_check() {
    log_step "DOT Platform 헬스체크 실행 시작"

    local check_results=()
    local overall_status="healthy"

    # 각 헬스체크 실행
    if check_docker_services; then
        check_results+=("docker_services:healthy")
    else
        check_results+=("docker_services:unhealthy")
        overall_status="unhealthy"
    fi

    if check_web_health; then
        check_results+=("web_health:healthy")
    else
        check_results+=("web_health:unhealthy")
        overall_status="unhealthy"
    fi

    if check_api_health; then
        check_results+=("api_health:healthy")
    else
        check_results+=("api_health:unhealthy")
        overall_status="unhealthy"
    fi

    if check_database_health; then
        check_results+=("database:healthy")
    else
        check_results+=("database:unhealthy")
        overall_status="unhealthy"
    fi

    if check_redis_health; then
        check_results+=("redis:healthy")
    else
        check_results+=("redis:unhealthy")
        overall_status="unhealthy"
    fi

    check_system_resources
    check_results+=("system_resources:checked")

    # 상태 파일 업데이트
    update_status_file "$overall_status" "${check_results[@]}"

    if [[ "$overall_status" == "healthy" ]]; then
        log_success "전체 헬스체크 완료 - 모든 시스템이 정상입니다"
    else
        log_warning "헬스체크 완료 - 일부 시스템에 문제가 있습니다"
    fi

    return $([[ "$overall_status" == "healthy" ]] && echo 0 || echo 1)
}

# 상태 파일 업데이트
update_status_file() {
    local overall_status="$1"
    shift
    local check_results=("$@")

    local status_json=$(cat << EOF
{
    "timestamp": "$(date -Iseconds)",
    "overall_status": "$overall_status",
    "checks": {
EOF
)

    for result in "${check_results[@]}"; do
        local check_name="${result%:*}"
        local check_status="${result#*:}"
        status_json+="\n        \"$check_name\": \"$check_status\","
    done

    # 마지막 쉼표 제거
    status_json="${status_json%,}"

    status_json+="\n    },
    \"monitoring_interval\": $MONITORING_INTERVAL,
    \"korean_requirements\": {
        \"max_response_time_ms\": $MAX_RESPONSE_TIME,
        \"max_concurrent_users\": $MAX_CONCURRENT_USERS
    }
}"

    echo -e "$status_json" > "$STATUS_FILE"
}

# 상태 확인 및 출력
show_status() {
    if [[ -f "$STATUS_FILE" ]]; then
        log_info "현재 헬스 상태:"
        cat "$STATUS_FILE" | jq .
    else
        log_warning "상태 파일을 찾을 수 없습니다. 헬스체크를 먼저 실행하세요."
        return 1
    fi
}

# 로그 확인
show_logs() {
    local lines=${1:-50}

    if [[ -f "$HEALTH_LOG" ]]; then
        log_info "최근 헬스 로그 ($lines 줄):"
        tail -n "$lines" "$HEALTH_LOG"
    else
        log_warning "헬스 로그 파일을 찾을 수 없습니다."
    fi
}

# 알림 로그 확인
show_alerts() {
    local lines=${1:-20}

    if [[ -f "$ALERT_LOG" ]]; then
        log_info "최근 알림 ($lines 개):"
        tail -n "$lines" "$ALERT_LOG" | jq .
    else
        log_warning "알림 로그 파일을 찾을 수 없습니다."
    fi
}

# 로그 정리
cleanup_logs() {
    log_info "오래된 로그 파일 정리 중..."

    # 지정된 일수보다 오래된 로그 파일 삭제
    find "$LOG_DIR" -name "*.log*" -type f -mtime +"$RETENTION_DAYS" -delete

    log_success "로그 정리 완료 (${RETENTION_DAYS}일 이상 된 파일 삭제)"
}

# 모니터링 루프 (데몬 모드)
monitor_loop() {
    log_info "헬스 모니터링 루프 시작 (간격: ${MONITORING_INTERVAL}초)"

    # 신호 처리
    trap 'log_info "모니터링 중지 신호 수신"; exit 0' SIGINT SIGTERM

    while true; do
        {
            echo "==================== $(date) ===================="
            run_health_check
            echo ""
        } >> "$HEALTH_LOG" 2>&1

        sleep "$MONITORING_INTERVAL"
    done
}

# 메인 함수
main() {
    init_logging

    case "${1:-}" in
        --help|-h)
            show_help
            ;;
        --daemon)
            start_daemon
            ;;
        --stop)
            stop_daemon
            ;;
        --status)
            show_status
            ;;
        --logs)
            show_logs "${2:-50}"
            ;;
        --alerts)
            show_alerts "${2:-20}"
            ;;
        --cleanup)
            cleanup_logs
            ;;
        --interval)
            if [[ -n "${2:-}" ]]; then
                MONITORING_INTERVAL="$2"
                shift 2
                main "$@"
            else
                log_error "간격 값이 지정되지 않았습니다"
                exit 1
            fi
            ;;
        --debug)
            export DEBUG=true
            shift
            main "$@"
            ;;
        --monitor-loop)
            # 내부 사용: 데몬 모드에서 호출
            monitor_loop
            ;;
        "")
            # 기본 동작: 단일 헬스체크 실행
            run_health_check
            ;;
        *)
            log_error "알 수 없는 옵션: $1"
            show_help
            exit 1
            ;;
    esac
}

# 스크립트가 직접 실행될 때만 main 함수 호출
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi