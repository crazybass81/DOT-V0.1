#!/bin/bash

# DOT Platform K6 로드 테스트 실행 스크립트
# 다양한 시나리오와 설정으로 K6 테스트를 쉽게 실행

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

log_step() {
    echo -e "${BLUE}[단계]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${PURPLE}[성공]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# 설정 변수
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
readonly K6_SCRIPT="${PROJECT_DIR}/tests/performance/k6-load-test.js"
readonly RESULTS_DIR="${PROJECT_DIR}/logs/k6-results"

# 기본 설정
BASE_URL="${BASE_URL:-http://localhost}"
K6_OUTPUT_FORMAT="${K6_OUTPUT_FORMAT:-json}"

# 도움말 표시
show_help() {
    cat << EOF
DOT Platform K6 로드 테스트 실행 스크립트

사용법:
    $0 [옵션] [시나리오]

시나리오:
    korean          한국어 요구사항 검증 (10명, 2분)
    ramp-up         점진적 부하 증가 테스트
    spike           스파이크 테스트 (순간 부하)
    stress          스트레스 테스트 (한계 테스트)
    all             모든 시나리오 순차 실행
    custom          사용자 정의 설정

옵션:
    --url URL              테스트 대상 URL (기본값: http://localhost)
    --vus NUMBER           동시 사용자 수 (기본값: 10)
    --duration TIME        테스트 지속 시간 (예: 30s, 2m, 1h)
    --scenario TYPE        특정 시나리오 실행 (main, login, dashboard, api, mixed)
    --output FORMAT        출력 형식 (json, csv, cloud)
    --results-dir DIR      결과 저장 디렉토리
    --quiet                최소한의 출력만 표시
    --debug                디버그 모드 활성화
    --install              K6 설치 (필요한 경우)
    --help                 이 도움말 표시

한국어 요구사항 검증:
    - 페이지 로딩: < 3초
    - 동시 사용자: 10명 지원
    - 오류율: < 1%

예시:
    $0 korean                           # 한국어 요구사항 검증
    $0 ramp-up --vus 20 --duration 5m  # 20명까지 5분간 점진적 증가
    $0 custom --vus 50 --duration 10m  # 50명 10분간 커스텀 테스트
    $0 --url https://dot.example.com    # 특정 URL 테스트
    $0 all --output csv                 # 모든 테스트를 CSV로 저장
EOF
}

# K6 설치 확인 및 설치
check_k6_installation() {
    if ! command -v k6 &> /dev/null; then
        log_warning "K6가 설치되어 있지 않습니다."

        if [[ "${1:-}" == "--install" ]]; then
            install_k6
        else
            log_error "K6를 설치하려면 --install 옵션을 사용하세요."
            exit 1
        fi
    else
        local k6_version=$(k6 version | head -1)
        log_info "K6 설치 확인: $k6_version"
    fi
}

# K6 설치
install_k6() {
    log_step "K6 설치 중..."

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux 설치
        if command -v apt-get &> /dev/null; then
            # Ubuntu/Debian
            sudo gpg -k
            sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
            echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
            sudo apt-get update
            sudo apt-get install k6
        elif command -v yum &> /dev/null; then
            # CentOS/RHEL/Amazon Linux
            sudo wget https://dl.k6.io/rpm/repo.rpm -O /tmp/k6-repo.rpm
            sudo rpm --import /tmp/k6-repo.rpm
            sudo yum install k6
        else
            log_error "지원되지 않는 Linux 배포판입니다. 수동으로 K6를 설치하세요."
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS 설치
        if command -v brew &> /dev/null; then
            brew install k6
        else
            log_error "Homebrew가 필요합니다. https://brew.sh/ 에서 설치하세요."
            exit 1
        fi
    else
        log_error "지원되지 않는 운영체제입니다. 수동으로 K6를 설치하세요."
        exit 1
    fi

    log_success "K6 설치 완료"
}

# 결과 디렉토리 초기화
init_results_dir() {
    mkdir -p "$RESULTS_DIR"
    log_info "결과 디렉토리 준비: $RESULTS_DIR"
}

# 한국어 요구사항 검증 테스트
run_korean_requirements_test() {
    log_step "한국어 요구사항 검증 테스트 시작"
    log_info "조건: 10명 동시 사용자, 2분간, < 3초 페이지 로딩"

    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/korean_requirements_${timestamp}.json"

    local k6_options=$(cat << EOF
{
  "scenarios": {
    "korean_requirement_test": {
      "executor": "constant-vus",
      "vus": 10,
      "duration": "2m"
    }
  },
  "thresholds": {
    "http_req_duration": ["p(95)<3000"],
    "http_req_failed": ["rate<0.01"]
  }
}
EOF
)

    echo "$k6_options" > "/tmp/k6-korean-config.json"

    K6_OPTIONS="/tmp/k6-korean-config.json" \
    BASE_URL="$BASE_URL" \
    k6 run --out "json=$results_file" "$K6_SCRIPT"

    analyze_korean_requirements "$results_file"
}

# 점진적 부하 증가 테스트
run_ramp_up_test() {
    local vus=${1:-15}
    local duration=${2:-5m}

    log_step "점진적 부하 증가 테스트 시작"
    log_info "최대 사용자: $vus 명, 지속 시간: $duration"

    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/ramp_up_${timestamp}.json"

    BASE_URL="$BASE_URL" \
    k6 run \
        --vus 1 \
        --stage "1m:5" \
        --stage "2m:$vus" \
        --stage "2m:$vus" \
        --stage "1m:0" \
        --out "json=$results_file" \
        "$K6_SCRIPT"

    log_success "점진적 부하 테스트 완료: $results_file"
}

# 스파이크 테스트
run_spike_test() {
    log_step "스파이크 테스트 시작"
    log_info "급격한 부하 증가로 시스템 안정성 검증"

    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/spike_test_${timestamp}.json"

    BASE_URL="$BASE_URL" \
    k6 run \
        --stage "10s:10" \
        --stage "5s:50" \
        --stage "10s:50" \
        --stage "5s:10" \
        --stage "10s:10" \
        --out "json=$results_file" \
        "$K6_SCRIPT"

    log_success "스파이크 테스트 완료: $results_file"
}

# 스트레스 테스트
run_stress_test() {
    log_step "스트레스 테스트 시작"
    log_info "시스템 한계 및 복구 능력 검증"

    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/stress_test_${timestamp}.json"

    BASE_URL="$BASE_URL" \
    k6 run \
        --stage "1m:20" \
        --stage "2m:30" \
        --stage "1m:40" \
        --stage "2m:40" \
        --stage "1m:0" \
        --out "json=$results_file" \
        "$K6_SCRIPT"

    log_success "스트레스 테스트 완료: $results_file"
}

# 커스텀 테스트
run_custom_test() {
    local vus=${1:-10}
    local duration=${2:-1m}
    local scenario=${3:-mixed}

    log_step "커스텀 테스트 시작"
    log_info "사용자: $vus 명, 지속시간: $duration, 시나리오: $scenario"

    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local results_file="$RESULTS_DIR/custom_${timestamp}.json"

    BASE_URL="$BASE_URL" \
    SCENARIO="$scenario" \
    k6 run \
        --vus "$vus" \
        --duration "$duration" \
        --out "json=$results_file" \
        "$K6_SCRIPT"

    log_success "커스텀 테스트 완료: $results_file"
}

# 한국어 요구사항 결과 분석
analyze_korean_requirements() {
    local results_file="$1"

    if [[ ! -f "$results_file" ]]; then
        log_error "결과 파일을 찾을 수 없습니다: $results_file"
        return 1
    fi

    log_step "한국어 요구사항 결과 분석"

    # jq를 사용하여 결과 분석 (jq가 없는 경우 기본 분석)
    if command -v jq &> /dev/null; then
        local summary_file="${results_file%.json}_summary.json"

        # 핵심 메트릭 추출
        local analysis=$(cat << 'EOF'
{
  "korean_requirements_analysis": {
    "page_load_time": {
      "requirement": "< 3초 (3000ms)",
      "p95_ms": (.metrics.http_req_duration.values.p95 // 0),
      "avg_ms": (.metrics.http_req_duration.values.avg // 0),
      "max_ms": (.metrics.http_req_duration.values.max // 0),
      "passed": ((.metrics.http_req_duration.values.p95 // 9999) < 3000)
    },
    "concurrent_users": {
      "requirement": "10명 동시 사용자",
      "max_vus": (.metrics.vus.values.max // 0),
      "avg_vus": (.metrics.vus.values.avg // 0),
      "passed": ((.metrics.vus.values.max // 0) >= 10)
    },
    "error_rate": {
      "requirement": "< 1% 오류율",
      "error_rate_percent": ((.metrics.http_req_failed.values.rate // 0) * 100),
      "total_requests": (.metrics.http_reqs.values.count // 0),
      "failed_requests": ((.metrics.http_req_failed.values.rate // 0) * (.metrics.http_reqs.values.count // 0)),
      "passed": ((.metrics.http_req_failed.values.rate // 0) < 0.01)
    },
    "overall_passed": (
      ((.metrics.http_req_duration.values.p95 // 9999) < 3000) and
      ((.metrics.vus.values.max // 0) >= 10) and
      ((.metrics.http_req_failed.values.rate // 0) < 0.01)
    )
  }
}
EOF
)

        jq "$analysis" "$results_file" > "$summary_file"

        # 결과 출력
        local overall_passed=$(jq -r '.korean_requirements_analysis.overall_passed' "$summary_file")
        local p95_time=$(jq -r '.korean_requirements_analysis.page_load_time.p95_ms' "$summary_file")
        local max_vus=$(jq -r '.korean_requirements_analysis.concurrent_users.max_vus' "$summary_file")
        local error_rate=$(jq -r '.korean_requirements_analysis.error_rate.error_rate_percent' "$summary_file")

        echo ""
        echo "========================================="
        echo "한국어 요구사항 검증 결과"
        echo "========================================="
        echo "📊 페이지 로딩 시간: ${p95_time}ms (P95) - 요구사항: < 3000ms"
        echo "👥 동시 사용자 수: ${max_vus}명 - 요구사항: 10명"
        echo "❌ 오류율: ${error_rate}% - 요구사항: < 1%"
        echo ""

        if [[ "$overall_passed" == "true" ]]; then
            log_success "🎉 모든 한국어 요구사항을 충족합니다!"
        else
            log_error "⚠️  일부 한국어 요구사항을 충족하지 못했습니다."
        fi

        echo "자세한 결과: $summary_file"
    else
        log_warning "jq가 설치되어 있지 않아 기본 분석만 수행합니다."
        echo "K6 테스트 완료: $results_file"
    fi
}

# 모든 테스트 실행
run_all_tests() {
    log_step "전체 테스트 스위트 실행 시작"

    echo "1. 한국어 요구사항 검증 테스트"
    run_korean_requirements_test

    echo ""
    echo "2. 점진적 부하 증가 테스트"
    run_ramp_up_test

    echo ""
    echo "3. 스파이크 테스트"
    run_spike_test

    echo ""
    echo "4. 스트레스 테스트"
    run_stress_test

    log_success "전체 테스트 스위트 완료"
    log_info "결과 디렉토리: $RESULTS_DIR"
}

# 최근 결과 확인
show_recent_results() {
    log_info "최근 K6 테스트 결과:"

    if [[ -d "$RESULTS_DIR" ]]; then
        local recent_files=$(ls -t "$RESULTS_DIR"/*.json 2>/dev/null | head -5)

        if [[ -n "$recent_files" ]]; then
            echo "$recent_files" | while read -r file; do
                local basename=$(basename "$file")
                local timestamp=$(stat -c %y "$file" 2>/dev/null || stat -f %Sm "$file" 2>/dev/null || echo "Unknown")
                echo "  - $basename (생성: $timestamp)"
            done
        else
            log_warning "테스트 결과 파일이 없습니다."
        fi
    else
        log_warning "결과 디렉토리가 없습니다: $RESULTS_DIR"
    fi
}

# 메인 함수
main() {
    local scenario=""
    local vus=10
    local duration="1m"
    local custom_scenario="mixed"
    local quiet=false

    # 인자 파싱
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_help
                exit 0
                ;;
            --url)
                BASE_URL="$2"
                shift 2
                ;;
            --vus)
                vus="$2"
                shift 2
                ;;
            --duration)
                duration="$2"
                shift 2
                ;;
            --scenario)
                custom_scenario="$2"
                shift 2
                ;;
            --output)
                K6_OUTPUT_FORMAT="$2"
                shift 2
                ;;
            --results-dir)
                RESULTS_DIR="$2"
                shift 2
                ;;
            --quiet)
                quiet=true
                shift
                ;;
            --debug)
                set -x
                shift
                ;;
            --install)
                check_k6_installation --install
                exit 0
                ;;
            --results)
                show_recent_results
                exit 0
                ;;
            korean|ramp-up|spike|stress|all|custom)
                scenario="$1"
                shift
                ;;
            *)
                log_error "알 수 없는 옵션: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # 기본값 설정
    if [[ -z "$scenario" ]]; then
        scenario="korean"
    fi

    # K6 설치 확인
    check_k6_installation

    # K6 스크립트 존재 확인
    if [[ ! -f "$K6_SCRIPT" ]]; then
        log_error "K6 테스트 스크립트를 찾을 수 없습니다: $K6_SCRIPT"
        exit 1
    fi

    # 결과 디렉토리 초기화
    init_results_dir

    # 테스트 실행
    case "$scenario" in
        korean)
            run_korean_requirements_test
            ;;
        ramp-up)
            run_ramp_up_test "$vus" "$duration"
            ;;
        spike)
            run_spike_test
            ;;
        stress)
            run_stress_test
            ;;
        custom)
            run_custom_test "$vus" "$duration" "$custom_scenario"
            ;;
        all)
            run_all_tests
            ;;
        *)
            log_error "알 수 없는 시나리오: $scenario"
            show_help
            exit 1
            ;;
    esac
}

# 스크립트가 직접 실행될 때만 main 함수 호출
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi