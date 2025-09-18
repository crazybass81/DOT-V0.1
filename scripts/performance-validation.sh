#!/bin/bash

# DOT Platform 성능 검증 스크립트
# 한국어 요구사항: < 3초 페이지 로딩, 10명 동시 사용자 지원

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
readonly RESULTS_DIR="${LOG_DIR}/performance"
readonly TEMP_DIR="/tmp/dot-performance-$$"

# 성능 테스트 설정 (한국어 요구사항 기반)
readonly MAX_PAGE_LOAD_TIME=3000    # 3초 (3000ms)
readonly TARGET_CONCURRENT_USERS=10  # 10명 동시 사용자
readonly TEST_DURATION=60           # 60초 테스트 지속 시간
readonly RAMP_UP_TIME=10            # 10초 램프업 시간

# URL 설정
BASE_URL=${BASE_URL:-"http://localhost"}
API_BASE_URL=${API_BASE_URL:-"$BASE_URL/api"}

# 테스트 결과 저장
declare -A PERFORMANCE_RESULTS

# 도움말 표시
show_help() {
    cat << EOF
DOT Platform 성능 검증 스크립트

사용법:
    $0 [옵션]

옵션:
    --url URL                 테스트할 기본 URL (기본값: http://localhost)
    --users NUMBER           동시 사용자 수 (기본값: 10)
    --duration SECONDS       테스트 지속 시간 (기본값: 60초)
    --page-load              페이지 로딩 시간 테스트만 실행
    --concurrent             동시 사용자 테스트만 실행
    --api                    API 성능 테스트만 실행
    --full                   전체 성능 테스트 실행 (기본값)
    --report                 최근 성능 테스트 결과 확인
    --compare DATE           특정 날짜와 성능 비교
    --json                   JSON 형식으로 결과 출력
    --debug                  디버그 모드 활성화
    --help                   이 도움말 표시

한국어 요구사항 검증:
    - 페이지 로딩 시간: < 3초
    - 동시 사용자 지원: 10명
    - 응답 시간 안정성: 95% 요청이 임계값 내 완료

예시:
    $0 --full                         # 전체 성능 테스트
    $0 --page-load --users 5          # 5명 사용자로 페이지 로딩 테스트
    $0 --url https://dot.example.com  # 특정 URL 테스트
    $0 --report                       # 최근 결과 확인
EOF
}

# 초기화
init_performance_test() {
    mkdir -p "$RESULTS_DIR"
    mkdir -p "$TEMP_DIR"

    # 기본 연결성 확인
    if ! curl -s --max-time 10 "$BASE_URL" > /dev/null; then
        log_error "기본 URL에 접근할 수 없습니다: $BASE_URL"
        exit 1
    fi

    log_info "성능 테스트 초기화 완료"
    log_info "테스트 대상 URL: $BASE_URL"
    log_info "한국어 요구사항 - 페이지 로딩: < ${MAX_PAGE_LOAD_TIME}ms, 동시 사용자: ${TARGET_CONCURRENT_USERS}명"
}

# 페이지 로딩 시간 테스트
test_page_load_performance() {
    log_step "페이지 로딩 성능 테스트 시작"

    local test_pages=("/" "/login" "/dashboard")
    local total_tests=0
    local passed_tests=0
    local failed_tests=0

    for page in "${test_pages[@]}"; do
        local url="$BASE_URL$page"
        log_debug "페이지 테스트: $url"

        local load_times=()
        local test_count=5

        for ((i=1; i<=test_count; i++)); do
            local start_time=$(date +%s%3N)

            if curl -s --max-time 10 "$url" > /dev/null; then
                local end_time=$(date +%s%3N)
                local load_time=$((end_time - start_time))
                load_times+=($load_time)
                log_debug "테스트 $i/$test_count: ${load_time}ms"
            else
                log_warning "페이지 로딩 실패: $url (테스트 $i/$test_count)"
                load_times+=(9999)  # 실패 시 높은 값
            fi

            sleep 1  # 테스트 간격
        done

        # 통계 계산
        local sum=0
        local min_time=${load_times[0]}
        local max_time=${load_times[0]}

        for time in "${load_times[@]}"; do
            sum=$((sum + time))
            if [[ $time -lt $min_time ]]; then
                min_time=$time
            fi
            if [[ $time -gt $max_time ]]; then
                max_time=$time
            fi
        done

        local avg_time=$((sum / test_count))
        total_tests=$((total_tests + 1))

        # 결과 평가
        if [[ $avg_time -le $MAX_PAGE_LOAD_TIME ]]; then
            passed_tests=$((passed_tests + 1))
            log_success "페이지 로딩 성능 통과: $page (평균: ${avg_time}ms, 최대: ${max_time}ms)"
        else
            failed_tests=$((failed_tests + 1))
            log_error "페이지 로딩 성능 실패: $page (평균: ${avg_time}ms > ${MAX_PAGE_LOAD_TIME}ms)"
        fi

        # 결과 저장
        PERFORMANCE_RESULTS["page_load_${page//\//_}"]="avg:${avg_time},min:${min_time},max:${max_time}"
    done

    log_info "페이지 로딩 테스트 완료: 통과 $passed_tests/$total_tests"
    return $([[ $failed_tests -eq 0 ]] && echo 0 || echo 1)
}

# 동시 사용자 테스트
test_concurrent_users() {
    log_step "동시 사용자 성능 테스트 시작 (목표: ${TARGET_CONCURRENT_USERS}명)"

    local test_url="$BASE_URL/"
    local concurrent_users=${1:-$TARGET_CONCURRENT_USERS}
    local test_duration=${2:-30}

    log_info "$concurrent_users 명의 동시 사용자로 $test_duration 초간 테스트"

    # 동시 요청 실행
    local start_time=$(date +%s)
    local pids=()
    local response_times_file="$TEMP_DIR/response_times.txt"
    local errors_file="$TEMP_DIR/errors.txt"

    > "$response_times_file"
    > "$errors_file"

    # 동시 사용자 시뮬레이션
    for ((user=1; user<=concurrent_users; user++)); do
        {
            local user_start_time=$(date +%s)
            local user_requests=0
            local user_errors=0

            while [[ $(($(date +%s) - user_start_time)) -lt $test_duration ]]; do
                local req_start=$(date +%s%3N)

                if curl -s --max-time 10 "$test_url" > /dev/null 2>&1; then
                    local req_end=$(date +%s%3N)
                    local response_time=$((req_end - req_start))
                    echo "$response_time" >> "$response_times_file"
                    user_requests=$((user_requests + 1))
                else
                    echo "Error at $(date)" >> "$errors_file"
                    user_errors=$((user_errors + 1))
                fi

                sleep 0.5  # 사용자당 2 RPS
            done

            log_debug "사용자 $user 완료: 요청 $user_requests개, 오류 $user_errors개"
        } &
        pids+=($!)
    done

    # 모든 사용자 테스트 완료 대기
    for pid in "${pids[@]}"; do
        wait "$pid"
    done

    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))

    # 결과 분석
    local total_requests=0
    local total_response_time=0
    local response_times=()

    if [[ -f "$response_times_file" ]]; then
        while IFS= read -r response_time; do
            if [[ -n "$response_time" ]]; then
                response_times+=($response_time)
                total_response_time=$((total_response_time + response_time))
                total_requests=$((total_requests + 1))
            fi
        done < "$response_times_file"
    fi

    local total_errors=$(wc -l < "$errors_file" 2>/dev/null || echo 0)

    if [[ $total_requests -gt 0 ]]; then
        local avg_response_time=$((total_response_time / total_requests))
        local success_rate=$(echo "scale=2; (1 - $total_errors / ($total_requests + $total_errors)) * 100" | bc -l 2>/dev/null || echo "100")

        # 95th 백분위수 계산
        local sorted_times=($(printf '%s\n' "${response_times[@]}" | sort -n))
        local p95_index=$(echo "scale=0; ${#sorted_times[@]} * 0.95 / 1" | bc)
        local p95_response_time=${sorted_times[$p95_index]:-0}

        log_info "동시 사용자 테스트 결과:"
        log_info "  - 동시 사용자: $concurrent_users 명"
        log_info "  - 총 요청: $total_requests 개"
        log_info "  - 총 오류: $total_errors 개"
        log_info "  - 성공률: ${success_rate}%"
        log_info "  - 평균 응답시간: ${avg_response_time}ms"
        log_info "  - 95% 응답시간: ${p95_response_time}ms"

        # 성능 기준 평가
        local test_passed=true
        if [[ $avg_response_time -gt $MAX_PAGE_LOAD_TIME ]]; then
            log_error "평균 응답시간이 임계값 초과: ${avg_response_time}ms > ${MAX_PAGE_LOAD_TIME}ms"
            test_passed=false
        fi

        if [[ $p95_response_time -gt $MAX_PAGE_LOAD_TIME ]]; then
            log_error "95% 응답시간이 임계값 초과: ${p95_response_time}ms > ${MAX_PAGE_LOAD_TIME}ms"
            test_passed=false
        fi

        local success_rate_int=${success_rate%.*}
        if [[ $success_rate_int -lt 95 ]]; then
            log_error "성공률이 95% 미만: ${success_rate}%"
            test_passed=false
        fi

        # 결과 저장
        PERFORMANCE_RESULTS["concurrent_users"]="users:${concurrent_users},avg:${avg_response_time},p95:${p95_response_time},success_rate:${success_rate}"

        if [[ "$test_passed" == "true" ]]; then
            log_success "동시 사용자 테스트 통과: ${concurrent_users}명 동시 접속 지원 확인"
            return 0
        else
            log_error "동시 사용자 테스트 실패: 성능 기준 미달"
            return 1
        fi
    else
        log_error "동시 사용자 테스트 실패: 유효한 응답을 받지 못했습니다"
        return 1
    fi
}

