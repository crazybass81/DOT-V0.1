#!/bin/bash

# DOT Platform 알림 및 보고 시스템
# 배포 검증 실패, 성능 이슈, 시스템 장애에 대한 자동 알림
#
# TDD GREEN 단계: T022 구현
# 로그 분석 결과와 시스템 상태를 기반으로 적절한 알림 발송

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
readonly LOGS_DIR="${PROJECT_DIR}/logs"
readonly ALERTS_DIR="${LOGS_DIR}/alerts"
readonly ALERT_ID="alert-$(date +%Y%m%d-%H%M%S)"

# 알림 설정
readonly ALERT_RETENTION_DAYS="${ALERT_RETENTION_DAYS:-30}"  # 30일간 보관
readonly MAX_ALERT_FREQUENCY="${MAX_ALERT_FREQUENCY:-300}"   # 5분 간격 최대 알림
readonly ALERT_SEVERITY_THRESHOLD="${ALERT_SEVERITY_THRESHOLD:-warning}"  # info, warning, error, critical

# 알림 채널 설정 (환경 변수에서 가져옴)
readonly SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
readonly EMAIL_SMTP_SERVER="${EMAIL_SMTP_SERVER:-}"
readonly EMAIL_SMTP_PORT="${EMAIL_SMTP_PORT:-587}"
readonly EMAIL_FROM="${EMAIL_FROM:-}"
readonly EMAIL_TO="${EMAIL_TO:-}"
readonly EMAIL_PASSWORD="${EMAIL_PASSWORD:-}"
readonly WEBHOOK_URL="${WEBHOOK_URL:-}"
readonly TEAMS_WEBHOOK_URL="${TEAMS_WEBHOOK_URL:-}"

# 한국어 요구사항 임계값
readonly KOREAN_PERFORMANCE_THRESHOLD=3000  # 3초 (ms)
readonly KOREAN_CONCURRENT_USERS=10

# 도움말 표시
show_help() {
    cat << EOF
DOT Platform 알림 및 보고 시스템

사용법: $0 [옵션] [알림-유형]

알림 유형:
    deployment-success     배포 성공 알림
    deployment-failure     배포 실패 알림
    validation-failure     검증 실패 알림
    performance-issue      성능 이슈 알림
    korean-requirement     한국어 요구사항 위반 알림
    system-health          시스템 헬스 이슈 알림
    custom                 커스텀 메시지 알림

옵션:
    -h, --help             이 도움말 표시
    -c, --channel          알림 채널 (slack, email, webhook, teams, all)
    -s, --severity         심각도 (info, warning, error, critical)
    -m, --message          커스텀 메시지
    -f, --file             알림 데이터 파일 경로
    -t, --title            알림 제목
    -d, --data             추가 데이터 (JSON 형식)
    --no-escalation        에스컬레이션 비활성화
    --force                알림 빈도 제한 무시
    --debug                디버그 모드 활성화

환경 변수:
    SLACK_WEBHOOK_URL      Slack 웹훅 URL
    EMAIL_SMTP_SERVER      이메일 SMTP 서버
    EMAIL_SMTP_PORT        이메일 SMTP 포트 (기본: 587)
    EMAIL_FROM             발신자 이메일 주소
    EMAIL_TO               수신자 이메일 주소 (쉼표로 구분)
    EMAIL_PASSWORD         이메일 비밀번호
    WEBHOOK_URL            일반 웹훅 URL
    TEAMS_WEBHOOK_URL      Microsoft Teams 웹훅 URL

예제:
    $0 deployment-success -c slack                           # Slack으로 배포 성공 알림
    $0 validation-failure -c all -s critical                # 모든 채널로 검증 실패 알림
    $0 korean-requirement -m "응답시간 3초 초과" -s error      # 한국어 요구사항 위반 알림
    $0 custom -t "긴급 점검" -m "서버 점검 필요" -c email      # 커스텀 이메일 알림
    $0 system-health -f /path/to/health-data.json           # 시스템 헬스 데이터로 알림

심각도 설명:
    info     - 정보성 알림 (배포 성공, 정상 상태)
    warning  - 주의 알림 (성능 저하, 경고 발생)
    error    - 오류 알림 (기능 실패, 검증 실패)
    critical - 긴급 알림 (시스템 다운, 심각한 장애)

한국어 요구사항 모니터링:
    - 페이지 로딩 시간 < 3초 모니터링
    - 10명 동시 사용자 지원 확인
    - UTF-8 인코딩 검증
    - 한국어 오류 메시지 분석
EOF
}

# 전제 조건 확인
check_prerequisites() {
    log_step "알림 시스템 전제 조건 확인"

    # 필요한 도구 확인
    local required_tools=("curl" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "필수 도구가 설치되지 않았습니다: $tool"
            exit 1
        fi
    done

    # 알림 디렉토리 생성
    mkdir -p "$ALERTS_DIR"

    # 설정된 알림 채널 확인
    local available_channels=()
    [[ -n "$SLACK_WEBHOOK_URL" ]] && available_channels+=("slack")
    [[ -n "$EMAIL_SMTP_SERVER" && -n "$EMAIL_FROM" && -n "$EMAIL_TO" ]] && available_channels+=("email")
    [[ -n "$WEBHOOK_URL" ]] && available_channels+=("webhook")
    [[ -n "$TEAMS_WEBHOOK_URL" ]] && available_channels+=("teams")

    if [[ ${#available_channels[@]} -eq 0 ]]; then
        log_warning "설정된 알림 채널이 없습니다. 환경 변수를 확인하세요."
    else
        log_info "사용 가능한 알림 채널: ${available_channels[*]}"
    fi

    log_success "전제 조건 확인 완료"
}

# 알림 빈도 제한 확인
check_alert_frequency() {
    local alert_type="$1"
    local frequency_file="${ALERTS_DIR}/.frequency_${alert_type}"

    if [[ -f "$frequency_file" ]]; then
        local last_alert_time
        last_alert_time=$(cat "$frequency_file")
        local current_time
        current_time=$(date +%s)
        local time_diff=$((current_time - last_alert_time))

        if [[ "$time_diff" -lt "$MAX_ALERT_FREQUENCY" ]]; then
            log_warning "알림 빈도 제한: $alert_type (마지막 알림으로부터 ${time_diff}초, 최소 간격: ${MAX_ALERT_FREQUENCY}초)"
            return 1
        fi
    fi

    # 현재 시간 기록
    echo "$(date +%s)" > "$frequency_file"
    return 0
}

# Slack 알림 발송
send_slack_alert() {
    local title="$1"
    local message="$2"
    local severity="$3"
    local additional_data="$4"

    if [[ -z "$SLACK_WEBHOOK_URL" ]]; then
        log_warning "Slack 웹훅 URL이 설정되지 않았습니다"
        return 1
    fi

    log_debug "Slack 알림 발송: $title"

    # 심각도에 따른 색상 설정
    local color=""
    local emoji=""
    case "$severity" in
        "info")
            color="good"
            emoji="✅"
            ;;
        "warning")
            color="warning"
            emoji="⚠️"
            ;;
        "error")
            color="danger"
            emoji="❌"
            ;;
        "critical")
            color="danger"
            emoji="🚨"
            ;;
        *)
            color="#439FE0"
            emoji="ℹ️"
            ;;
    esac

    # Slack 메시지 구성
    local slack_payload
    slack_payload=$(cat << EOF
{
    "username": "DOT Platform Monitor",
    "icon_emoji": ":computer:",
    "attachments": [
        {
            "color": "$color",
            "title": "$emoji $title",
            "text": "$message",
            "fields": [
                {
                    "title": "환경",
                    "value": "$(hostname)",
                    "short": true
                },
                {
                    "title": "시간",
                    "value": "$(date '+%Y-%m-%d %H:%M:%S')",
                    "short": true
                },
                {
                    "title": "심각도",
                    "value": "$severity",
                    "short": true
                }
            ],
            "footer": "DOT Platform 배포 검증 시스템",
            "ts": $(date +%s)
        }
    ]
}
EOF
    )

    # 추가 데이터가 있으면 필드에 추가
    if [[ -n "$additional_data" ]]; then
        slack_payload=$(echo "$slack_payload" | jq --argjson data "$additional_data" '.attachments[0].fields += [{"title": "추가 정보", "value": ($data | tostring), "short": false}]')
    fi

    # Slack으로 전송
    local response
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$slack_payload" \
        "$SLACK_WEBHOOK_URL")

    if [[ "$response" == "ok" ]]; then
        log_success "Slack 알림 발송 완료"
        return 0
    else
        log_error "Slack 알림 발송 실패: $response"
        return 1
    fi
}

# 이메일 알림 발송
send_email_alert() {
    local title="$1"
    local message="$2"
    local severity="$3"
    local additional_data="$4"

    if [[ -z "$EMAIL_SMTP_SERVER" || -z "$EMAIL_FROM" || -z "$EMAIL_TO" ]]; then
        log_warning "이메일 설정이 완전하지 않습니다"
        return 1
    fi

    log_debug "이메일 알림 발송: $title"

    # 심각도에 따른 제목 PREFIX
    local title_prefix=""
    case "$severity" in
        "critical")
            title_prefix="🚨 [긴급]"
            ;;
        "error")
            title_prefix="❌ [오류]"
            ;;
        "warning")
            title_prefix="⚠️ [경고]"
            ;;
        "info")
            title_prefix="ℹ️ [정보]"
            ;;
    esac

    # 이메일 내용 구성
    local email_subject="$title_prefix DOT Platform: $title"
    local email_body
    email_body=$(cat << EOF
DOT Platform 배포 검증 시스템 알림

제목: $title
심각도: $severity
시간: $(date '+%Y-%m-%d %H:%M:%S')
서버: $(hostname)

메시지:
$message

EOF
    )

    # 추가 데이터가 있으면 포함
    if [[ -n "$additional_data" ]]; then
        email_body+=$(cat << EOF

추가 정보:
$(echo "$additional_data" | jq -r . 2>/dev/null || echo "$additional_data")

EOF
        )
    fi

    email_body+=$(cat << EOF
---
이 알림은 DOT Platform 자동 모니터링 시스템에서 발송되었습니다.
한국어 요구사항: 페이지 로딩 < 3초, 10명 동시 사용자 지원

DOT Platform 관리팀
EOF
    )

    # 이메일 전송 (sendemail 또는 mutt 사용)
    if command -v sendemail &> /dev/null; then
        sendemail \
            -f "$EMAIL_FROM" \
            -t "$EMAIL_TO" \
            -s "$EMAIL_SMTP_SERVER:$EMAIL_SMTP_PORT" \
            -xu "$EMAIL_FROM" \
            -xp "$EMAIL_PASSWORD" \
            -u "$email_subject" \
            -m "$email_body" \
            -o tls=yes >/dev/null 2>&1

        if [[ $? -eq 0 ]]; then
            log_success "이메일 알림 발송 완료"
            return 0
        else
            log_error "이메일 알림 발송 실패"
            return 1
        fi
    else
        # curl을 사용한 SMTP 전송 (간단한 버전)
        log_warning "sendemail이 설치되지 않았습니다. 이메일 알림을 건너뜁니다."
        return 1
    fi
}

