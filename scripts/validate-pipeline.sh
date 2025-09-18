#!/bin/bash

# DOT Platform 전체 배포 검증 파이프라인 스크립트
# 버전: 1.0.0
# 작성일: 2025-09-18
# 목적: 전체 배포 검증 시스템의 완전성과 신뢰성을 종합적으로 검증

set -euo pipefail

# 색상 및 로깅 설정
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 로깅 함수들
log_info() {
    echo -e "${BLUE}[정보]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[성공]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[경고]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[오류]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_step() {
    echo -e "${PURPLE}[단계]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_pipeline() {
    echo -e "${CYAN}[파이프라인]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# 전역 변수
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PIPELINE_LOG_DIR="$PROJECT_ROOT/logs/pipeline"
PIPELINE_RESULTS_DIR="$PROJECT_ROOT/pipeline-results"
PIPELINE_ID="pipeline-$(date '+%Y%m%d-%H%M%S')"
PIPELINE_LOG_FILE="$PIPELINE_LOG_DIR/pipeline-$PIPELINE_ID.log"

# 파이프라인 설정
PIPELINE_TIMEOUT=3600  # 1시간
STAGE_TIMEOUT=900      # 15분
RETRY_COUNT=3
RETRY_DELAY=30

# 검증 스크립트 목록
declare -A VALIDATION_SCRIPTS=(
    ["system"]="$PROJECT_ROOT/scripts/validate-system.sh"
    ["deployment"]="$PROJECT_ROOT/scripts/validate-deployment.sh"
    ["korean-requirements"]="$PROJECT_ROOT/scripts/validate-korean-requirements.sh"
    ["performance"]="$PROJECT_ROOT/scripts/benchmark-performance.sh"
    ["rollback"]="$PROJECT_ROOT/scripts/validate-rollback.sh"
    ["manual-tests"]="$PROJECT_ROOT/scripts/run-manual-tests.sh"
    ["reporting"]="$PROJECT_ROOT/scripts/generate-report.sh"
)

# 파이프라인 단계 정의
declare -A PIPELINE_STAGES=(
    ["1"]="전제조건 검증"
    ["2"]="시스템 검증"
    ["3"]="배포 검증"
    ["4"]="한국어 요구사항 검증"
    ["5"]="성능 벤치마크"
    ["6"]="롤백 절차 검증"
    ["7"]="수동 테스트 자동화"
    ["8"]="결과 리포팅"
    ["9"]="최종 검증"
)

# 디렉토리 생성
mkdir -p "$PIPELINE_LOG_DIR"
mkdir -p "$PIPELINE_RESULTS_DIR"

# 도움말 표시
show_help() {
    cat << EOF
DOT Platform 전체 배포 검증 파이프라인 스크립트

사용법: $0 [옵션] [모드]

모드:
    full                전체 파이프라인 실행 (기본값)
    quick               빠른 검증 (성능 테스트 단축)
    stage               특정 단계만 실행
    validate            파이프라인 구성 검증만
    report              기존 결과 리포트 생성

옵션:
    -h, --help          이 도움말 표시
    --stage             실행할 단계 번호 (1-9)
    --timeout           전체 파이프라인 타임아웃 (초, 기본: 3600)
    --stage-timeout     각 단계별 타임아웃 (초, 기본: 900)
    --retry-count       실패 시 재시도 횟수 (기본: 3)
    --retry-delay       재시도 간격 (초, 기본: 30)
    --parallel          가능한 단계 병렬 실행
    --continue-on-error 오류 시에도 계속 진행
    --skip-cleanup      정리 단계 건너뛰기
    --save-artifacts    모든 아티팩트 보관
    --dry-run           실제 실행 없이 계획만 표시
    --verbose           상세 로그 출력

환경 변수:
    PIPELINE_TIMEOUT        전체 파이프라인 타임아웃 (기본: 3600초)
    STAGE_TIMEOUT          각 단계별 타임아웃 (기본: 900초)
    CONTINUE_ON_ERROR      오류 시 계속 진행 (true/false)
    PARALLEL_EXECUTION     병렬 실행 활성화 (true/false)
    SAVE_ALL_ARTIFACTS     모든 아티팩트 보관 (true/false)

단계별 설명:
    1. 전제조건 검증     - Docker, 시스템 요구사항 확인
    2. 시스템 검증      - 기본 시스템 설정 및 서비스 상태
    3. 배포 검증        - 서비스 배포 상태 및 상호 연결성
    4. 한국어 요구사항   - 응답시간, 인코딩, 동시 사용자 지원
    5. 성능 벤치마크    - K6 기반 성능 측정 및 기준 검증
    6. 롤백 절차 검증   - 실패 시나리오 및 복구 절차
    7. 수동 테스트 자동화 - 매뉴얼 테스트 체크리스트 실행
    8. 결과 리포팅      - HTML/JSON 종합 리포트 생성
    9. 최종 검증        - 전체 파이프라인 결과 종합 평가

예제:
    $0                                    # 전체 파이프라인 실행
    $0 quick                             # 빠른 검증 모드
    $0 stage --stage 5                   # 성능 벤치마크만 실행
    $0 validate                          # 파이프라인 구성 검증
    $0 full --parallel --save-artifacts  # 병렬 실행 및 아티팩트 보관

파이프라인 결과: $PIPELINE_RESULTS_DIR/
로그 파일: $PIPELINE_LOG_FILE
EOF
}

# 설정 변수 초기화
TARGET_MODE="full"
TARGET_STAGE=""
DRY_RUN=false
VERBOSE=false
CONTINUE_ON_ERROR=false
PARALLEL_EXECUTION=false
SKIP_CLEANUP=false
SAVE_ARTIFACTS=false

# 파이프라인 상태 추적
declare -A STAGE_STATUS
declare -A STAGE_DURATION
declare -A STAGE_START_TIME
PIPELINE_START_TIME=$(date +%s)
FAILED_STAGES=()
SUCCESSFUL_STAGES=()

# 명령행 인수 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --stage)
            TARGET_STAGE="$2"
            TARGET_MODE="stage"
            shift 2
            ;;
        --timeout)
            PIPELINE_TIMEOUT="$2"
            shift 2
            ;;
        --stage-timeout)
            STAGE_TIMEOUT="$2"
            shift 2
            ;;
        --retry-count)
            RETRY_COUNT="$2"
            shift 2
            ;;
        --retry-delay)
            RETRY_DELAY="$2"
            shift 2
            ;;
        --parallel)
            PARALLEL_EXECUTION=true
            shift
            ;;
        --continue-on-error)
            CONTINUE_ON_ERROR=true
            shift
            ;;
        --skip-cleanup)
            SKIP_CLEANUP=true
            shift
            ;;
        --save-artifacts)
            SAVE_ARTIFACTS=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        full|quick|stage|validate|report)
            TARGET_MODE="$1"
            shift
            ;;
        *)
            log_error "알 수 없는 옵션: $1"
            show_help
            exit 1
            ;;
    esac
done

# 파이프라인 헤더 출력
print_pipeline_header() {
    echo "=============================================="
    log_pipeline "DOT Platform 전체 배포 검증 파이프라인 시작"
    log_pipeline "파이프라인 ID: $PIPELINE_ID"
    log_pipeline "실행 모드: $TARGET_MODE"
    log_pipeline "타임아웃: ${PIPELINE_TIMEOUT}초"
    if [[ -n "$TARGET_STAGE" ]]; then
        log_pipeline "대상 단계: $TARGET_STAGE (${PIPELINE_STAGES[$TARGET_STAGE]})"
    fi
    log_pipeline "로그 파일: $PIPELINE_LOG_FILE"
    echo "=============================================="
}

# 전제조건 검증
validate_prerequisites() {
    log_step "파이프라인 전제조건 검증"

    # 필수 도구 확인
    local required_tools=("docker" "docker-compose" "curl" "jq" "timeout")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "필수 도구가 설치되지 않았습니다: $tool"
            return 1
        fi
    done

    # 검증 스크립트 존재 확인
    for script_name in "${!VALIDATION_SCRIPTS[@]}"; do
        local script_path="${VALIDATION_SCRIPTS[$script_name]}"
        if [[ ! -f "$script_path" ]]; then
            log_error "검증 스크립트를 찾을 수 없습니다: $script_path"
            return 1
        fi

        if [[ ! -x "$script_path" ]]; then
            log_warning "실행 권한이 없습니다: $script_path"
            chmod +x "$script_path" 2>/dev/null || {
                log_error "실행 권한 설정 실패: $script_path"
                return 1
            }
        fi
    done

    # 디스크 공간 확인 (최소 2GB)
    local available_space=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    local required_space=2097152  # 2GB in KB
    if [[ $available_space -lt $required_space ]]; then
        log_warning "디스크 공간이 부족할 수 있습니다 (사용 가능: ${available_space}KB, 권장: ${required_space}KB)"
    fi

    # 메모리 확인 (최소 4GB)
    local available_memory=$(free | awk 'NR==2{print $7}')
    local required_memory=4194304  # 4GB in KB
    if [[ $available_memory -lt $required_memory ]]; then
        log_warning "메모리가 부족할 수 있습니다 (사용 가능: ${available_memory}KB, 권장: ${required_memory}KB)"
    fi

    log_success "파이프라인 전제조건 확인 완료"
}