# API 성능 테스트
test_api_performance() {
    log_step "API 성능 테스트 시작"

    local api_endpoints=(
        "GET:$API_BASE_URL/health:헬스체크"
        "GET:$BASE_URL/login:로그인페이지"
        "GET:$BASE_URL/:메인페이지"
    )

    local total_apis=0
    local passed_apis=0

    for endpoint_info in "${api_endpoints[@]}"; do
        IFS=':' read -r method url description <<< "$endpoint_info"
        total_apis=$((total_apis + 1))

        log_debug "API 테스트: $method $url ($description)"

        local api_times=()
        local test_count=10

        for ((i=1; i<=test_count; i++)); do
            local start_time=$(date +%s%3N)

            if curl -s --max-time 5 -X "$method" "$url" > /dev/null; then
                local end_time=$(date +%s%3N)
                local response_time=$((end_time - start_time))
                api_times+=($response_time)
            else
                api_times+=(5000)  # 실패 시 5초로 기록
            fi
        done

        # 통계 계산
        local sum=0
        local min_time=${api_times[0]}
        local max_time=${api_times[0]}

        for time in "${api_times[@]}"; do
            sum=$((sum + time))
            if [[ $time -lt $min_time ]]; then
                min_time=$time
            fi
            if [[ $time -gt $max_time ]]; then
                max_time=$time
            fi
        done

        local avg_time=$((sum / test_count))

        # API별 임계값 설정
        local threshold=1000  # 기본 1초
        if [[ "$url" == *"/health" ]]; then
            threshold=500  # 헬스체크는 500ms
        elif [[ "$url" == "$BASE_URL/" ]] || [[ "$url" == *"/login" ]]; then
            threshold=$MAX_PAGE_LOAD_TIME  # 페이지는 3초
        fi

        if [[ $avg_time -le $threshold ]]; then
            passed_apis=$((passed_apis + 1))
            log_success "API 성능 통과: $description (평균: ${avg_time}ms, 임계값: ${threshold}ms)"
        else
            log_error "API 성능 실패: $description (평균: ${avg_time}ms > ${threshold}ms)"
        fi

        # 결과 저장
        local endpoint_key=$(echo "$url" | sed 's|[^a-zA-Z0-9]|_|g')
        PERFORMANCE_RESULTS["api_${endpoint_key}"]="avg:${avg_time},min:${min_time},max:${max_time},threshold:${threshold}"
    done

    log_info "API 성능 테스트 완료: 통과 $passed_apis/$total_apis"
    return $([[ $passed_apis -eq $total_apis ]] && echo 0 || echo 1)
}

# 메모리 및 CPU 사용률 모니터링
monitor_resource_usage() {
    log_step "리소스 사용률 모니터링 시작"

    local monitoring_duration=30
    local sample_interval=2
    local samples=$((monitoring_duration / sample_interval))

    local cpu_samples=()
    local memory_samples=()

    for ((i=1; i<=samples; i++)); do
        # CPU 사용률
        local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' | sed 's/\..*//')
        cpu_samples+=($cpu_usage)

        # 메모리 사용률 (%)
        local memory_total=$(free | awk 'NR==2{print $2}')
        local memory_used=$(free | awk 'NR==2{print $3}')
        local memory_usage=$((memory_used * 100 / memory_total))
        memory_samples+=($memory_usage)

        log_debug "샘플 $i/$samples: CPU ${cpu_usage}%, 메모리 ${memory_usage}%"
        sleep $sample_interval
    done

    # 평균 계산
    local cpu_sum=0
    local memory_sum=0

    for cpu in "${cpu_samples[@]}"; do
        cpu_sum=$((cpu_sum + cpu))
    done

    for memory in "${memory_samples[@]}"; do
        memory_sum=$((memory_sum + memory))
    done

    local avg_cpu=$((cpu_sum / samples))
    local avg_memory=$((memory_sum / samples))

    log_info "리소스 사용률 모니터링 결과:"
    log_info "  - 평균 CPU 사용률: ${avg_cpu}%"
    log_info "  - 평균 메모리 사용률: ${avg_memory}%"

    # 임계값 확인
    if [[ $avg_cpu -gt 80 ]]; then
        log_warning "높은 CPU 사용률: ${avg_cpu}% > 80%"
    fi

    if [[ $avg_memory -gt 85 ]]; then
        log_warning "높은 메모리 사용률: ${avg_memory}% > 85%"
    fi

    # 결과 저장
    PERFORMANCE_RESULTS["resource_usage"]="cpu:${avg_cpu},memory:${avg_memory}"
}