# 웹훅 알림 발송
send_webhook_alert() {
    local title="$1"
    local message="$2"
    local severity="$3"
    local additional_data="$4"

    if [[ -z "$WEBHOOK_URL" ]]; then
        log_warning "웹훅 URL이 설정되지 않았습니다"
        return 1
    fi

    log_debug "웹훅 알림 발송: $title"

    # 웹훅 페이로드 구성
    local webhook_payload
    webhook_payload=$(cat << EOF
{
    "alert_id": "$ALERT_ID",
    "timestamp": "$(date -Iseconds)",
    "title": "$title",
    "message": "$message",
    "severity": "$severity",
    "hostname": "$(hostname)",
    "source": "DOT Platform",
    "korean_requirements": {
        "performance_threshold_ms": $KOREAN_PERFORMANCE_THRESHOLD,
        "concurrent_users": $KOREAN_CONCURRENT_USERS
    }
}
EOF
    )

    # 추가 데이터가 있으면 포함
    if [[ -n "$additional_data" ]]; then
        webhook_payload=$(echo "$webhook_payload" | jq --argjson data "$additional_data" '. + {"additional_data": $data}')
    fi

    # 웹훅으로 전송
    local response
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$webhook_payload" \
        "$WEBHOOK_URL")

    if [[ $? -eq 0 ]]; then
        log_success "웹훅 알림 발송 완료"
        return 0
    else
        log_error "웹훅 알림 발송 실패: $response"
        return 1
    fi
}

# Microsoft Teams 알림 발송
send_teams_alert() {
    local title="$1"
    local message="$2"
    local severity="$3"
    local additional_data="$4"

    if [[ -z "$TEAMS_WEBHOOK_URL" ]]; then
        log_warning "Teams 웹훅 URL이 설정되지 않았습니다"
        return 1
    fi

    log_debug "Teams 알림 발송: $title"

    # 심각도에 따른 색상 설정
    local theme_color=""
    case "$severity" in
        "info")
            theme_color="00FF00"
            ;;
        "warning")
            theme_color="FFFF00"
            ;;
        "error"|"critical")
            theme_color="FF0000"
            ;;
        *)
            theme_color="0078D4"
            ;;
    esac

    # Teams 메시지 구성
    local teams_payload
    teams_payload=$(cat << EOF
{
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "$theme_color",
    "summary": "$title",
    "sections": [
        {
            "activityTitle": "DOT Platform 알림",
            "activitySubtitle": "$title",
            "text": "$message",
            "facts": [
                {
                    "name": "심각도",
                    "value": "$severity"
                },
                {
                    "name": "시간",
                    "value": "$(date '+%Y-%m-%d %H:%M:%S')"
                },
                {
                    "name": "서버",
                    "value": "$(hostname)"
                }
            ]
        }
    ]
}
EOF
    )

    # Teams로 전송
    local response
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$teams_payload" \
        "$TEAMS_WEBHOOK_URL")

    if [[ $? -eq 0 ]]; then
        log_success "Teams 알림 발송 완료"
        return 0
    else
        log_error "Teams 알림 발송 실패: $response"
        return 1
    fi
}

# 배포 성공 알림
send_deployment_success_alert() {
    local version="${1:-latest}"
    local environment="${2:-production}"

    local title="🚀 배포 성공"
    local message="DOT Platform $version 버전이 $environment 환경에 성공적으로 배포되었습니다."

    local additional_data
    additional_data=$(cat << EOF
{
    "version": "$version",
    "environment": "$environment",
    "korean_requirements_status": "검증 완료"
}
EOF
    )

    send_alert "$title" "$message" "info" "$additional_data"
}

# 배포 실패 알림
send_deployment_failure_alert() {
    local version="${1:-latest}"
    local environment="${2:-production}"
    local reason="${3:-알 수 없는 오류}"

    local title="❌ 배포 실패"
    local message="DOT Platform $version 버전의 $environment 환경 배포가 실패했습니다. 원인: $reason"

    local additional_data
    additional_data=$(cat << EOF
{
    "version": "$version",
    "environment": "$environment",
    "failure_reason": "$reason",
    "action_required": "배포 로그 확인 및 문제 해결 필요"
}
EOF
    )

    send_alert "$title" "$message" "error" "$additional_data"
}

# 검증 실패 알림
send_validation_failure_alert() {
    local validation_type="${1:-unknown}"
    local details="${2:-세부 정보 없음}"

    local title="⚠️ 검증 실패"
    local message="DOT Platform $validation_type 검증이 실패했습니다. $details"

    local additional_data
    additional_data=$(cat << EOF
{
    "validation_type": "$validation_type",
    "details": "$details",
    "korean_requirements": "확인 필요"
}
EOF
    )

    send_alert "$title" "$message" "warning" "$additional_data"
}

# 성능 이슈 알림
send_performance_issue_alert() {
    local metric="${1:-unknown}"
    local threshold="${2:-unknown}"
    local current_value="${3:-unknown}"

    local title="⚡ 성능 이슈 감지"
    local message="성능 메트릭 '$metric'이 임계값($threshold)을 초과했습니다. 현재 값: $current_value"

    local additional_data
    additional_data=$(cat << EOF
{
    "metric": "$metric",
    "threshold": "$threshold",
    "current_value": "$current_value",
    "korean_requirement_violation": $([ "$metric" = "response_time" ] && echo "true" || echo "false")
}
EOF
    )

    local severity="warning"
    # 한국어 요구사항 위반인 경우 심각도 증가
    if [[ "$metric" == "response_time" && "$current_value" =~ ^[0-9]+$ && "$current_value" -gt "$KOREAN_PERFORMANCE_THRESHOLD" ]]; then
        severity="error"
    fi

    send_alert "$title" "$message" "$severity" "$additional_data"
}

# 한국어 요구사항 위반 알림
send_korean_requirement_alert() {
    local requirement="${1:-unknown}"
    local details="${2:-세부 정보 없음}"

    local title="🇰🇷 한국어 요구사항 위반"
    local message="한국어 요구사항 '$requirement'이 위반되었습니다. $details"

    local additional_data
    additional_data=$(cat << EOF
{
    "requirement": "$requirement",
    "details": "$details",
    "korean_standards": {
        "response_time": "< 3초",
        "concurrent_users": "10명 이상",
        "encoding": "UTF-8",
        "language_support": "한국어"
    }
}
EOF
    )

    send_alert "$title" "$message" "error" "$additional_data"
}

# 시스템 헬스 이슈 알림
send_system_health_alert() {
    local service="${1:-unknown}"
    local status="${2:-unknown}"
    local details="${3:-세부 정보 없음}"

    local title="🏥 시스템 헬스 이슈"
    local message="서비스 '$service'의 상태가 '$status'입니다. $details"

    local additional_data
    additional_data=$(cat << EOF
{
    "service": "$service",
    "status": "$status",
    "details": "$details",
    "impact_assessment": "서비스 가용성 영향 가능"
}
EOF
    )

    local severity="warning"
    if [[ "$status" == "unhealthy" || "$status" == "down" ]]; then
        severity="critical"
    fi

    send_alert "$title" "$message" "$severity" "$additional_data"
}

# 통합 알림 발송 함수
send_alert() {
    local title="$1"
    local message="$2"
    local severity="${3:-info}"
    local additional_data="${4:-}"
    local channels="${ALERT_CHANNELS:-all}"
    local force_send="${FORCE_SEND:-false}"

    log_step "알림 발송: $title (심각도: $severity)"

    # 알림 빈도 제한 확인 (force가 아닌 경우)
    if [[ "$force_send" != "true" ]]; then
        local alert_type_hash
        alert_type_hash=$(echo "$title" | md5sum | cut -d' ' -f1)
        if ! check_alert_frequency "$alert_type_hash"; then
            log_warning "알림 빈도 제한으로 인해 알림을 건너뜁니다"
            return 0
        fi
    fi

    # 심각도 임계값 확인
    local severity_levels=("info" "warning" "error" "critical")
    local current_level=-1
    local threshold_level=-1

    for i in "${!severity_levels[@]}"; do
        [[ "${severity_levels[i]}" == "$severity" ]] && current_level=$i
        [[ "${severity_levels[i]}" == "$ALERT_SEVERITY_THRESHOLD" ]] && threshold_level=$i
    done

    if [[ $current_level -lt $threshold_level ]]; then
        log_debug "심각도가 임계값보다 낮아 알림을 건너뜁니다 ($severity < $ALERT_SEVERITY_THRESHOLD)"
        return 0
    fi

    # 알림 기록 저장
    local alert_record="${ALERTS_DIR}/${ALERT_ID}.json"
    local formatted_data="{}"
    if [[ -n "$additional_data" ]]; then
        formatted_data=$(echo "$additional_data" | jq -c . 2>/dev/null || echo '{}')
    fi

    cat > "$alert_record" << EOF
{
    "alert_id": "$ALERT_ID",
    "timestamp": "$(date -Iseconds)",
    "title": "$title",
    "message": "$message",
    "severity": "$severity",
    "channels": "$channels",
    "additional_data": $formatted_data
}
EOF

    # 선택된 채널로 알림 발송
    local success_count=0
    local total_count=0

    if [[ "$channels" == "all" || "$channels" == *"slack"* ]]; then
        total_count=$((total_count + 1))
        send_slack_alert "$title" "$message" "$severity" "$additional_data" && success_count=$((success_count + 1))
    fi

    if [[ "$channels" == "all" || "$channels" == *"email"* ]]; then
        total_count=$((total_count + 1))
        send_email_alert "$title" "$message" "$severity" "$additional_data" && success_count=$((success_count + 1))
    fi

    if [[ "$channels" == "all" || "$channels" == *"webhook"* ]]; then
        total_count=$((total_count + 1))
        send_webhook_alert "$title" "$message" "$severity" "$additional_data" && success_count=$((success_count + 1))
    fi

    if [[ "$channels" == "all" || "$channels" == *"teams"* ]]; then
        total_count=$((total_count + 1))
        send_teams_alert "$title" "$message" "$severity" "$additional_data" && success_count=$((success_count + 1))
    fi

    # 알림 결과 업데이트
    jq ".success_count = $success_count | .total_count = $total_count" "$alert_record" > "${alert_record}.tmp" && mv "${alert_record}.tmp" "$alert_record"

    if [[ $success_count -gt 0 ]]; then
        log_success "알림 발송 완료 ($success_count/$total_count 채널 성공)"
    else
        log_error "모든 채널 알림 발송 실패"
        return 1
    fi
}

# 로그 분석 결과 기반 알림 발송
process_log_analysis_alerts() {
    local analysis_dir="$1"

    if [[ ! -d "$analysis_dir" ]]; then
        log_error "분석 디렉토리가 존재하지 않습니다: $analysis_dir"
        return 1
    fi

    log_step "로그 분석 결과 기반 알림 처리"

    # 에러 분석 결과 확인
    local error_report="${analysis_dir}/reports/error_analysis.json"
    if [[ -f "$error_report" ]]; then
        local total_errors
        total_errors=$(jq '[.error_patterns[].errors[].count] | add // 0' "$error_report")

        if [[ "$total_errors" -gt 0 ]]; then
            send_validation_failure_alert "error_analysis" "총 $total_errors 개의 에러 패턴이 발견되었습니다"
        fi
    fi

    # 성능 분석 결과 확인
    local perf_report="${analysis_dir}/reports/performance_analysis.json"
    if [[ -f "$perf_report" ]]; then
        local perf_issues
        perf_issues=$(jq '[.performance_issues[].issues | length] | add // 0' "$perf_report")

        if [[ "$perf_issues" -gt 0 ]]; then
            send_performance_issue_alert "performance_analysis" "threshold_exceeded" "$perf_issues issues"
        fi
    fi

    # 한국어 요구사항 검증 결과 확인
    local korean_report="${analysis_dir}/reports/korean_requirements.json"
    if [[ -f "$korean_report" ]]; then
        local failed_requirements
        failed_requirements=$(jq '[.korean_requirements_verification[] | select(.status == "fail")] | length' "$korean_report")

        if [[ "$failed_requirements" -gt 0 ]]; then
            local failed_list
            failed_list=$(jq -r '[.korean_requirements_verification[] | select(.status == "fail") | .requirement] | join(", ")' "$korean_report")
            send_korean_requirement_alert "requirements_verification" "실패한 요구사항: $failed_list"
        fi
    fi

    log_success "로그 분석 기반 알림 처리 완료"
}

# 오래된 알림 정리
cleanup_old_alerts() {
    log_step "오래된 알림 정리"

    if [[ -d "$ALERTS_DIR" ]]; then
        # 지정된 보관 기간보다 오래된 알림 파일 삭제
        find "$ALERTS_DIR" -name "alert-*.json" -mtime +"$ALERT_RETENTION_DAYS" -delete 2>/dev/null || true
        find "$ALERTS_DIR" -name ".frequency_*" -mtime +"$ALERT_RETENTION_DAYS" -delete 2>/dev/null || true

        local deleted_count
        deleted_count=$(find "$ALERTS_DIR" -name "alert-*.json" -mtime +"$ALERT_RETENTION_DAYS" 2>/dev/null | wc -l)

        if [[ "$deleted_count" -gt 0 ]]; then
            log_info "정리된 오래된 알림: $deleted_count개"
        else
            log_info "정리할 오래된 알림이 없습니다"
        fi
    fi

    log_success "알림 정리 완료"
}

# 메인 실행 함수
main() {
    local alert_type="${1:-}"
    local title="${ALERT_TITLE:-}"
    local message="${ALERT_MESSAGE:-}"
    local severity="${ALERT_SEVERITY:-info}"
    local additional_data="${ALERT_DATA:-}"

    log_info "======================================"
    log_info "DOT Platform 알림 시스템 시작"
    log_info "알림 ID: $ALERT_ID"
    log_info "======================================"

    check_prerequisites

    case "$alert_type" in
        "deployment-success")
            send_deployment_success_alert "${2:-latest}" "${3:-production}"
            ;;
        "deployment-failure")
            send_deployment_failure_alert "${2:-latest}" "${3:-production}" "${4:-알 수 없는 오류}"
            ;;
        "validation-failure")
            send_validation_failure_alert "${2:-unknown}" "${3:-세부 정보 없음}"
            ;;
        "performance-issue")
            send_performance_issue_alert "${2:-unknown}" "${3:-unknown}" "${4:-unknown}"
            ;;
        "korean-requirement")
            send_korean_requirement_alert "${2:-unknown}" "${3:-세부 정보 없음}"
            ;;
        "system-health")
            send_system_health_alert "${2:-unknown}" "${3:-unknown}" "${4:-세부 정보 없음}"
            ;;
        "custom")
            if [[ -z "$title" || -z "$message" ]]; then
                log_error "커스텀 알림에는 제목(-t)과 메시지(-m)가 필요합니다"
                exit 1
            fi
            send_alert "$title" "$message" "$severity" "$additional_data"
            ;;
        "log-analysis")
            if [[ -z "$2" ]]; then
                log_error "로그 분석 결과 디렉토리가 필요합니다"
                exit 1
            fi
            process_log_analysis_alerts "$2"
            ;;
        *)
            log_error "알 수 없는 알림 유형: $alert_type"
            show_help
            exit 1
            ;;
    esac

    cleanup_old_alerts

    log_success "알림 시스템 실행 완료"
}

# 명령행 인수 처리
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -c|--channel)
            ALERT_CHANNELS="$2"
            shift 2
            ;;
        -s|--severity)
            ALERT_SEVERITY="$2"
            shift 2
            ;;
        -m|--message)
            ALERT_MESSAGE="$2"
            shift 2
            ;;
        -t|--title)
            ALERT_TITLE="$2"
            shift 2
            ;;
        -d|--data)
            ALERT_DATA="$2"
            shift 2
            ;;
        -f|--file)
            if [[ -f "$2" ]]; then
                ALERT_DATA=$(cat "$2")
            else
                log_error "데이터 파일을 찾을 수 없습니다: $2"
                exit 1
            fi
            shift 2
            ;;
        --force)
            FORCE_SEND="true"
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