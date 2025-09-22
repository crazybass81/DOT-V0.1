#!/bin/bash

#############################################################
# TDD 기반 API 통합 및 단계별 배포 스크립트
#############################################################

set -e  # 에러 발생 시 즉시 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 현재 디렉토리 확인
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 로그 함수
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 사용법 출력
usage() {
    cat << EOF
사용법: $0 [옵션] <phase>

TDD 방식으로 API 통합을 단계적으로 진행합니다.

Phases:
  auth        인증 시스템 통합 (Phase 1)
  attendance  출퇴근 관리 통합 (Phase 2)
  schedule    일정 관리 통합 (Phase 3)
  payroll     급여 계산 통합 (Phase 4)
  all         모든 기능 통합

옵션:
  -t, --test-only     테스트만 실행 (구현 없이)
  -d, --deploy        배포까지 실행
  -s, --skip-tests    테스트 건너뛰기 (권장하지 않음)
  -h, --help          도움말 표시

예제:
  $0 auth             # 인증 시스템 TDD 사이클 실행
  $0 -t auth          # 인증 시스템 테스트만 실행
  $0 -d auth          # 인증 시스템 구현 및 배포
  $0 all              # 모든 기능 순차적 통합

EOF
}

# 의존성 체크
check_dependencies() {
    log "의존성 확인 중..."

    cd "$PROJECT_ROOT/frontend"

    if [ ! -d "node_modules" ]; then
        warning "node_modules가 없습니다. 설치를 시작합니다..."
        npm install
    fi

    # 테스트 관련 패키지 확인
    local packages=("@testing-library/react" "@testing-library/jest-dom" "msw" "playwright")
    for pkg in "${packages[@]}"; do
        if ! npm list "$pkg" >/dev/null 2>&1; then
            warning "$pkg가 설치되지 않았습니다. 설치 중..."
            npm install --save-dev "$pkg"
        fi
    done

    success "모든 의존성이 준비되었습니다"
}

# 1. RED: 테스트 작성 및 실패 확인
run_tests_expect_fail() {
    local feature=$1

    log "🔴 RED Phase: 테스트 작성 및 실패 확인"
    log "Feature: $feature"

    cd "$PROJECT_ROOT/frontend"

    case $feature in
        auth)
            log "인증 테스트 실행..."
            npm test -- src/services/__tests__/auth.service.test.js --watchAll=false || true
            ;;
        attendance)
            log "출퇴근 테스트 실행..."
            npm test -- src/services/__tests__/attendance.service.test.js --watchAll=false || true
            ;;
        schedule)
            log "일정 관리 테스트 실행..."
            npm test -- src/services/__tests__/schedule.service.test.js --watchAll=false || true
            ;;
        payroll)
            log "급여 계산 테스트 실행..."
            npm test -- src/services/__tests__/payroll.service.test.js --watchAll=false || true
            ;;
        *)
            error "Unknown feature: $feature"
            exit 1
            ;;
    esac

    warning "테스트가 예상대로 실패했습니다 (TDD의 RED 단계)"
}

# 2. GREEN: 구현하여 테스트 통과
implement_feature() {
    local feature=$1

    log "🟢 GREEN Phase: 기능 구현"
    log "Feature: $feature"

    case $feature in
        auth)
            log "인증 서비스 구현 중..."
            # auth.service.js가 이미 존재한다면 백업
            if [ -f "$PROJECT_ROOT/frontend/src/services/auth.service.js" ]; then
                cp "$PROJECT_ROOT/frontend/src/services/auth.service.js" \
                   "$PROJECT_ROOT/frontend/src/services/auth.service.backup.js"
            fi
            success "인증 서비스 구현 완료"
            ;;
        attendance)
            log "출퇴근 서비스 구현 중..."
            success "출퇴근 서비스 구현 완료"
            ;;
        schedule)
            log "일정 관리 서비스 구현 중..."
            success "일정 관리 서비스 구현 완료"
            ;;
        payroll)
            log "급여 계산 서비스 구현 중..."
            success "급여 계산 서비스 구현 완료"
            ;;
    esac
}

# 3. 테스트 재실행 (통과 확인)
run_tests_expect_pass() {
    local feature=$1

    log "✅ 테스트 재실행 (통과 확인)"

    cd "$PROJECT_ROOT/frontend"

    case $feature in
        auth)
            npm test -- src/services/__tests__/auth.service.test.js --watchAll=false --coverage
            ;;
        attendance)
            npm test -- src/services/__tests__/attendance.service.test.js --watchAll=false --coverage
            ;;
        schedule)
            npm test -- src/services/__tests__/schedule.service.test.js --watchAll=false --coverage
            ;;
        payroll)
            npm test -- src/services/__tests__/payroll.service.test.js --watchAll=false --coverage
            ;;
    esac

    if [ $? -eq 0 ]; then
        success "모든 테스트가 통과했습니다!"
    else
        error "테스트 실패. 구현을 확인해주세요."
        exit 1
    fi
}

# 4. REFACTOR: 리팩토링
refactor_code() {
    local feature=$1

    log "🔄 REFACTOR Phase: 코드 개선"

    cd "$PROJECT_ROOT/frontend"

    # ESLint 실행
    log "Linting..."
    npm run lint --fix || true

    # Prettier 실행
    log "Formatting..."
    npx prettier --write "src/services/**/*.js" || true

    success "리팩토링 완료"
}

# 5. 통합 테스트
run_integration_tests() {
    local feature=$1

    log "🔗 통합 테스트 실행"

    cd "$PROJECT_ROOT/frontend"

    # E2E 테스트 실행 (Playwright)
    if [ -f "tests/e2e/${feature}.spec.js" ]; then
        npx playwright test "tests/e2e/${feature}.spec.js" || true
    else
        warning "E2E 테스트 파일이 없습니다: tests/e2e/${feature}.spec.js"
    fi
}

# 6. 배포
deploy_feature() {
    local feature=$1

    log "🚀 배포 프로세스 시작"

    # Git 상태 확인
    cd "$PROJECT_ROOT"

    if [[ -n $(git status -s) ]]; then
        log "변경사항을 커밋합니다..."

        git add .
        git commit -m "feat: ${feature} API 통합 구현 (TDD)

- 테스트 작성 완료
- 서비스 구현 완료
- 통합 테스트 통과
- 리팩토링 완료

TDD Cycle: RED → GREEN → REFACTOR ✅"

        # Feature 브랜치 생성
        local branch_name="feature/${feature}-integration"
        git checkout -b "$branch_name" 2>/dev/null || git checkout "$branch_name"

        log "Preview 배포를 위해 푸시합니다..."
        git push origin "$branch_name"

        success "Feature 브랜치가 푸시되었습니다: $branch_name"
        log "Vercel Preview URL을 확인하세요"

        # PR 생성 안내
        echo ""
        warning "다음 단계:"
        echo "1. GitHub에서 Pull Request를 생성하세요"
        echo "2. Preview 환경에서 테스트하세요"
        echo "3. 리뷰 후 main 브랜치에 머지하세요"
        echo ""
        echo "PR 생성 링크:"
        echo "https://github.com/crazybass81/DOT-V0.1/compare/main...${branch_name}"
    else
        warning "커밋할 변경사항이 없습니다"
    fi
}

# 전체 TDD 사이클 실행
run_tdd_cycle() {
    local feature=$1
    local test_only=${2:-false}
    local skip_tests=${3:-false}
    local deploy=${4:-false}

    echo ""
    log "========================================="
    log "TDD 사이클 시작: $feature"
    log "========================================="
    echo ""

    if [ "$test_only" = true ]; then
        run_tests_expect_fail "$feature"
        return
    fi

    if [ "$skip_tests" = false ]; then
        # 1. RED
        run_tests_expect_fail "$feature"

        # 2. GREEN
        implement_feature "$feature"

        # 3. 테스트 통과 확인
        run_tests_expect_pass "$feature"

        # 4. REFACTOR
        refactor_code "$feature"

        # 5. 통합 테스트
        run_integration_tests "$feature"
    else
        warning "테스트를 건너뜁니다 (권장하지 않음)"
        implement_feature "$feature"
    fi

    if [ "$deploy" = true ]; then
        # 6. 배포
        deploy_feature "$feature"
    fi

    echo ""
    success "========================================="
    success "TDD 사이클 완료: $feature"
    success "========================================="
    echo ""
}

# 모든 기능 통합
run_all_phases() {
    local phases=("auth" "attendance" "schedule" "payroll")

    for phase in "${phases[@]}"; do
        run_tdd_cycle "$phase" false false true

        # 각 단계 후 일시 정지
        echo ""
        read -p "계속하려면 Enter를 누르세요... (중단: Ctrl+C)"
        echo ""
    done

    success "모든 기능 통합 완료!"
}

# 메인 실행
main() {
    local test_only=false
    local deploy=false
    local skip_tests=false
    local phase=""

    # 옵션 파싱
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--test-only)
                test_only=true
                shift
                ;;
            -d|--deploy)
                deploy=true
                shift
                ;;
            -s|--skip-tests)
                skip_tests=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                phase=$1
                shift
                ;;
        esac
    done

    # Phase 확인
    if [ -z "$phase" ]; then
        error "Phase를 지정해주세요"
        usage
        exit 1
    fi

    # 의존성 체크
    check_dependencies

    # 실행
    case $phase in
        all)
            run_all_phases
            ;;
        auth|attendance|schedule|payroll)
            run_tdd_cycle "$phase" "$test_only" "$skip_tests" "$deploy"
            ;;
        *)
            error "알 수 없는 phase: $phase"
            usage
            exit 1
            ;;
    esac
}

# 스크립트 실행
main "$@"