# 결과 저장
save_performance_results() {
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/performance_${timestamp}.json"

    local json_results=$(cat << EOF
{
    "timestamp": "$(date -Iseconds)",
    "test_config": {
        "base_url": "$BASE_URL",
        "max_page_load_time_ms": $MAX_PAGE_LOAD_TIME,
        "target_concurrent_users": $TARGET_CONCURRENT_USERS,
        "test_duration_seconds": $TEST_DURATION
    },
    "korean_requirements": {
        "page_load_requirement": "< 3초 페이지 로딩",
        "concurrent_users_requirement": "10명 동시 사용자 지원"
    },
    "results": {
EOF
)

    local first_result=true
    for key in "${!PERFORMANCE_RESULTS[@]}"; do
        if [[ "$first_result" == "false" ]]; then
            json_results+=","
        fi
        json_results+="\n        \"$key\": \"${PERFORMANCE_RESULTS[$key]}\""
        first_result=false
    done

    json_results+="\n    }
}"

    echo -e "$json_results" > "$results_file"
    log_success "성능 테스트 결과 저장: $results_file"
}

# 결과 보고서 표시
show_performance_report() {
    local latest_result=$(ls -t "$RESULTS_DIR"/performance_*.json 2>/dev/null | head -1)

    if [[ -n "$latest_result" ]]; then
        log_info "최근 성능 테스트 결과:"
        cat "$latest_result" | jq .
    else
        log_warning "성능 테스트 결과를 찾을 수 없습니다."
        return 1
    fi
}

# 정리 작업
cleanup() {
    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
        log_debug "임시 디렉토리 정리 완료: $TEMP_DIR"
    fi
}

# 메인 함수
main() {
    # 종료 시 정리 작업
    trap cleanup EXIT

    local test_type="full"
    local concurrent_users=$TARGET_CONCURRENT_USERS
    local duration=$TEST_DURATION
    local output_json=false

    # 인자 파싱
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_help
                exit 0
                ;;
            --url)
                BASE_URL="$2"
                API_BASE_URL="$BASE_URL/api"
                shift 2
                ;;
            --users)
                concurrent_users="$2"
                shift 2
                ;;
            --duration)
                duration="$2"
                shift 2
                ;;
            --page-load)
                test_type="page-load"
                shift
                ;;
            --concurrent)
                test_type="concurrent"
                shift
                ;;
            --api)
                test_type="api"
                shift
                ;;
            --full)
                test_type="full"
                shift
                ;;
            --report)
                show_performance_report
                exit 0
                ;;
            --json)
                output_json=true
                shift
                ;;
            --debug)
                export DEBUG=true
                shift
                ;;
            *)
                log_error "알 수 없는 옵션: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # 초기화
    init_performance_test

    log_info "DOT Platform 성능 검증 시작"
    log_info "테스트 유형: $test_type"

    local test_results=()

    # 테스트 실행
    case $test_type in
        "page-load")
            if test_page_load_performance; then
                test_results+=("page_load:PASS")
            else
                test_results+=("page_load:FAIL")
            fi
            ;;
        "concurrent")
            if test_concurrent_users "$concurrent_users" "$duration"; then
                test_results+=("concurrent:PASS")
            else
                test_results+=("concurrent:FAIL")
            fi
            ;;
        "api")
            if test_api_performance; then
                test_results+=("api:PASS")
            else
                test_results+=("api:FAIL")
            fi
            ;;
        "full")
            log_info "전체 성능 테스트 실행"

            if test_page_load_performance; then
                test_results+=("page_load:PASS")
            else
                test_results+=("page_load:FAIL")
            fi

            if test_concurrent_users "$concurrent_users" "$duration"; then
                test_results+=("concurrent:PASS")
            else
                test_results+=("concurrent:FAIL")
            fi

            if test_api_performance; then
                test_results+=("api:PASS")
            else
                test_results+=("api:FAIL")
            fi

            monitor_resource_usage
            ;;
    esac

    # 결과 저장 및 보고
    save_performance_results

    # 전체 결과 평가
    local failed_tests=0
    for result in "${test_results[@]}"; do
        if [[ "$result" == *":FAIL" ]]; then
            failed_tests=$((failed_tests + 1))
        fi
    done

    if [[ $failed_tests -eq 0 ]]; then
        log_success "모든 성능 테스트가 통과했습니다!"
        log_success "한국어 요구사항 충족: ✓ < 3초 페이지 로딩, ✓ 10명 동시 사용자 지원"
        exit 0
    else
        log_error "$failed_tests 개의 성능 테스트가 실패했습니다"
        log_error "한국어 요구사항 미충족 항목이 있습니다"
        exit 1
    fi
}

# 스크립트가 직접 실행될 때만 main 함수 호출
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi