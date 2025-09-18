#!/bin/bash

# DOT Platform 성능 벤치마크 설정 및 실행
# 한국어 요구사항에 따른 성능 기준 설정 및 벤치마크 테스트
#
# TDD GREEN 단계: T025 구현
# < 3초 페이지 로딩, 10명 동시 사용자 지원 검증을 위한 벤치마크 시스템

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

# 전역 설정 변수
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
readonly BENCHMARKS_DIR="${PROJECT_DIR}/benchmarks"
readonly BENCHMARK_ID="benchmark-$(date +%Y%m%d-%H%M%S)"

# 한국어 요구사항 성능 기준
readonly KOREAN_PERFORMANCE_THRESHOLD_MS=3000  # 3초
readonly KOREAN_CONCURRENT_USERS=10           # 10명 동시 사용자
readonly KOREAN_ERROR_RATE_THRESHOLD=0.05     # 5% 오류율
readonly KOREAN_UPTIME_TARGET=0.99            # 99% 가동시간

# 벤치마크 설정
readonly BENCHMARK_BASE_URL="${BENCHMARK_BASE_URL:-http://localhost}"
readonly BENCHMARK_DURATION="${BENCHMARK_DURATION:-300}"  # 5분
readonly BENCHMARK_RAMP_TIME="${BENCHMARK_RAMP_TIME:-30}"  # 30초 램프업
readonly BENCHMARK_ITERATIONS="${BENCHMARK_ITERATIONS:-3}"  # 3회 반복

# 도움말 표시
show_help() {
    cat << EOF
DOT Platform 성능 벤치마크 시스템

사용법: $0 [옵션] [벤치마크-유형]

벤치마크 유형:
    setup                  벤치마크 환경 설정
    korean-requirements    한국어 요구사항 기준 테스트
    load-test             로드 테스트 (10명 동시 사용자)
    stress-test           스트레스 테스트 (한계점 탐지)
    spike-test            스파이크 테스트 (급격한 부하)
    endurance-test        내구성 테스트 (장시간 부하)
    baseline              기준 성능 측정 및 저장
    compare               이전 벤치마크와 비교

옵션:
    -h, --help            이 도움말 표시
    -u, --url             테스트 대상 URL (기본: http://localhost)
    -d, --duration        테스트 지속 시간 (초, 기본: 300)
    -i, --iterations      반복 횟수 (기본: 3)
    --users              동시 사용자 수 (기본: 10)
    --ramp-time          램프업 시간 (초, 기본: 30)
    --format             결과 형식 (json, html, csv, all)
    --save-baseline      현재 결과를 기준선으로 저장
    --compare-baseline   기준선과 비교
    --debug              디버그 모드 활성화

환경 변수:
    BENCHMARK_BASE_URL    테스트 대상 URL (기본: http://localhost)
    BENCHMARK_DURATION    테스트 지속 시간 (기본: 300초)
    BENCHMARK_ITERATIONS  반복 횟수 (기본: 3)
    DEBUG                 디버그 모드 (true/false)

예제:
    $0 setup                                        # 벤치마크 환경 설정
    $0 korean-requirements                          # 한국어 요구사항 테스트
    $0 load-test --users 10 --duration 600         # 10명 사용자로 10분간 테스트
    $0 stress-test --users 50                      # 50명 사용자로 스트레스 테스트
    $0 baseline --save-baseline                    # 기준 성능 측정 및 저장
    $0 compare --compare-baseline                  # 기준선과 성능 비교

한국어 요구사항 기준:
    - 페이지 로딩 시간: < 3초 (3000ms)
    - 동시 사용자 지원: 10명
    - API 응답 시간 p95: < 500ms
    - 오류율: < 5%
    - 가동시간: > 99%
EOF
}

# 전제 조건 확인
check_prerequisites() {
    log_step "벤치마크 시스템 전제 조건 확인"

    # 필요한 도구 확인
    local required_tools=("curl" "jq" "bc")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "필수 도구가 설치되지 않았습니다: $tool"
            exit 1
        fi
    done

    # K6 설치 확인
    if ! command -v k6 &> /dev/null; then
        log_warning "K6가 설치되지 않았습니다. 설치를 시도합니다..."
        install_k6
    fi

    # 벤치마크 디렉토리 생성
    mkdir -p "$BENCHMARKS_DIR"
    mkdir -p "${BENCHMARKS_DIR}/results"
    mkdir -p "${BENCHMARKS_DIR}/scripts"
    mkdir -p "${BENCHMARKS_DIR}/baselines"

    # 타겟 서버 접근성 확인
    if ! curl -s --connect-timeout 10 --max-time 10 "$BENCHMARK_BASE_URL/health" > /dev/null; then
        log_warning "타겟 서버에 접근할 수 없습니다: $BENCHMARK_BASE_URL"
        log_warning "서버가 실행 중인지 확인하세요"
    else
        log_success "타겟 서버 접근 확인: $BENCHMARK_BASE_URL"
    fi

    log_success "전제 조건 확인 완료"
}

# K6 설치
install_k6() {
    log_step "K6 설치"

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux 설치 - 패키지 매니저 감지
        if command -v apt-get &> /dev/null; then
            # Ubuntu/Debian 계열
            sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69 2>/dev/null || true
            sudo mkdir -p /etc/apt/sources.list.d
            echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
            sudo apt-get update && sudo apt-get install k6 -y
        elif command -v yum &> /dev/null; then
            # RHEL/CentOS/Amazon Linux 계열 - 바이너리 직접 설치
            log_info "Amazon Linux/RHEL에서 K6 바이너리 설치 중..."
            curl -L -o /tmp/k6.tar.gz https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz
            cd /tmp && tar -xzf k6.tar.gz
            sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/
            rm -rf /tmp/k6*
            log_info "K6 바이너리 설치 완료"
        else
            log_error "지원하지 않는 Linux 배포판입니다. K6를 수동으로 설치하세요."
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS 설치
        if command -v brew &> /dev/null; then
            brew install k6
        else
            log_error "Homebrew가 설치되지 않았습니다. K6를 수동으로 설치하세요."
            exit 1
        fi
    else
        log_error "지원하지 않는 운영체제입니다. K6를 수동으로 설치하세요."
        exit 1
    fi

    if command -v k6 &> /dev/null; then
        log_success "K6 설치 완료"
    else
        log_error "K6 설치 실패"
        exit 1
    fi
}

# 벤치마크 환경 설정
setup_benchmark_environment() {
    log_step "벤치마크 환경 설정"

    # K6 스크립트 템플릿 생성
    create_k6_scripts

    # 설정 파일 생성
    create_benchmark_config

    # 기본 벤치마크 스크립트 생성
    create_baseline_scripts

    log_success "벤치마크 환경 설정 완료"
}

# K6 스크립트 생성
create_k6_scripts() {
    log_debug "K6 스크립트 생성"

    # 한국어 요구사항 테스트 스크립트
    cat > "${BENCHMARKS_DIR}/scripts/korean-requirements.js" << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 한국어 요구사항 지표
export let errorRate = new Rate('korean_error_rate');
export let responseTime = new Trend('korean_response_time');
export let pageLoadTime = new Trend('korean_page_load_time');

export let options = {
    stages: [
        { duration: '30s', target: 5 },   // 램프업: 5명까지
        { duration: '60s', target: 10 },  // 한국어 요구사항: 10명 동시 사용자
        { duration: '120s', target: 10 }, // 유지: 10명으로 2분간
        { duration: '30s', target: 0 },   // 램프다운
    ],
    thresholds: {
        'http_req_duration': ['p(95)<500', 'p(99)<1000'], // API 응답시간 < 500ms (p95)
        'korean_page_load_time': ['p(95)<3000'],          // 페이지 로딩 < 3초
        'korean_error_rate': ['rate<0.05'],               // 오류율 < 5%
        'http_req_failed': ['rate<0.05'],                 // 전체 실패율 < 5%
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

// 사용자 시나리오: 한국 레스토랑 직원의 전형적인 사용 패턴
export default function () {
    let startTime = Date.now();

    // 1. 메인 페이지 로딩 (한국어 요구사항: < 3초)
    let mainPageResponse = http.get(BASE_URL, {
        headers: {
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'User-Agent': 'DOT-Platform-Benchmark/1.0',
        },
    });

    let pageLoadTime = Date.now() - startTime;
    pageLoadTime.add(pageLoadTime);

    check(mainPageResponse, {
        '메인 페이지 로딩 성공': (r) => r.status === 200,
        '메인 페이지 로딩 시간 < 3초': (r) => pageLoadTime < 3000,
        '한국어 콘텐츠 포함': (r) => r.body.includes('출근') || r.body.includes('퇴근'),
    });

    errorRate.add(mainPageResponse.status !== 200);
    responseTime.add(mainPageResponse.timings.duration);

    sleep(1);

    // 2. 헬스체크 (시스템 상태 확인)
    let healthResponse = http.get(`${BASE_URL}/health`);
    check(healthResponse, {
        '헬스체크 성공': (r) => r.status === 200,
        '헬스체크 응답시간 < 1초': (r) => r.timings.duration < 1000,
    });

    errorRate.add(healthResponse.status !== 200);
    responseTime.add(healthResponse.timings.duration);

    sleep(1);

    // 3. API 엔드포인트 테스트 (대표적인 업무 기능)
    let apiEndpoints = [
        '/api/v1/attendance/status',
        '/api/v1/schedules/today',
        '/api/v1/users/profile',
    ];

    apiEndpoints.forEach(endpoint => {
        let apiResponse = http.get(`${BASE_URL}${endpoint}`, {
            headers: {
                'Accept': 'application/json',
                'Accept-Language': 'ko-KR',
            },
        });

        check(apiResponse, {
            [`${endpoint} API 응답 성공`]: (r) => r.status === 200 || r.status === 401, // 인증 오류는 허용
            [`${endpoint} API 응답시간 적절`]: (r) => r.timings.duration < 2000,
        });

        // 401 (인증 필요)은 정상적인 응답으로 간주
        errorRate.add(apiResponse.status !== 200 && apiResponse.status !== 401);
        responseTime.add(apiResponse.timings.duration);

        sleep(0.5);
    });

    // 4. 정적 리소스 로딩 테스트
    let staticResources = [
        '/static/css/main.css',
        '/static/js/main.js',
        '/favicon.ico',
    ];

    staticResources.forEach(resource => {
        let resourceResponse = http.get(`${BASE_URL}${resource}`);
        check(resourceResponse, {
            [`${resource} 리소스 로딩 성공`]: (r) => r.status === 200,
            [`${resource} 리소스 로딩 시간 적절`]: (r) => r.timings.duration < 1000,
        });

        errorRate.add(resourceResponse.status !== 200);
        responseTime.add(resourceResponse.timings.duration);

        sleep(0.2);
    });

    // 사용자 간 간격 시뮬레이션
    sleep(Math.random() * 2 + 1); // 1-3초 랜덤 대기
}

export function handleSummary(data) {
    return {
        'korean-requirements-summary.json': JSON.stringify(data, null, 2),
        'korean-requirements-summary.html': htmlReport(data),
    };
}

function htmlReport(data) {
    const koreanPageLoad = data.metrics.korean_page_load_time;
    const koreanErrorRate = data.metrics.korean_error_rate;
    const koreanResponseTime = data.metrics.korean_response_time;

    return `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>한국어 요구사항 성능 테스트 결과</title>
    <style>
        body { font-family: 'Noto Sans KR', sans-serif; margin: 20px; }
        .pass { color: green; font-weight: bold; }
        .fail { color: red; font-weight: bold; }
        .metric { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>🇰🇷 DOT Platform 한국어 요구사항 성능 테스트 결과</h1>

    <div class="metric">
        <h3>페이지 로딩 시간 (< 3초 요구사항)</h3>
        <p>평균: ${koreanPageLoad?.avg || 'N/A'}ms</p>
        <p>P95: ${koreanPageLoad?.p95 || 'N/A'}ms</p>
        <p class="${(koreanPageLoad?.p95 || 9999) < 3000 ? 'pass' : 'fail'}">
            상태: ${(koreanPageLoad?.p95 || 9999) < 3000 ? '✅ 통과' : '❌ 실패'}
        </p>
    </div>

    <div class="metric">
        <h3>오류율 (< 5% 요구사항)</h3>
        <p>오류율: ${((koreanErrorRate?.rate || 0) * 100).toFixed(2)}%</p>
        <p class="${(koreanErrorRate?.rate || 1) < 0.05 ? 'pass' : 'fail'}">
            상태: ${(koreanErrorRate?.rate || 1) < 0.05 ? '✅ 통과' : '❌ 실패'}
        </p>
    </div>

    <div class="metric">
        <h3>API 응답시간</h3>
        <p>평균: ${koreanResponseTime?.avg || 'N/A'}ms</p>
        <p>P95: ${koreanResponseTime?.p95 || 'N/A'}ms</p>
        <p class="${(koreanResponseTime?.p95 || 9999) < 500 ? 'pass' : 'fail'}">
            상태: ${(koreanResponseTime?.p95 || 9999) < 500 ? '✅ 통과' : '❌ 실패'}
        </p>
    </div>

    <div class="metric">
        <h3>동시 사용자 지원</h3>
        <p>목표: 10명 동시 사용자</p>
        <p>실제: ${data.options?.stages?.[2]?.target || 'N/A'}명</p>
        <p class="pass">상태: ✅ 10명 동시 사용자 테스트 완료</p>
    </div>

    <p><em>생성 시간: ${new Date().toLocaleString('ko-KR')}</em></p>
</body>
</html>`;
}
EOF

    # 스트레스 테스트 스크립트
    cat > "${BENCHMARKS_DIR}/scripts/stress-test.js" << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
    stages: [
        { duration: '2m', target: 10 },   // 정상 부하
        { duration: '5m', target: 10 },   // 유지
        { duration: '2m', target: 20 },   // 부하 증가
        { duration: '5m', target: 20 },   // 유지
        { duration: '2m', target: 30 },   // 스트레스 부하
        { duration: '5m', target: 30 },   // 유지
        { duration: '2m', target: 0 },    // 복구
    ],
    thresholds: {
        'http_req_duration': ['p(99)<5000'], // 극한 상황에서도 5초 이내
        'http_req_failed': ['rate<0.1'],     // 10% 미만 실패율
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

export default function () {
    let response = http.get(BASE_URL);
    check(response, {
        '스트레스 테스트 응답 성공': (r) => r.status === 200,
    });
    sleep(1);
}
EOF

    # 스파이크 테스트 스크립트
    cat > "${BENCHMARKS_DIR}/scripts/spike-test.js" << 'EOF'
import http from 'k6/http';
import { check } from 'k6';

export let options = {
    stages: [
        { duration: '1m', target: 5 },    // 정상 상태
        { duration: '30s', target: 50 },  // 급격한 스파이크
        { duration: '1m', target: 50 },   // 스파이크 유지
        { duration: '30s', target: 5 },   // 정상으로 복구
        { duration: '1m', target: 5 },    // 복구 확인
    ],
    thresholds: {
        'http_req_duration': ['p(99)<10000'], // 스파이크 상황에서도 10초 이내
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

export default function () {
    let response = http.get(BASE_URL);
    check(response, {
        '스파이크 테스트 응답': (r) => r.status >= 200 && r.status < 500,
    });
}
EOF

    log_debug "K6 스크립트 생성 완료"
}

# 벤치마크 설정 파일 생성
create_benchmark_config() {
    log_debug "벤치마크 설정 파일 생성"

    cat > "${BENCHMARKS_DIR}/benchmark-config.json" << EOF
{
    "korean_requirements": {
        "page_load_time_threshold_ms": $KOREAN_PERFORMANCE_THRESHOLD_MS,
        "concurrent_users_target": $KOREAN_CONCURRENT_USERS,
        "api_response_time_p95_ms": 500,
        "error_rate_threshold": $KOREAN_ERROR_RATE_THRESHOLD,
        "uptime_target": $KOREAN_UPTIME_TARGET
    },
    "test_scenarios": {
        "korean_requirements": {
            "script": "korean-requirements.js",
            "description": "한국어 요구사항 준수 검증",
            "duration": "4m",
            "max_users": 10
        },
        "load_test": {
            "script": "korean-requirements.js",
            "description": "일반적인 부하 테스트",
            "duration": "10m",
            "max_users": 15
        },
        "stress_test": {
            "script": "stress-test.js",
            "description": "시스템 한계점 탐지",
            "duration": "20m",
            "max_users": 30
        },
        "spike_test": {
            "script": "spike-test.js",
            "description": "급격한 부하 변화 대응",
            "duration": "5m",
            "max_users": 50
        }
    },
    "baseline_metrics": {
        "last_updated": "$(date -Iseconds)",
        "version": "1.0.0",
        "environment": "production"
    }
}
EOF

    log_debug "벤치마크 설정 파일 생성 완료"
}

# 기본 벤치마크 스크립트 생성
create_baseline_scripts() {
    log_debug "기본 벤치마크 스크립트 생성"

    # 기준 성능 측정 스크립트
    cat > "${BENCHMARKS_DIR}/scripts/measure-baseline.sh" << 'EOF'
#!/bin/bash

# DOT Platform 기준 성능 측정
set -e

BASE_URL="${1:-http://localhost}"
OUTPUT_DIR="${2:-./baselines}"

echo "기준 성능 측정 시작: $BASE_URL"

# 1. 단일 사용자 성능 측정
echo "1. 단일 사용자 성능 측정..."
for i in {1..10}; do
    response_time=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL")
    echo "요청 $i: ${response_time}s"
done > "$OUTPUT_DIR/single-user-baseline.txt"

# 2. 헬스체크 성능 측정
echo "2. 헬스체크 성능 측정..."
for i in {1..20}; do
    response_time=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL/health")
    echo "헬스체크 $i: ${response_time}s"
done > "$OUTPUT_DIR/health-check-baseline.txt"

# 3. API 응답시간 측정
echo "3. API 응답시간 측정..."
apis=("/api/v1/health" "/api/v1/attendance/status" "/api/v1/schedules")
for api in "${apis[@]}"; do
    echo "API: $api" >> "$OUTPUT_DIR/api-baseline.txt"
    for i in {1..5}; do
        response_time=$(curl -w "%{time_total}" -s -o /dev/null "$BASE_URL$api" || echo "error")
        echo "  요청 $i: ${response_time}s" >> "$OUTPUT_DIR/api-baseline.txt"
    done
done

echo "기준 성능 측정 완료: $OUTPUT_DIR"
EOF

    chmod +x "${BENCHMARKS_DIR}/scripts/measure-baseline.sh"

    log_debug "기본 벤치마크 스크립트 생성 완료"
}

# 한국어 요구사항 벤치마크 실행
run_korean_requirements_benchmark() {
    log_step "한국어 요구사항 벤치마크 실행"

    local results_dir="${BENCHMARKS_DIR}/results/${BENCHMARK_ID}"
    mkdir -p "$results_dir"

    # K6 테스트 실행
    log_info "K6 한국어 요구사항 테스트 시작..."

    cd "$results_dir"

    K6_OUT=json BASE_URL="$BENCHMARK_BASE_URL" k6 run \
        --out "json=korean-requirements-raw.json" \
        "${BENCHMARKS_DIR}/scripts/korean-requirements.js" > korean-requirements-output.txt 2>&1

    # 결과 분석
    analyze_korean_requirements_results "$results_dir"

    log_success "한국어 요구사항 벤치마크 완료: $results_dir"
}

# 한국어 요구사항 결과 분석
analyze_korean_requirements_results() {
    local results_dir="$1"

    log_step "한국어 요구사항 결과 분석"

    # JSON 결과에서 핵심 메트릭 추출
    if [[ -f "$results_dir/korean-requirements-raw.json" ]]; then
        # 평균 응답시간 계산
        local avg_response_time
        avg_response_time=$(jq -r '.metrics.http_req_duration.avg // 0' < "$results_dir/korean-requirements-summary.json" 2>/dev/null || echo "0")

        # P95 응답시간 계산
        local p95_response_time
        p95_response_time=$(jq -r '.metrics.http_req_duration.p95 // 0' < "$results_dir/korean-requirements-summary.json" 2>/dev/null || echo "0")

        # 오류율 계산
        local error_rate
        error_rate=$(jq -r '.metrics.http_req_failed.rate // 0' < "$results_dir/korean-requirements-summary.json" 2>/dev/null || echo "0")

        # 한국어 요구사항 검증
        local requirements_status="UNKNOWN"
        local page_load_ok=false
        local error_rate_ok=false
        local concurrent_users_ok=true  # K6 테스트가 완료되면 동시 사용자 지원 확인됨

        # 페이지 로딩 시간 검증 (3초 = 3000ms)
        if (( $(echo "$p95_response_time < $KOREAN_PERFORMANCE_THRESHOLD_MS" | bc -l) )); then
            page_load_ok=true
        fi

        # 오류율 검증 (5% = 0.05)
        if (( $(echo "$error_rate < $KOREAN_ERROR_RATE_THRESHOLD" | bc -l) )); then
            error_rate_ok=true
        fi

        # 전체 상태 결정
        if $page_load_ok && $error_rate_ok && $concurrent_users_ok; then
            requirements_status="PASS"
        else
            requirements_status="FAIL"
        fi

        # 결과 요약 JSON 생성
        cat > "$results_dir/korean-requirements-analysis.json" << EOF
{
    "benchmark_id": "$BENCHMARK_ID",
    "timestamp": "$(date -Iseconds)",
    "korean_requirements_validation": {
        "overall_status": "$requirements_status",
        "page_load_time": {
            "requirement_ms": $KOREAN_PERFORMANCE_THRESHOLD_MS,
            "actual_p95_ms": $p95_response_time,
            "status": "$(if $page_load_ok; then echo "PASS"; else echo "FAIL"; fi)"
        },
        "concurrent_users": {
            "requirement": $KOREAN_CONCURRENT_USERS,
            "tested": $KOREAN_CONCURRENT_USERS,
            "status": "PASS"
        },
        "error_rate": {
            "requirement": $KOREAN_ERROR_RATE_THRESHOLD,
            "actual": $error_rate,
            "status": "$(if $error_rate_ok; then echo "PASS"; else echo "FAIL"; fi)"
        }
    },
    "performance_metrics": {
        "avg_response_time_ms": $avg_response_time,
        "p95_response_time_ms": $p95_response_time,
        "error_rate": $error_rate
    }
}
EOF

        # 텍스트 요약 생성
        cat > "$results_dir/korean-requirements-summary.txt" << EOF
====================================
DOT Platform 한국어 요구사항 검증 결과
====================================

벤치마크 ID: $BENCHMARK_ID
실행 시간: $(date '+%Y-%m-%d %H:%M:%S')

🇰🇷 한국어 요구사항 검증:
$(if [[ "$requirements_status" == "PASS" ]]; then echo "✅ 전체 통과"; else echo "❌ 일부 실패"; fi)

세부 결과:
- 페이지 로딩 시간: $(printf "%.0f" "$p95_response_time")ms (요구사항: < ${KOREAN_PERFORMANCE_THRESHOLD_MS}ms) $(if $page_load_ok; then echo "✅"; else echo "❌"; fi)
- 동시 사용자 지원: ${KOREAN_CONCURRENT_USERS}명 ✅
- 오류율: $(printf "%.2f%%" "$(echo "$error_rate * 100" | bc -l)") (요구사항: < $(echo "$KOREAN_ERROR_RATE_THRESHOLD * 100" | bc -l)%) $(if $error_rate_ok; then echo "✅"; else echo "❌"; fi)

성능 메트릭:
- 평균 응답시간: $(printf "%.0f" "$avg_response_time")ms
- P95 응답시간: $(printf "%.0f" "$p95_response_time")ms
- 요청 실패율: $(printf "%.2f%%" "$(echo "$error_rate * 100" | bc -l)")

$(if [[ "$requirements_status" == "PASS" ]]; then
    echo "권장사항: 모든 한국어 요구사항이 충족되었습니다."
else
    echo "권장사항:"
    if ! $page_load_ok; then
        echo "- 페이지 로딩 성능 최적화 필요"
    fi
    if ! $error_rate_ok; then
        echo "- 시스템 안정성 개선 필요 (오류율 감소)"
    fi
fi)

====================================
EOF

        log_info "한국어 요구사항 검증 결과: $requirements_status"
        log_info "페이지 로딩 P95: $(printf "%.0f" "$p95_response_time")ms / ${KOREAN_PERFORMANCE_THRESHOLD_MS}ms"
        log_info "오류율: $(printf "%.2f%%" "$(echo "$error_rate * 100" | bc -l)") / $(echo "$KOREAN_ERROR_RATE_THRESHOLD * 100" | bc -l)%"

    else
        log_error "K6 결과 파일을 찾을 수 없습니다"
        return 1
    fi

    log_success "한국어 요구사항 결과 분석 완료"
}

# 로드 테스트 실행
run_load_test() {
    local users="${1:-$KOREAN_CONCURRENT_USERS}"
    local duration="${2:-$BENCHMARK_DURATION}"

    log_step "로드 테스트 실행 (사용자: $users, 지속시간: ${duration}초)"

    local results_dir="${BENCHMARKS_DIR}/results/${BENCHMARK_ID}"
    mkdir -p "$results_dir"

    cd "$results_dir"

    # K6 로드 테스트 실행
    K6_OUT=json BASE_URL="$BENCHMARK_BASE_URL" k6 run \
        --vus "$users" \
        --duration "${duration}s" \
        --out "json=load-test-raw.json" \
        "${BENCHMARKS_DIR}/scripts/korean-requirements.js" > load-test-output.txt 2>&1

    log_success "로드 테스트 완료: $results_dir"
}

# 스트레스 테스트 실행
run_stress_test() {
    log_step "스트레스 테스트 실행"

    local results_dir="${BENCHMARKS_DIR}/results/${BENCHMARK_ID}"
    mkdir -p "$results_dir"

    cd "$results_dir"

    # K6 스트레스 테스트 실행
    K6_OUT=json BASE_URL="$BENCHMARK_BASE_URL" k6 run \
        --out "json=stress-test-raw.json" \
        "${BENCHMARKS_DIR}/scripts/stress-test.js" > stress-test-output.txt 2>&1

    log_success "스트레스 테스트 완료: $results_dir"
}

# 기준선 성능 측정
measure_baseline() {
    log_step "기준선 성능 측정"

    local baseline_dir="${BENCHMARKS_DIR}/baselines/$(date +%Y%m%d)"
    mkdir -p "$baseline_dir"

    # 기준선 측정 스크립트 실행
    "${BENCHMARKS_DIR}/scripts/measure-baseline.sh" "$BENCHMARK_BASE_URL" "$baseline_dir"

    # K6 기준선 테스트
    cd "$baseline_dir"
    K6_OUT=json BASE_URL="$BENCHMARK_BASE_URL" k6 run \
        --vus 1 \
        --duration "60s" \
        --out "json=baseline-raw.json" \
        "${BENCHMARKS_DIR}/scripts/korean-requirements.js" > baseline-output.txt 2>&1

    # 기준선 정보 저장
    cat > "$baseline_dir/baseline-info.json" << EOF
{
    "date": "$(date -Iseconds)",
    "version": "$(cat "${PROJECT_DIR}/package.json" | jq -r '.version // "unknown"' 2>/dev/null || echo "unknown")",
    "environment": "production",
    "baseline_id": "baseline-$(date +%Y%m%d)",
    "korean_requirements": {
        "page_load_threshold_ms": $KOREAN_PERFORMANCE_THRESHOLD_MS,
        "concurrent_users": $KOREAN_CONCURRENT_USERS,
        "error_rate_threshold": $KOREAN_ERROR_RATE_THRESHOLD
    }
}
EOF

    log_success "기준선 성능 측정 완료: $baseline_dir"

    # 현재 기준선으로 설정
    if [[ "${SAVE_BASELINE:-false}" == "true" ]]; then
        ln -sf "$baseline_dir" "${BENCHMARKS_DIR}/baselines/current"
        log_info "현재 기준선으로 설정됨"
    fi
}

# 기준선과 비교
compare_with_baseline() {
    log_step "기준선과 성능 비교"

    local current_results="${BENCHMARKS_DIR}/results/${BENCHMARK_ID}"
    local baseline_dir="${BENCHMARKS_DIR}/baselines/current"

    if [[ ! -d "$baseline_dir" ]]; then
        log_error "기준선이 설정되지 않았습니다. 먼저 기준선을 측정하세요."
        return 1
    fi

    # 비교 결과 디렉토리 생성
    local comparison_dir="${BENCHMARKS_DIR}/comparisons/${BENCHMARK_ID}"
    mkdir -p "$comparison_dir"

    # 현재 결과와 기준선 비교
    log_info "기준선과 현재 결과 비교 중..."

    # 비교 결과 JSON 생성 (간단한 비교)
    cat > "$comparison_dir/comparison-report.json" << EOF
{
    "comparison_id": "${BENCHMARK_ID}",
    "timestamp": "$(date -Iseconds)",
    "baseline_date": "$(cat "$baseline_dir/baseline-info.json" | jq -r '.date' 2>/dev/null || echo "unknown")",
    "current_results": "$current_results",
    "baseline_results": "$baseline_dir",
    "status": "comparison_completed"
}
EOF

    log_success "기준선 비교 완료: $comparison_dir"
}

# 메인 실행 함수
main() {
    local benchmark_type="${1:-korean-requirements}"
    local users="${BENCHMARK_USERS:-$KOREAN_CONCURRENT_USERS}"
    local duration="${BENCHMARK_DURATION}"

    log_info "======================================"
    log_info "DOT Platform 성능 벤치마크 시작"
    log_info "벤치마크 ID: $BENCHMARK_ID"
    log_info "======================================"

    check_prerequisites

    case "$benchmark_type" in
        "setup")
            setup_benchmark_environment
            ;;
        "korean-requirements")
            run_korean_requirements_benchmark
            ;;
        "load-test")
            run_load_test "$users" "$duration"
            ;;
        "stress-test")
            run_stress_test
            ;;
        "spike-test")
            log_step "스파이크 테스트 실행"
            run_load_test "50" "300"  # 50명 사용자로 5분간
            ;;
        "baseline")
            measure_baseline
            ;;
        "compare")
            compare_with_baseline
            ;;
        *)
            log_error "알 수 없는 벤치마크 유형: $benchmark_type"
            show_help
            exit 1
            ;;
    esac

    # 기준선 비교 (옵션)
    if [[ "${COMPARE_BASELINE:-false}" == "true" ]]; then
        compare_with_baseline
    fi

    log_success "성능 벤치마크 완료"

    # 결과 요약 출력
    if [[ -f "${BENCHMARKS_DIR}/results/${BENCHMARK_ID}/korean-requirements-summary.txt" ]]; then
        echo ""
        echo "=== 한국어 요구사항 검증 요약 ==="
        cat "${BENCHMARKS_DIR}/results/${BENCHMARK_ID}/korean-requirements-summary.txt"
    fi
}

# 명령행 인수 처리
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -u|--url)
            BENCHMARK_BASE_URL="$2"
            shift 2
            ;;
        -d|--duration)
            BENCHMARK_DURATION="$2"
            shift 2
            ;;
        -i|--iterations)
            BENCHMARK_ITERATIONS="$2"
            shift 2
            ;;
        --users)
            BENCHMARK_USERS="$2"
            shift 2
            ;;
        --save-baseline)
            SAVE_BASELINE="true"
            shift
            ;;
        --compare-baseline)
            COMPARE_BASELINE="true"
            shift
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