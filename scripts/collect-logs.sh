#!/bin/bash

# DOT Platform 로그 수집 및 분석 스크립트
# 배포 검증 및 모니터링을 위한 종합 로그 수집 시스템
#
# TDD GREEN 단계: T021 구현
# 배포 후 모든 서비스의 로그를 수집하고 분석하여 문제를 조기 발견

set -euo pipefail

# 색상 정의 (한국어 지원)
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# 한국어 로그 메시지 함수들
log_info() {
    # 로그 디렉토리가 없으면 생성
    [[ -d "$(dirname "$LOG_COLLECTION_LOG")" ]] || mkdir -p "$(dirname "$LOG_COLLECTION_LOG")"
    echo -e "${GREEN}[정보]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_COLLECTION_LOG"
}

log_warning() {
    [[ -d "$(dirname "$LOG_COLLECTION_LOG")" ]] || mkdir -p "$(dirname "$LOG_COLLECTION_LOG")"
    echo -e "${YELLOW}[경고]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_COLLECTION_LOG"
}

log_error() {
    [[ -d "$(dirname "$LOG_COLLECTION_LOG")" ]] || mkdir -p "$(dirname "$LOG_COLLECTION_LOG")"
    echo -e "${RED}[오류]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_COLLECTION_LOG"
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        [[ -d "$(dirname "$LOG_COLLECTION_LOG")" ]] || mkdir -p "$(dirname "$LOG_COLLECTION_LOG")"
        echo -e "${CYAN}[디버그]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_COLLECTION_LOG"
    fi
}

log_step() {
    [[ -d "$(dirname "$LOG_COLLECTION_LOG")" ]] || mkdir -p "$(dirname "$LOG_COLLECTION_LOG")"
    echo -e "${BLUE}[단계]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_COLLECTION_LOG"
}

log_success() {
    [[ -d "$(dirname "$LOG_COLLECTION_LOG")" ]] || mkdir -p "$(dirname "$LOG_COLLECTION_LOG")"
    echo -e "${PURPLE}[성공]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_COLLECTION_LOG"
}

# 전역 설정 변수
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
readonly LOGS_DIR="${PROJECT_DIR}/logs"
readonly COLLECTION_ID="collection-$(date +%Y%m%d-%H%M%S)"
readonly ANALYSIS_DIR="${LOGS_DIR}/analysis/${COLLECTION_ID}"
readonly LOG_COLLECTION_LOG="${ANALYSIS_DIR}/collection.log"

# 수집 설정
readonly LOG_COLLECTION_TIMEOUT="${LOG_COLLECTION_TIMEOUT:-300}"  # 5분
readonly LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-7}"  # 7일간 보관
readonly LOG_ANALYSIS_DEPTH="${LOG_ANALYSIS_DEPTH:-deep}"  # shallow, normal, deep
readonly KOREAN_PERFORMANCE_THRESHOLD=3000  # 3초 (ms)

# Docker Compose 설정
readonly COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
readonly COMPOSE_PROJECT="dot-platform"

# 수집할 서비스 목록
readonly SERVICES=(
    "postgres"
    "redis"
    "backend"
    "frontend"
    "nginx"
)

# 도움말 표시
show_help() {
    cat << EOF
DOT Platform 로그 수집 및 분석 스크립트

사용법: $0 [옵션]

옵션:
    -h, --help              이 도움말 표시
    -s, --services          특정 서비스만 수집 (쉼표로 구분)
    -d, --duration          수집 기간 (초, 기본: 300)
    -a, --analysis          분석 수준 (shallow, normal, deep)
    -f, --format            출력 형식 (json, text, both)
    -o, --output            출력 디렉토리 지정
    -c, --compress          수집 완료 후 압축
    -r, --realtime          실시간 로그 모니터링
    --korean-errors         한국어 에러 메시지만 수집
    --performance-only      성능 관련 로그만 수집
    --health-check          헬스체크 로그만 수집
    --debug                 디버그 모드 활성화

환경 변수:
    LOG_COLLECTION_TIMEOUT  수집 타임아웃 (초, 기본: 300)
    LOG_RETENTION_DAYS      로그 보관 기간 (일, 기본: 7)
    LOG_ANALYSIS_DEPTH      분석 수준 (기본: deep)
    DEBUG                   디버그 모드 (true/false)

예제:
    $0                                    # 전체 서비스 로그 수집 및 분석
    $0 -s backend,nginx -d 600           # 백엔드/Nginx 로그만 10분간 수집
    $0 -a shallow --korean-errors        # 한국어 에러만 간단 분석
    $0 -r --performance-only             # 성능 관련 로그 실시간 모니터링
    $0 --health-check -f json            # 헬스체크 로그를 JSON 형식으로

분석 수준 설명:
    shallow  - 기본 오류 및 경고만 수집 (빠름)
    normal   - 표준 로그 분석 (균형)
    deep     - 전체 로그 패턴 분석 및 성능 메트릭 (상세)

한국어 요구사항:
    - 페이지 로딩 < 3초 성능 검증
    - 10명 동시 사용자 지원 확인
    - 한국어 오류 메시지 우선 분석
    - UTF-8 인코딩 검증
EOF
}

# 전제 조건 확인
check_prerequisites() {
    log_step "전제 조건 확인"

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
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_error "Docker Compose 파일을 찾을 수 없습니다: $COMPOSE_FILE"
        exit 1
    fi

    # 필요한 도구 확인
    local required_tools=("jq" "grep" "awk" "sed" "tail" "head")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "필수 도구가 설치되지 않았습니다: $tool"
            exit 1
        fi
    done

    log_success "전제 조건 확인 완료"
}

# 수집 환경 준비
prepare_collection_environment() {
    log_step "로그 수집 환경 준비"

    # 수집 디렉토리 생성
    mkdir -p "$ANALYSIS_DIR"
    mkdir -p "${ANALYSIS_DIR}/raw"
    mkdir -p "${ANALYSIS_DIR}/processed"
    mkdir -p "${ANALYSIS_DIR}/reports"

    # 수집 시작 시간 기록
    echo "$(date '+%Y-%m-%d %H:%M:%S')" > "${ANALYSIS_DIR}/collection_start.timestamp"

    # 수집 메타데이터 생성
    cat > "${ANALYSIS_DIR}/metadata.json" << EOF
{
    "collection_id": "$COLLECTION_ID",
    "start_time": "$(date -Iseconds)",
    "services": $(printf '%s\n' "${SERVICES[@]}" | jq -R . | jq -s .),
    "timeout": $LOG_COLLECTION_TIMEOUT,
    "analysis_depth": "$LOG_ANALYSIS_DEPTH",
    "korean_requirements": {
        "performance_threshold_ms": $KOREAN_PERFORMANCE_THRESHOLD,
        "concurrent_users": 10,
        "encoding": "UTF-8"
    }
}
EOF

    log_success "수집 환경 준비 완료: $ANALYSIS_DIR"
}

# 서비스 상태 확인
check_service_status() {
    log_step "서비스 상태 확인"

    local status_file="${ANALYSIS_DIR}/service_status.json"
    local services_status=()

    for service in "${SERVICES[@]}"; do
        log_debug "서비스 상태 확인: $service"

        local container_name="${COMPOSE_PROJECT}-${service}-prod"
        local status="unknown"
        local health="unknown"

        # 컨테이너 상태 확인
        if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$container_name"; then
            status="running"

            # 헬스체크 상태 확인
            local health_status
            health_status=$(docker inspect "$container_name" --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")
            if [[ "$health_status" == "healthy" ]]; then
                health="healthy"
            elif [[ "$health_status" == "unhealthy" ]]; then
                health="unhealthy"
            else
                health="none"
            fi
        else
            status="stopped"
        fi

        services_status+=("{\"service\":\"$service\",\"status\":\"$status\",\"health\":\"$health\"}")
        log_info "서비스 $service: 상태=$status, 헬스=$health"
    done

    # 서비스 상태를 JSON 파일로 저장
    printf '[%s]' "$(IFS=,; echo "${services_status[*]}")" | jq . > "$status_file"

    log_success "서비스 상태 확인 완료"
}

# Docker 로그 수집
collect_docker_logs() {
    local service="$1"
    local output_file="$2"
    local duration="$3"

    log_debug "Docker 로그 수집 시작: $service"

    local container_name="${COMPOSE_PROJECT}-${service}-prod"

    # 기존 로그 수집 (최근 1000줄)
    docker logs --tail=1000 "$container_name" > "$output_file" 2>&1 || {
        log_warning "기존 로그 수집 실패: $service"
        echo "로그 수집 실패: $(date)" > "$output_file"
    }

    # 실시간 로그 수집 (지정된 시간 동안)
    if [[ "$duration" -gt 0 ]]; then
        log_debug "실시간 로그 수집: $service ($duration 초)"
        timeout "$duration" docker logs -f "$container_name" >> "$output_file" 2>&1 || {
            log_debug "실시간 로그 수집 완료 또는 타임아웃: $service"
        }
    fi

    log_debug "Docker 로그 수집 완료: $service"
}

# 애플리케이션 로그 수집
collect_application_logs() {
    local service="$1"
    local output_file="$2"

    log_debug "애플리케이션 로그 수집: $service"

    local container_name="${COMPOSE_PROJECT}-${service}-prod"
    local app_log_paths=""

    # 서비스별 애플리케이션 로그 경로 설정
    case "$service" in
        "backend")
            app_log_paths="/app/logs/app.log /app/logs/error.log /app/logs/access.log"
            ;;
        "nginx")
            app_log_paths="/var/log/nginx/access.log /var/log/nginx/error.log /var/log/nginx/performance.log"
            ;;
        "postgres")
            app_log_paths="/var/log/postgresql/postgresql-*.log"
            ;;
        "redis")
            app_log_paths="/data/redis-server.log"
            ;;
        *)
            log_debug "애플리케이션 로그 경로 없음: $service"
            return 0
            ;;
    esac

    # 컨테이너 내부 로그 파일 수집
    for log_path in $app_log_paths; do
        log_debug "로그 파일 수집: $service:$log_path"

        # 로그 파일이 존재하는지 확인하고 수집
        docker exec "$container_name" sh -c "[ -f $log_path ] && tail -n 1000 $log_path" >> "$output_file" 2>/dev/null || {
            log_debug "로그 파일 없음 또는 접근 불가: $service:$log_path"
        }
    done

    log_debug "애플리케이션 로그 수집 완료: $service"
}

# 성능 메트릭 수집
collect_performance_metrics() {
    local service="$1"
    local output_file="$2"

    log_debug "성능 메트릭 수집: $service"

    local container_name="${COMPOSE_PROJECT}-${service}-prod"
    local metrics_file="${output_file}.metrics"

    # Docker 컨테이너 통계
    {
        echo "=== Docker Stats ==="
        docker stats "$container_name" --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"
        echo ""

        echo "=== Container Inspect ==="
        docker inspect "$container_name" | jq '.[] | {
            Name: .Name,
            State: .State,
            Config: {
                Memory: .HostConfig.Memory,
                CpuShares: .HostConfig.CpuShares
            },
            NetworkSettings: .NetworkSettings.IPAddress
        }'
        echo ""
    } > "$metrics_file" 2>&1 || {
        log_warning "성능 메트릭 수집 실패: $service"
    }

    # 서비스별 추가 메트릭
    case "$service" in
        "backend"|"frontend")
            # HTTP 응답 시간 측정 (한국어 요구사항 검증)
            {
                echo "=== HTTP Response Time Test ==="
                local endpoint="http://localhost/health"
                if [[ "$service" == "backend" ]]; then
                    endpoint="http://localhost/api/v1/health"
                fi

                for i in {1..5}; do
                    local response_time
                    response_time=$(curl -w "%{time_total}" -s -o /dev/null "$endpoint" 2>/dev/null || echo "error")
                    echo "Test $i: ${response_time}s"

                    # 3초 임계값 검사
                    if [[ "$response_time" != "error" ]]; then
                        local response_ms
                        response_ms=$(echo "$response_time * 1000" | bc -l 2>/dev/null || echo "0")
                        if (( $(echo "$response_ms > $KOREAN_PERFORMANCE_THRESHOLD" | bc -l 2>/dev/null || echo "0") )); then
                            echo "⚠️  한국어 성능 요구사항 위반: ${response_ms}ms > ${KOREAN_PERFORMANCE_THRESHOLD}ms"
                        fi
                    fi
                done
                echo ""
            } >> "$metrics_file" 2>&1
            ;;
        "postgres")
            # 데이터베이스 성능 메트릭
            {
                echo "=== Database Metrics ==="
                docker exec "$container_name" psql -U "${DB_USER:-dotuser}" -d "${DB_NAME:-dot_production}" -c "
                    SELECT
                        datname,
                        numbackends as active_connections,
                        xact_commit,
                        xact_rollback,
                        blks_read,
                        blks_hit,
                        tup_returned,
                        tup_fetched
                    FROM pg_stat_database
                    WHERE datname = '${DB_NAME:-dot_production}';
                " 2>/dev/null || echo "Database metrics unavailable"
                echo ""
            } >> "$metrics_file" 2>&1
            ;;
        "redis")
            # Redis 성능 메트릭
            {
                echo "=== Redis Metrics ==="
                docker exec "$container_name" redis-cli --no-auth-warning -a "${REDIS_PASSWORD:-}" info stats 2>/dev/null || echo "Redis metrics unavailable"
                echo ""
            } >> "$metrics_file" 2>&1
            ;;
    esac

    log_debug "성능 메트릭 수집 완료: $service"
}

# 주요 서비스 로그 수집
collect_service_logs() {
    log_step "서비스 로그 수집 시작"

    local collection_pids=()

    for service in "${SERVICES[@]}"; do
        log_info "로그 수집 시작: $service"

        local raw_log_file="${ANALYSIS_DIR}/raw/${service}.log"
        local raw_app_file="${ANALYSIS_DIR}/raw/${service}_app.log"

        # Docker 로그 수집 (백그라운드)
        {
            collect_docker_logs "$service" "$raw_log_file" "$LOG_COLLECTION_TIMEOUT"
        } &
        collection_pids+=($!)

        # 애플리케이션 로그 수집 (백그라운드)
        {
            collect_application_logs "$service" "$raw_app_file"
        } &
        collection_pids+=($!)

        # 성능 메트릭 수집 (백그라운드)
        {
            collect_performance_metrics "$service" "$raw_log_file"
        } &
        collection_pids+=($!)
    done

    # 모든 수집 작업 완료 대기
    log_info "로그 수집 작업 완료 대기 중... (최대 ${LOG_COLLECTION_TIMEOUT}초)"
    for pid in "${collection_pids[@]}"; do
        wait "$pid" || log_warning "로그 수집 작업 중 일부 실패 (PID: $pid)"
    done

    log_success "모든 서비스 로그 수집 완료"
}

# 로그 분석 - 에러 패턴 검색
analyze_error_patterns() {
    log_step "에러 패턴 분석"

    local error_report="${ANALYSIS_DIR}/reports/error_analysis.json"
    local errors_found=()

    # 한국어 에러 패턴들
    local korean_error_patterns=(
        "오류"
        "에러"
        "실패"
        "문제"
        "장애"
        "예외"
        "경고"
    )

    # 영어 에러 패턴들
    local english_error_patterns=(
        "ERROR"
        "FATAL"
        "CRITICAL"
        "WARNING"
        "EXCEPTION"
        "FAILED"
        "TIMEOUT"
        "CONNECTION REFUSED"
        "500 Internal Server Error"
        "502 Bad Gateway"
        "503 Service Unavailable"
        "504 Gateway Timeout"
    )

    for service in "${SERVICES[@]}"; do
        log_debug "에러 패턴 분석: $service"

        local service_errors=()
        local log_files=("${ANALYSIS_DIR}/raw/${service}.log" "${ANALYSIS_DIR}/raw/${service}_app.log")

        for log_file in "${log_files[@]}"; do
            if [[ -f "$log_file" ]]; then
                # 한국어 에러 검색
                for pattern in "${korean_error_patterns[@]}"; do
                    local matches
                    matches=$(grep -i "$pattern" "$log_file" 2>/dev/null | wc -l)
                    if [[ "$matches" -gt 0 ]]; then
                        service_errors+=("{\"pattern\":\"$pattern\",\"count\":$matches,\"type\":\"korean\",\"log_file\":\"$(basename "$log_file")\"}")
                    fi
                done

                # 영어 에러 검색
                for pattern in "${english_error_patterns[@]}"; do
                    local matches
                    matches=$(grep -i "$pattern" "$log_file" 2>/dev/null | wc -l)
                    if [[ "$matches" -gt 0 ]]; then
                        service_errors+=("{\"pattern\":\"$pattern\",\"count\":$matches,\"type\":\"english\",\"log_file\":\"$(basename "$log_file")\"}")
                    fi
                done
            fi
        done

        if [[ ${#service_errors[@]} -gt 0 ]]; then
            errors_found+=("{\"service\":\"$service\",\"errors\":[$(IFS=,; echo "${service_errors[*]}")]}")
        fi
    done

    # 에러 분석 결과 저장
    printf '{"analysis_time":"%s","error_patterns":[%s]}' "$(date -Iseconds)" "$(IFS=,; echo "${errors_found[*]}")" | jq . > "$error_report"

    log_success "에러 패턴 분석 완료"
}

# 로그 분석 - 성능 이슈 검색
analyze_performance_issues() {
    log_step "성능 이슈 분석"

    local perf_report="${ANALYSIS_DIR}/reports/performance_analysis.json"
    local performance_issues=()

    # 성능 관련 패턴들
    local performance_patterns=(
        "slow query"
        "timeout"
        "high cpu"
        "memory leak"
        "connection pool"
        "database lock"
        "응답.*지연"
        "처리.*시간"
        "메모리.*부족"
        "CPU.*사용량"
    )

    for service in "${SERVICES[@]}"; do
        log_debug "성능 이슈 분석: $service"

        local service_issues=()
        local log_files=("${ANALYSIS_DIR}/raw/${service}.log" "${ANALYSIS_DIR}/raw/${service}_app.log")

        for log_file in "${log_files[@]}"; do
            if [[ -f "$log_file" ]]; then
                for pattern in "${performance_patterns[@]}"; do
                    local matches
                    matches=$(grep -iE "$pattern" "$log_file" 2>/dev/null | wc -l)
                    if [[ "$matches" -gt 0 ]]; then
                        # 샘플 로그 라인 추출
                        local sample
                        sample=$(grep -iE "$pattern" "$log_file" 2>/dev/null | head -1 | sed 's/"/\\"/g')
                        service_issues+=("{\"pattern\":\"$pattern\",\"count\":$matches,\"sample\":\"$sample\",\"log_file\":\"$(basename "$log_file")\"}")
                    fi
                done

                # 메트릭 파일에서 성능 임계값 확인
                local metrics_file="${log_file}.metrics"
                if [[ -f "$metrics_file" ]]; then
                    # CPU 사용률 높음 (80% 이상)
                    local high_cpu
                    high_cpu=$(grep -E "CPU.*[8-9][0-9]\.[0-9]+%|CPU.*100\.00%" "$metrics_file" 2>/dev/null | wc -l)
                    if [[ "$high_cpu" -gt 0 ]]; then
                        service_issues+=("{\"issue\":\"high_cpu_usage\",\"count\":$high_cpu,\"threshold\":\"80%\"}")
                    fi

                    # 메모리 사용률 높음 (90% 이상)
                    local high_memory
                    high_memory=$(grep -E "MEM.*9[0-9]\.[0-9]+%|MEM.*100\.00%" "$metrics_file" 2>/dev/null | wc -l)
                    if [[ "$high_memory" -gt 0 ]]; then
                        service_issues+=("{\"issue\":\"high_memory_usage\",\"count\":$high_memory,\"threshold\":\"90%\"}")
                    fi
                fi
            fi
        done

        if [[ ${#service_issues[@]} -gt 0 ]]; then
            performance_issues+=("{\"service\":\"$service\",\"issues\":[$(IFS=,; echo "${service_issues[*]}")]}")
        fi
    done

    # 성능 분석 결과 저장
    printf '{"analysis_time":"%s","korean_requirements":{"response_time_threshold_ms":%d,"concurrent_users":10},"performance_issues":[%s]}' \
        "$(date -Iseconds)" \
        "$KOREAN_PERFORMANCE_THRESHOLD" \
        "$(IFS=,; echo "${performance_issues[*]}")" | jq . > "$perf_report"

    log_success "성능 이슈 분석 완료"
}

# 로그 분석 - 한국어 요구사항 검증
analyze_korean_requirements() {
    log_step "한국어 요구사항 검증"

    local korean_report="${ANALYSIS_DIR}/reports/korean_requirements.json"
    local requirements_status=()

    # 1. UTF-8 인코딩 검증
    log_debug "UTF-8 인코딩 검증"
    local encoding_issues=0
    for service in "${SERVICES[@]}"; do
        local log_files=("${ANALYSIS_DIR}/raw/${service}.log" "${ANALYSIS_DIR}/raw/${service}_app.log")
        for log_file in "${log_files[@]}"; do
            if [[ -f "$log_file" ]]; then
                # 잘못된 인코딩 검사
                local encoding_errors
                encoding_errors=$(file "$log_file" | grep -v "UTF-8" | wc -l)
                encoding_issues=$((encoding_issues + encoding_errors))
            fi
        done
    done
    requirements_status+=("{\"requirement\":\"utf8_encoding\",\"status\":\"$([ $encoding_issues -eq 0 ] && echo "pass" || echo "fail")\",\"issues\":$encoding_issues}")

    # 2. 응답 시간 요구사항 (< 3초) 검증
    log_debug "응답 시간 요구사항 검증"
    local response_time_violations=0
    for service in "backend" "frontend"; do
        local metrics_file="${ANALYSIS_DIR}/raw/${service}.log.metrics"
        if [[ -f "$metrics_file" ]]; then
            # 3초 이상 응답 시간 검사
            local violations
            violations=$(grep -E "⚠️.*한국어.*성능.*요구사항.*위반" "$metrics_file" 2>/dev/null | wc -l)
            response_time_violations=$((response_time_violations + violations))
        fi
    done
    requirements_status+=("{\"requirement\":\"response_time_3s\",\"status\":\"$([ $response_time_violations -eq 0 ] && echo "pass" || echo "fail")\",\"violations\":$response_time_violations}")

    # 3. 동시 사용자 지원 (10명) 검증
    log_debug "동시 사용자 지원 검증"
    local connection_issues=0
    local max_connections=0

    # PostgreSQL 연결 수 확인
    local postgres_metrics="${ANALYSIS_DIR}/raw/postgres.log.metrics"
    if [[ -f "$postgres_metrics" ]]; then
        max_connections=$(grep -E "active_connections.*[0-9]+" "$postgres_metrics" 2>/dev/null | awk '{print $NF}' | sort -n | tail -1)
        if [[ "$max_connections" -gt 10 ]]; then
            log_info "최대 동시 연결 수: $max_connections (목표: 10명 이상 지원)"
        fi
    fi

    # 연결 관련 오류 검사
    for service in "${SERVICES[@]}"; do
        local log_files=("${ANALYSIS_DIR}/raw/${service}.log" "${ANALYSIS_DIR}/raw/${service}_app.log")
        for log_file in "${log_files[@]}"; do
            if [[ -f "$log_file" ]]; then
                local conn_errors
                conn_errors=$(grep -iE "connection.*refused|too many connections|connection.*timeout" "$log_file" 2>/dev/null | wc -l)
                connection_issues=$((connection_issues + conn_errors))
            fi
        done
    done
    requirements_status+=("{\"requirement\":\"concurrent_users_10\",\"status\":\"$([ $connection_issues -eq 0 ] && echo "pass" || echo "fail")\",\"max_connections\":$max_connections,\"connection_errors\":$connection_issues}")

    # 4. 한국어 메시지 지원 검증
    log_debug "한국어 메시지 지원 검증"
    local korean_messages=0
    for service in "${SERVICES[@]}"; do
        local log_files=("${ANALYSIS_DIR}/raw/${service}.log" "${ANALYSIS_DIR}/raw/${service}_app.log")
        for log_file in "${log_files[@]}"; do
            if [[ -f "$log_file" ]]; then
                # 한글 문자 검사 (UTF-8 한글 범위)
                local korean_count
                korean_count=$(grep -oE "[가-힣]+" "$log_file" 2>/dev/null | wc -l)
                korean_messages=$((korean_messages + korean_count))
            fi
        done
    done
    requirements_status+=("{\"requirement\":\"korean_messages\",\"status\":\"$([ $korean_messages -gt 0 ] && echo "pass" || echo "partial")\",\"korean_message_count\":$korean_messages}")

    # 한국어 요구사항 검증 결과 저장
    printf '{"analysis_time":"%s","korean_requirements_verification":[%s],"summary":{"total_requirements":4,"passed":0,"failed":0,"notes":"한국어 페이지 로딩 < 3초, 10명 동시 사용자 지원, UTF-8 인코딩, 한국어 메시지 지원"}}' \
        "$(date -Iseconds)" \
        "$(IFS=,; echo "${requirements_status[*]}")" | jq . > "$korean_report"

    # 통과/실패 개수 계산 및 업데이트
    local passed_count
    local failed_count
    passed_count=$(jq '[.korean_requirements_verification[] | select(.status == "pass")] | length' "$korean_report")
    failed_count=$(jq '[.korean_requirements_verification[] | select(.status == "fail")] | length' "$korean_report")

    # 요약 정보 업데이트
    jq ".summary.passed = $passed_count | .summary.failed = $failed_count" "$korean_report" > "${korean_report}.tmp" && mv "${korean_report}.tmp" "$korean_report"

    log_success "한국어 요구사항 검증 완료 (통과: $passed_count, 실패: $failed_count)"
}

# 종합 리포트 생성
generate_comprehensive_report() {
    log_step "종합 리포트 생성"

    local comprehensive_report="${ANALYSIS_DIR}/reports/comprehensive_report.json"
    local text_report="${ANALYSIS_DIR}/reports/comprehensive_report.txt"

    # JSON 종합 리포트 생성
    {
        echo "{"
        echo "  \"collection_summary\": $(cat "${ANALYSIS_DIR}/metadata.json"),"
        echo "  \"service_status\": $(cat "${ANALYSIS_DIR}/service_status.json"),"
        echo "  \"error_analysis\": $(cat "${ANALYSIS_DIR}/reports/error_analysis.json"),"
        echo "  \"performance_analysis\": $(cat "${ANALYSIS_DIR}/reports/performance_analysis.json"),"
        echo "  \"korean_requirements\": $(cat "${ANALYSIS_DIR}/reports/korean_requirements.json"),"
        echo "  \"generation_time\": \"$(date -Iseconds)\""
        echo "}"
    } | jq . > "$comprehensive_report"

    # 텍스트 종합 리포트 생성
    {
        echo "======================================"
        echo "DOT Platform 로그 수집 및 분석 리포트"
        echo "======================================"
        echo ""
        echo "수집 ID: $COLLECTION_ID"
        echo "수집 시간: $(date)"
        echo ""

        echo "=== 서비스 상태 ==="
        jq -r '.[] | "서비스: \(.service) | 상태: \(.status) | 헬스: \(.health)"' "${ANALYSIS_DIR}/service_status.json"
        echo ""

        echo "=== 에러 분석 요약 ==="
        local total_errors
        total_errors=$(jq '[.error_patterns[].errors[].count] | add // 0' "${ANALYSIS_DIR}/reports/error_analysis.json")
        echo "총 발견된 에러: $total_errors"
        echo ""

        echo "=== 성능 분석 요약 ==="
        local total_perf_issues
        total_perf_issues=$(jq '[.performance_issues[].issues | length] | add // 0' "${ANALYSIS_DIR}/reports/performance_analysis.json")
        echo "총 성능 이슈: $total_perf_issues"
        echo ""

        echo "=== 한국어 요구사항 검증 ==="
        jq -r '.korean_requirements_verification[] | "요구사항: \(.requirement) | 상태: \(.status)"' "${ANALYSIS_DIR}/reports/korean_requirements.json"

        local passed_reqs
        local total_reqs
        passed_reqs=$(jq '.summary.passed' "${ANALYSIS_DIR}/reports/korean_requirements.json")
        total_reqs=$(jq '.summary.total_requirements' "${ANALYSIS_DIR}/reports/korean_requirements.json")
        echo ""
        echo "한국어 요구사항 통과율: $passed_reqs/$total_reqs"
        echo ""

        echo "=== 권장 사항 ==="

        # 에러가 있는 경우 권장 사항
        if [[ "$total_errors" -gt 0 ]]; then
            echo "- 발견된 에러들을 확인하여 시스템 안정성을 개선하세요"
        fi

        # 성능 이슈가 있는 경우 권장 사항
        if [[ "$total_perf_issues" -gt 0 ]]; then
            echo "- 성능 이슈를 해결하여 한국어 요구사항(< 3초)을 충족하세요"
        fi

        # 한국어 요구사항 미통과시 권장 사항
        if [[ "$passed_reqs" -lt "$total_reqs" ]]; then
            echo "- 한국어 요구사항 미통과 항목들을 점검하고 개선하세요"
        fi

        if [[ "$total_errors" -eq 0 && "$total_perf_issues" -eq 0 && "$passed_reqs" -eq "$total_reqs" ]]; then
            echo "- 모든 검증 항목이 통과되었습니다. 시스템이 정상적으로 운영되고 있습니다."
        fi

        echo ""
        echo "상세 로그 위치: $ANALYSIS_DIR"
        echo "======================================"

    } > "$text_report"

    log_success "종합 리포트 생성 완료"
    log_info "JSON 리포트: $comprehensive_report"
    log_info "텍스트 리포트: $text_report"
}

# 오래된 로그 정리
cleanup_old_logs() {
    log_step "오래된 로그 정리"

    local logs_analysis_dir="${LOGS_DIR}/analysis"

    if [[ -d "$logs_analysis_dir" ]]; then
        # 지정된 보관 기간보다 오래된 디렉토리 삭제
        find "$logs_analysis_dir" -type d -name "collection-*" -mtime +"$LOG_RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true

        local deleted_count
        deleted_count=$(find "$logs_analysis_dir" -type d -name "collection-*" -mtime +"$LOG_RETENTION_DAYS" 2>/dev/null | wc -l)

        if [[ "$deleted_count" -gt 0 ]]; then
            log_info "정리된 오래된 로그 디렉토리: $deleted_count개"
        else
            log_info "정리할 오래된 로그가 없습니다"
        fi
    fi

    log_success "로그 정리 완료"
}

# 메인 실행 함수
main() {
    local start_time
    start_time=$(date +%s)

    log_info "======================================"
    log_info "DOT Platform 로그 수집 및 분석 시작"
    log_info "수집 ID: $COLLECTION_ID"
    log_info "======================================"

    # 실행 단계
    check_prerequisites
    prepare_collection_environment
    check_service_status
    collect_service_logs

    # 분석 단계
    analyze_error_patterns
    analyze_performance_issues
    analyze_korean_requirements

    # 리포트 생성
    generate_comprehensive_report

    # 정리
    cleanup_old_logs

    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # 수집 완료 시간 기록
    echo "$(date '+%Y-%m-%d %H:%M:%S')" > "${ANALYSIS_DIR}/collection_end.timestamp"

    log_info "======================================"
    log_success "로그 수집 및 분석 완료 (소요시간: ${duration}초)"
    log_info "결과 위치: $ANALYSIS_DIR"
    log_info "======================================"

    # 요약 정보 출력
    cat "${ANALYSIS_DIR}/reports/comprehensive_report.txt"
}

# 명령행 인수 처리
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -s|--services)
            IFS=',' read -ra SERVICES <<< "$2"
            shift 2
            ;;
        -d|--duration)
            LOG_COLLECTION_TIMEOUT="$2"
            shift 2
            ;;
        -a|--analysis)
            LOG_ANALYSIS_DEPTH="$2"
            shift 2
            ;;
        --debug)
            DEBUG="true"
            shift
            ;;
        *)
            POSITIONAL_ARGS+=("$1")
            shift
            ;;
    esac
done

# 스크립트 직접 실행시에만 main 함수 호출
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "${POSITIONAL_ARGS[@]}"
fi