# 단계 실행 함수
execute_stage() {
    local stage_number="$1"
    local stage_name="${PIPELINE_STAGES[$stage_number]}"
    local retry_count=0

    STAGE_START_TIME[$stage_number]=$(date +%s)
    log_step "단계 $stage_number: $stage_name 시작"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] 단계 $stage_number 실행 예정: $stage_name"
        STAGE_STATUS[$stage_number]="dry-run"
        STAGE_DURATION[$stage_number]=0
        return 0
    fi

    while [[ $retry_count -lt $RETRY_COUNT ]]; do
        local stage_start=$(date +%s)
        local stage_result=0

        case "$stage_number" in
            "1")
                # 전제조건 검증
                validate_prerequisites
                stage_result=$?
                ;;
            "2")
                # 시스템 검증
                if [[ -f "${VALIDATION_SCRIPTS[system]}" ]]; then
                    timeout "$STAGE_TIMEOUT" "${VALIDATION_SCRIPTS[system]}"
                    stage_result=$?
                fi
                ;;
            "3")
                # 배포 검증
                if [[ -f "${VALIDATION_SCRIPTS[deployment]}" ]]; then
                    timeout "$STAGE_TIMEOUT" "${VALIDATION_SCRIPTS[deployment]}"
                    stage_result=$?
                fi
                ;;
            "4")
                # 한국어 요구사항 검증
                if [[ -f "${VALIDATION_SCRIPTS[korean-requirements]}" ]]; then
                    timeout "$STAGE_TIMEOUT" "${VALIDATION_SCRIPTS[korean-requirements]}"
                    stage_result=$?
                fi
                ;;
            "5")
                # 성능 벤치마크
                if [[ -f "${VALIDATION_SCRIPTS[performance]}" ]]; then
                    local benchmark_args="korean-requirements"
                    if [[ "$TARGET_MODE" == "quick" ]]; then
                        benchmark_args="$benchmark_args --duration 60"
                    fi
                    timeout "$STAGE_TIMEOUT" "${VALIDATION_SCRIPTS[performance]}" $benchmark_args
                    stage_result=$?
                fi
                ;;
            "6")
                # 롤백 절차 검증
                if [[ -f "${VALIDATION_SCRIPTS[rollback]}" ]]; then
                    timeout "$STAGE_TIMEOUT" "${VALIDATION_SCRIPTS[rollback]}" --dry-run test
                    stage_result=$?
                fi
                ;;
            "7")
                # 수동 테스트 자동화
                if [[ -f "${VALIDATION_SCRIPTS[manual-tests]}" ]]; then
                    local test_args="--skip-setup"
                    if [[ "$TARGET_MODE" == "quick" ]]; then
                        test_args="$test_args --quick"
                    fi
                    timeout "$STAGE_TIMEOUT" "${VALIDATION_SCRIPTS[manual-tests]}" phase2 $test_args
                    stage_result=$?
                fi
                ;;
            "8")
                # 결과 리포팅
                if [[ -f "${VALIDATION_SCRIPTS[reporting]}" ]]; then
                    timeout "$STAGE_TIMEOUT" "${VALIDATION_SCRIPTS[reporting]}" --format all
                    stage_result=$?
                fi
                ;;
            "9")
                # 최종 검증
                final_validation
                stage_result=$?
                ;;
        esac

        local stage_end=$(date +%s)
        STAGE_DURATION[$stage_number]=$((stage_end - stage_start))

        if [[ $stage_result -eq 0 ]]; then
            STAGE_STATUS[$stage_number]="success"
            SUCCESSFUL_STAGES+=("$stage_number")
            log_success "단계 $stage_number 완료: $stage_name (소요시간: ${STAGE_DURATION[$stage_number]}초)"
            return 0
        else
            retry_count=$((retry_count + 1))
            log_warning "단계 $stage_number 실패 (시도 $retry_count/$RETRY_COUNT): $stage_name"

            if [[ $retry_count -lt $RETRY_COUNT ]]; then
                log_info "${RETRY_DELAY}초 후 재시도..."
                sleep "$RETRY_DELAY"
            fi
        fi
    done

    STAGE_STATUS[$stage_number]="failed"
    FAILED_STAGES+=("$stage_number")
    log_error "단계 $stage_number 최종 실패: $stage_name"

    if [[ "$CONTINUE_ON_ERROR" == "true" ]]; then
        log_warning "오류를 무시하고 계속 진행합니다"
        return 0
    else
        return 1
    fi
}

# 최종 검증
final_validation() {
    log_step "최종 검증 실행"

    local validation_errors=0

    # 모든 이전 단계 상태 확인
    for stage_num in $(seq 1 8); do
        if [[ "${STAGE_STATUS[$stage_num]:-}" == "failed" ]]; then
            log_error "단계 $stage_num 실패로 인한 최종 검증 실패"
            validation_errors=$((validation_errors + 1))
        fi
    done

    # 한국어 요구사항 최종 확인
    log_info "한국어 요구사항 최종 확인 중..."
    if curl -s --connect-timeout 5 --max-time 3 "http://localhost/api/health" | grep -q "OK"; then
        log_success "API 응답 시간 기준 통과 (< 3초)"
    else
        log_error "API 응답 시간 기준 실패"
        validation_errors=$((validation_errors + 1))
    fi

    # 필수 로그 파일 존재 확인
    local required_logs=(
        "$PROJECT_ROOT/logs/validation"
        "$PROJECT_ROOT/logs/alerts"
        "$PROJECT_ROOT/benchmarks/results"
        "$PROJECT_ROOT/reports"
    )

    for log_dir in "${required_logs[@]}"; do
        if [[ -d "$log_dir" && $(find "$log_dir" -type f | wc -l) -gt 0 ]]; then
            log_success "로그 디렉토리 확인: $log_dir"
        else
            log_warning "로그 디렉토리 비어있음 또는 없음: $log_dir"
        fi
    done

    # 최종 검증 결과
    if [[ $validation_errors -eq 0 ]]; then
        log_success "최종 검증 완료 - 모든 기준 통과"
        return 0
    else
        log_error "최종 검증 실패 - $validation_errors개 오류 발견"
        return 1
    fi
}

# 파이프라인 구성 검증
validate_pipeline_configuration() {
    log_step "파이프라인 구성 검증"

    # 단계 정의 확인
    log_info "파이프라인 단계 구성:"
    for stage_num in $(seq 1 9); do
        if [[ -n "${PIPELINE_STAGES[$stage_num]:-}" ]]; then
            log_info "  ✓ 단계 $stage_num: ${PIPELINE_STAGES[$stage_num]}"
        else
            log_error "  ✗ 단계 $stage_num: 정의되지 않음"
            return 1
        fi
    done

    # 스크립트 매핑 확인
    log_info "검증 스크립트 매핑:"
    for script_name in "${!VALIDATION_SCRIPTS[@]}"; do
        local script_path="${VALIDATION_SCRIPTS[$script_name]}"
        if [[ -f "$script_path" ]]; then
            log_info "  ✓ $script_name: $script_path"
        else
            log_warning "  ⚠ $script_name: $script_path (파일 없음)"
        fi
    done

    log_success "파이프라인 구성 검증 완료"
}

# 병렬 실행 (제한적)
execute_parallel_stages() {
    log_step "병렬 실행 가능 단계 식별"

    # 의존성이 없는 단계들을 병렬로 실행 가능
    local parallel_groups=(
        "2 3"     # 시스템 검증과 배포 검증은 독립적으로 실행 가능
        "6 7"     # 롤백 검증과 수동 테스트는 독립적
    )

    for group in "${parallel_groups[@]}"; do
        local stages=($group)
        log_info "병렬 실행 그룹: ${stages[*]}"

        local pids=()
        for stage in "${stages[@]}"; do
            execute_stage "$stage" &
            pids+=($!)
        done

        # 모든 병렬 프로세스 완료 대기
        for pid in "${pids[@]}"; do
            wait "$pid" || log_warning "병렬 단계 중 일부 실패"
        done
    done
}

# 전체 파이프라인 실행
run_full_pipeline() {
    log_pipeline "전체 파이프라인 실행 시작"

    local pipeline_start=$(date +%s)

    if [[ "$PARALLEL_EXECUTION" == "true" ]]; then
        execute_parallel_stages
        # 병렬 실행 후 순차 실행이 필요한 단계들
        for stage_num in 1 4 5 8 9; do
            execute_stage "$stage_num" || {
                if [[ "$CONTINUE_ON_ERROR" != "true" ]]; then
                    return 1
                fi
            }
        done
    else
        # 순차 실행
        for stage_num in $(seq 1 9); do
            execute_stage "$stage_num" || {
                if [[ "$CONTINUE_ON_ERROR" != "true" ]]; then
                    return 1
                fi
            }
        done
    fi

    local pipeline_end=$(date +%s)
    local total_duration=$((pipeline_end - pipeline_start))

    log_pipeline "전체 파이프라인 완료 (총 소요시간: ${total_duration}초)"
}

# 파이프라인 결과 리포트 생성
generate_pipeline_report() {
    log_step "파이프라인 결과 리포트 생성"

    local pipeline_end_time=$(date +%s)
    local total_duration=$((pipeline_end_time - PIPELINE_START_TIME))
    local report_file="$PIPELINE_RESULTS_DIR/pipeline-report-$PIPELINE_ID.json"

    # 단계별 상태 JSON 생성
    local stages_json="{"
    for stage_num in $(seq 1 9); do
        if [[ $stage_num -gt 1 ]]; then
            stages_json+=","
        fi
        stages_json+="\"$stage_num\": {"
        stages_json+="\"name\": \"${PIPELINE_STAGES[$stage_num]}\","
        stages_json+="\"status\": \"${STAGE_STATUS[$stage_num]:-'not_executed'}\","
        stages_json+="\"duration\": ${STAGE_DURATION[$stage_num]:-0},"
        stages_json+="\"start_time\": \"$(date -d "@${STAGE_START_TIME[$stage_num]:-$PIPELINE_START_TIME}" '+%Y-%m-%dT%H:%M:%SZ')\""
        stages_json+="}"
    done
    stages_json+="}"

    cat > "$report_file" << EOF
{
    "pipeline_execution": {
        "pipeline_id": "$PIPELINE_ID",
        "start_time": "$(date -d "@$PIPELINE_START_TIME" '+%Y-%m-%dT%H:%M:%SZ')",
        "end_time": "$(date -d "@$pipeline_end_time" '+%Y-%m-%dT%H:%M:%SZ')",
        "total_duration": $total_duration,
        "mode": "$TARGET_MODE",
        "target_stage": "$TARGET_STAGE",
        "configuration": {
            "timeout": $PIPELINE_TIMEOUT,
            "stage_timeout": $STAGE_TIMEOUT,
            "retry_count": $RETRY_COUNT,
            "retry_delay": $RETRY_DELAY,
            "parallel_execution": $PARALLEL_EXECUTION,
            "continue_on_error": $CONTINUE_ON_ERROR
        }
    },
    "stages": $stages_json,
    "summary": {
        "total_stages": 9,
        "successful_stages": ${#SUCCESSFUL_STAGES[@]},
        "failed_stages": ${#FAILED_STAGES[@]},
        "success_rate": $(echo "scale=2; ${#SUCCESSFUL_STAGES[@]} * 100 / 9" | bc -l 2>/dev/null || echo "0"),
        "failed_stage_numbers": $(printf '%s\n' "${FAILED_STAGES[@]}" 2>/dev/null | jq -R . | jq -s . || echo "[]"),
        "successful_stage_numbers": $(printf '%s\n' "${SUCCESSFUL_STAGES[@]}" 2>/dev/null | jq -R . | jq -s . || echo "[]")
    },
    "artifacts": {
        "log_file": "$PIPELINE_LOG_FILE",
        "results_directory": "$PIPELINE_RESULTS_DIR",
        "validation_logs": "$PROJECT_ROOT/logs/validation",
        "benchmark_results": "$PROJECT_ROOT/benchmarks/results",
        "reports": "$PROJECT_ROOT/reports"
    },
    "korean_requirements_compliance": {
        "response_time_target": "< 3초",
        "concurrent_users_target": "10명",
        "encoding_support": "UTF-8",
        "validation_status": "$(if [[ "${STAGE_STATUS[4]:-}" == "success" ]]; then echo "PASS"; else echo "FAIL"; fi)"
    }
}
EOF

    log_success "파이프라인 리포트 생성 완료: $report_file"

    # HTML 리포트도 생성
    local html_report="$PIPELINE_RESULTS_DIR/pipeline-report-$PIPELINE_ID.html"
    generate_html_pipeline_report "$report_file" "$html_report"
}

# HTML 파이프라인 리포트 생성
generate_html_pipeline_report() {
    local json_report="$1"
    local html_report="$2"

    cat > "$html_report" << EOF
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DOT Platform 배포 검증 파이프라인 리포트</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #007acc; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #007acc; margin: 0; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: #f8f9fa; padding: 20px; border-radius: 6px; text-align: center; border-left: 4px solid #007acc; }
        .summary-card h3 { margin: 0 0 10px 0; color: #333; }
        .summary-card .value { font-size: 2em; font-weight: bold; color: #007acc; }
        .stages { margin-bottom: 30px; }
        .stage { background: #f8f9fa; margin: 10px 0; padding: 15px; border-radius: 6px; border-left: 4px solid #28a745; }
        .stage.failed { border-left-color: #dc3545; }
        .stage.not_executed { border-left-color: #6c757d; }
        .stage-header { display: flex; justify-content: between; align-items: center; }
        .stage-name { font-weight: bold; font-size: 1.1em; }
        .stage-status { padding: 4px 12px; border-radius: 20px; color: white; font-size: 0.9em; }
        .status-success { background-color: #28a745; }
        .status-failed { background-color: #dc3545; }
        .status-not_executed { background-color: #6c757d; }
        .korean-requirements { background: #e7f3ff; padding: 20px; border-radius: 6px; border: 1px solid #007acc; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 DOT Platform 배포 검증 파이프라인 리포트</h1>
            <p>파이프라인 ID: $PIPELINE_ID</p>
            <p>실행 시간: $(date '+%Y년 %m월 %d일 %H:%M:%S')</p>
        </div>

        <div class="summary">
            <div class="summary-card">
                <h3>전체 단계</h3>
                <div class="value">9</div>
            </div>
            <div class="summary-card">
                <h3>성공한 단계</h3>
                <div class="value">${#SUCCESSFUL_STAGES[@]}</div>
            </div>
            <div class="summary-card">
                <h3>실패한 단계</h3>
                <div class="value">${#FAILED_STAGES[@]}</div>
            </div>
            <div class="summary-card">
                <h3>성공률</h3>
                <div class="value">$(echo "scale=0; ${#SUCCESSFUL_STAGES[@]} * 100 / 9" | bc -l 2>/dev/null || echo "0")%</div>
            </div>
        </div>

        <div class="stages">
            <h2>📋 단계별 실행 결과</h2>
EOF

    for stage_num in $(seq 1 9); do
        local status="${STAGE_STATUS[$stage_num]:-'not_executed'}"
        local duration="${STAGE_DURATION[$stage_num]:-0}"
        local stage_name="${PIPELINE_STAGES[$stage_num]}"

        cat >> "$html_report" << EOF
            <div class="stage $status">
                <div class="stage-header">
                    <span class="stage-name">단계 $stage_num: $stage_name</span>
                    <span class="stage-status status-$status">$(
                        case "$status" in
                            "success") echo "성공" ;;
                            "failed") echo "실패" ;;
                            "dry-run") echo "시뮬레이션" ;;
                            *) echo "미실행" ;;
                        esac
                    )</span>
                </div>
                <div>소요 시간: ${duration}초</div>
            </div>
EOF
    done

    cat >> "$html_report" << EOF
        </div>

        <div class="korean-requirements">
            <h2>🇰🇷 한국어 요구사항 준수 현황</h2>
            <ul>
                <li><strong>페이지 로딩 시간:</strong> < 3초 목표</li>
                <li><strong>동시 사용자 지원:</strong> 10명 목표</li>
                <li><strong>인코딩 지원:</strong> UTF-8</li>
                <li><strong>검증 상태:</strong> $(if [[ "${STAGE_STATUS[4]:-}" == "success" ]]; then echo "✅ 통과"; else echo "❌ 실패"; fi)</li>
            </ul>
        </div>

        <div class="footer">
            <p>Generated by DOT Platform 배포 검증 파이프라인 v1.0.0</p>
            <p>상세 로그: $PIPELINE_LOG_FILE</p>
            <p>JSON 리포트: $json_report</p>
        </div>
    </div>
</body>
</html>
EOF

    log_success "HTML 파이프라인 리포트 생성 완료: $html_report"
}

# 정리 작업
cleanup_pipeline() {
    if [[ "$SKIP_CLEANUP" == "true" ]]; then
        log_info "정리 작업 건너뛰기"
        return 0
    fi

    log_step "파이프라인 정리 작업"

    # 임시 파일 정리
    find "$PROJECT_ROOT" -name "*.tmp" -type f -delete 2>/dev/null || true

    # 오래된 로그 정리 (30일 이상)
    find "$PIPELINE_LOG_DIR" -name "pipeline-*.log" -type f -mtime +30 -delete 2>/dev/null || true

    # 아티팩트 보관 설정에 따른 처리
    if [[ "$SAVE_ARTIFACTS" != "true" ]]; then
        # 임시 벤치마크 파일 정리
        find "$PROJECT_ROOT/benchmarks" -name "*.tmp" -type f -delete 2>/dev/null || true
    fi

    log_success "파이프라인 정리 완료"
}

# 메인 실행 함수
main() {
    # 로그 파일 초기화
    echo "파이프라인 시작: $(date '+%Y-%m-%d %H:%M:%S')" > "$PIPELINE_LOG_FILE"

    print_pipeline_header

    # 메인 실행 로직 호출
    main_execution
}

# 메인 실행 로직
main_execution() {
    case "$TARGET_MODE" in
        "full")
            run_full_pipeline
            ;;
        "quick")
            log_info "빠른 검증 모드로 실행"
            run_full_pipeline
            ;;
        "stage")
            if [[ -z "$TARGET_STAGE" ]]; then
                log_error "단계 번호를 지정해야 합니다 (--stage 옵션)"
                exit 1
            fi
            execute_stage "$TARGET_STAGE"
            ;;
        "validate")
            validate_pipeline_configuration
            ;;
        "report")
            generate_pipeline_report
            ;;
        *)
            log_error "알 수 없는 모드: $TARGET_MODE"
            show_help
            exit 1
            ;;
    esac

    generate_pipeline_report
    cleanup_pipeline

    # 최종 결과 출력
    echo "=============================================="
    if [[ ${#FAILED_STAGES[@]} -eq 0 ]]; then
        log_success "🎉 DOT Platform 배포 검증 파이프라인 완료"
        log_success "모든 단계가 성공적으로 완료되었습니다"
    else
        log_warning "⚠️ DOT Platform 배포 검증 파이프라인 완료 (일부 실패)"
        log_warning "실패한 단계: ${FAILED_STAGES[*]}"
    fi
    log_info "상세 리포트: $PIPELINE_RESULTS_DIR/"
    log_info "상세 로그: $PIPELINE_LOG_FILE"
    echo "=============================================="
}

# 스크립트 시작점
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@" 2>&1 | tee -a "$PIPELINE_LOG_FILE"
fi