#!/bin/bash

# 통합 테스트 실행 스크립트
# DOT Platform의 전체 테스트 수행

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 헬프 메시지
show_help() {
    cat << EOF
DOT Platform 테스트 실행 스크립트

사용법: $0 [옵션]

옵션:
    -a, --all           모든 테스트 실행
    -u, --unit          단위 테스트만 실행
    -i, --integration   통합 테스트만 실행
    -e, --e2e           E2E 테스트만 실행
    -c, --coverage      코드 커버리지 포함
    -w, --watch         감시 모드로 실행
    -p, --parallel      병렬 실행
    -h, --help          이 도움말 표시

예제:
    $0 -a               # 모든 테스트 실행
    $0 -i -c            # 통합 테스트를 커버리지와 함께 실행
    $0 -u -w            # 단위 테스트를 감시 모드로 실행
EOF
}

# 기본값 설정
RUN_UNIT=false
RUN_INTEGRATION=false
RUN_E2E=false
COVERAGE=false
WATCH=false
PARALLEL=false
TEST_TIMEOUT=300000  # 5분

# 명령행 인수 처리
while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--all)
            RUN_UNIT=true
            RUN_INTEGRATION=true
            RUN_E2E=true
            shift
            ;;
        -u|--unit)
            RUN_UNIT=true
            shift
            ;;
        -i|--integration)
            RUN_INTEGRATION=true
            shift
            ;;
        -e|--e2e)
            RUN_E2E=true
            shift
            ;;
        -c|--coverage)
            COVERAGE=true
            shift
            ;;
        -w|--watch)
            WATCH=true
            shift
            ;;
        -p|--parallel)
            PARALLEL=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "알 수 없는 옵션: $1"
            show_help
            exit 1
            ;;
    esac
done

# 최소한 하나의 테스트 타입 선택 확인
if [[ "$RUN_UNIT" == false && "$RUN_INTEGRATION" == false && "$RUN_E2E" == false ]]; then
    log_warn "테스트 타입이 선택되지 않았습니다. 전체 테스트를 실행합니다."
    RUN_UNIT=true
    RUN_INTEGRATION=true
    RUN_E2E=true
fi

# 환경 변수 확인
check_environment() {
    log_info "환경 설정 확인 중..."

    # Node.js 환경 설정
    if [[ -f ".env.test" ]]; then
        export $(cat .env.test | grep -v '^#' | xargs)
        log_info "테스트 환경 변수 로드됨"
    else
        log_warn ".env.test 파일이 없습니다. 기본 환경 변수를 사용합니다."
    fi

    # 데이터베이스 연결 확인
    if [[ -z "$TEST_DATABASE_URL" ]]; then
        log_error "TEST_DATABASE_URL이 설정되지 않았습니다."
        exit 1
    fi

    # 테스트 포트 확인
    if [[ -z "$TEST_PORT" ]]; then
        export TEST_PORT=3001
        log_warn "TEST_PORT가 설정되지 않아 3001로 설정합니다."
    fi
}

# 의존성 확인
check_dependencies() {
    log_info "의존성 확인 중..."

    # Node.js 모듈 설치 확인
    if [[ ! -d "node_modules" ]] || [[ ! -d "backend/node_modules" ]] || [[ ! -d "frontend/node_modules" ]]; then
        log_info "의존성을 설치합니다..."
        npm install
        cd backend && npm install && cd ..
        cd frontend && npm install && cd ..
    fi

    # Playwright 브라우저 확인 (E2E 테스트용)
    if [[ "$RUN_E2E" == true ]]; then
        if ! command -v playwright &> /dev/null; then
            log_info "Playwright 설치 중..."
            npx playwright install
        fi
    fi
}

# 테스트 데이터베이스 준비
setup_test_database() {
    log_info "테스트 데이터베이스 준비 중..."

    # 데이터베이스 초기화
    npm run db:test:setup 2>/dev/null || {
        log_warn "데이터베이스 설정 스크립트가 없습니다. 수동으로 확인해주세요."
    }
}

# 백엔드 서버 시작
start_backend() {
    log_info "백엔드 서버 시작 중..."

    cd backend

    if [[ "$WATCH" == true ]]; then
        npm run dev &
    else
        npm run start:test &
    fi

    BACKEND_PID=$!
    cd ..

    # 서버 준비 대기
    log_info "백엔드 서버 준비 대기 중..."
    for i in {1..30}; do
        if curl -s http://localhost:$TEST_PORT/health > /dev/null; then
            log_info "백엔드 서버가 준비되었습니다."
            break
        fi
        if [[ $i -eq 30 ]]; then
            log_error "백엔드 서버 시작에 실패했습니다."
            exit 1
        fi
        sleep 2
    done
}

# 프론트엔드 빌드
build_frontend() {
    if [[ "$RUN_E2E" == true ]]; then
        log_info "프론트엔드 빌드 중..."
        cd frontend
        npm run build:test
        npm run serve:test &
        FRONTEND_PID=$!
        cd ..

        # 프론트엔드 서버 준비 대기
        log_info "프론트엔드 서버 준비 대기 중..."
        for i in {1..20}; do
            if curl -s http://localhost:3000 > /dev/null; then
                log_info "프론트엔드 서버가 준비되었습니다."
                break
            fi
            if [[ $i -eq 20 ]]; then
                log_error "프론트엔드 서버 시작에 실패했습니다."
                exit 1
            fi
            sleep 3
        done
    fi
}

# 단위 테스트 실행
run_unit_tests() {
    log_info "단위 테스트 실행 중..."

    local jest_options=""

    if [[ "$COVERAGE" == true ]]; then
        jest_options="$jest_options --coverage"
    fi

    if [[ "$WATCH" == true ]]; then
        jest_options="$jest_options --watch"
    fi

    if [[ "$PARALLEL" == true ]]; then
        jest_options="$jest_options --maxWorkers=4"
    fi

    # 백엔드 단위 테스트
    log_info "백엔드 단위 테스트..."
    cd backend
    npm test -- $jest_options --testTimeout=$TEST_TIMEOUT || TEST_EXIT_CODE=$?
    cd ..

    # 프론트엔드 단위 테스트
    log_info "프론트엔드 단위 테스트..."
    cd frontend
    npm test -- $jest_options --testTimeout=$TEST_TIMEOUT || TEST_EXIT_CODE=$?
    cd ..

    return ${TEST_EXIT_CODE:-0}
}

# 통합 테스트 실행
run_integration_tests() {
    log_info "통합 테스트 실행 중..."

    local jest_options="--testMatch='**/integration/**/*.test.js'"

    if [[ "$COVERAGE" == true ]]; then
        jest_options="$jest_options --coverage"
    fi

    if [[ "$PARALLEL" == false ]]; then
        jest_options="$jest_options --runInBand"
    fi

    npx jest $jest_options --testTimeout=$TEST_TIMEOUT || TEST_EXIT_CODE=$?

    return ${TEST_EXIT_CODE:-0}
}

# E2E 테스트 실행
run_e2e_tests() {
    log_info "E2E 테스트 실행 중..."

    local playwright_options=""

    if [[ "$PARALLEL" == true ]]; then
        playwright_options="$playwright_options --workers=4"
    else
        playwright_options="$playwright_options --workers=1"
    fi

    npx playwright test $playwright_options || TEST_EXIT_CODE=$?

    return ${TEST_EXIT_CODE:-0}
}

# 테스트 리포트 생성
generate_reports() {
    log_info "테스트 리포트 생성 중..."

    # 커버리지 리포트 통합
    if [[ "$COVERAGE" == true ]]; then
        if command -v nyc &> /dev/null; then
            nyc report --reporter=html --report-dir=./coverage/combined
            log_info "통합 커버리지 리포트가 ./coverage/combined에 생성되었습니다."
        fi
    fi

    # Playwright 리포트
    if [[ "$RUN_E2E" == true ]]; then
        npx playwright show-report &
        log_info "E2E 테스트 리포트를 웹에서 확인할 수 있습니다."
    fi
}

# 정리 함수
cleanup() {
    log_info "정리 작업 중..."

    # 백그라운드 프로세스 종료
    if [[ ! -z "$BACKEND_PID" ]]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi

    if [[ ! -z "$FRONTEND_PID" ]]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi

    # 테스트 데이터 정리
    npm run db:test:cleanup 2>/dev/null || true
}

# 시그널 트랩 설정
trap cleanup EXIT INT TERM

# 메인 실행 함수
main() {
    local start_time=$(date +%s)
    local final_exit_code=0

    log_info "DOT Platform 테스트 시작..."

    # 환경 준비
    check_environment
    check_dependencies
    setup_test_database

    # 서버 시작 (통합/E2E 테스트용)
    if [[ "$RUN_INTEGRATION" == true || "$RUN_E2E" == true ]]; then
        start_backend
    fi

    # 프론트엔드 준비 (E2E 테스트용)
    if [[ "$RUN_E2E" == true ]]; then
        build_frontend
    fi

    # 테스트 실행
    if [[ "$RUN_UNIT" == true ]]; then
        run_unit_tests
        if [[ $? -ne 0 ]]; then
            final_exit_code=1
        fi
    fi

    if [[ "$RUN_INTEGRATION" == true ]]; then
        run_integration_tests
        if [[ $? -ne 0 ]]; then
            final_exit_code=1
        fi
    fi

    if [[ "$RUN_E2E" == true ]]; then
        run_e2e_tests
        if [[ $? -ne 0 ]]; then
            final_exit_code=1
        fi
    fi

    # 리포트 생성
    generate_reports

    # 결과 출력
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [[ $final_exit_code -eq 0 ]]; then
        log_info "모든 테스트가 성공했습니다! (소요 시간: ${duration}초)"
    else
        log_error "일부 테스트가 실패했습니다. (소요 시간: ${duration}초)"
    fi

    return $final_exit_code
}

# 스크립트 실행
main "$@"