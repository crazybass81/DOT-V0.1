# Quickstart: DOT Platform 배포 검증

## 개요
DOT Platform을 배포한 후 파일 수정 없이 구현된 기능을 검증하는 빠른 시작 가이드.

## 사전 요구사항

### 시스템 요구사항
- Docker Engine 20.10+
- Docker Compose 2.0+
- Node.js 18+ (테스트 실행용)
- Git (소스 코드 관리)
- curl 또는 httpie (API 테스트용)

### 환경 설정
```bash
# 환경 변수 확인
echo $DATABASE_URL
echo $REDIS_URL
echo $JWT_SECRET
echo $SESSION_SECRET

# 필수 환경 변수가 없다면 설정
export DATABASE_URL="postgresql://postgres:password@localhost:5432/dot_platform"
export REDIS_URL="redis://localhost:6379"
export JWT_SECRET="your-jwt-secret-key"
export SESSION_SECRET="your-session-secret-key"
```

## 1단계: 배포 실행

### 기본 배포
```bash
# 프로젝트 디렉토리로 이동
cd /home/ec2-user/DOT-V0.1

# 배포 스크립트 실행 (자동 헬스체크 포함)
./scripts/deploy.sh

# 또는 특정 버전으로 배포
./scripts/deploy.sh v1.0.15 production
```

### 배포 상태 확인
```bash
# 현재 배포 상태 확인
./scripts/deploy.sh --status

# 실행 중인 서비스 확인
docker-compose -f docker-compose.prod.yml ps

# 서비스 로그 확인
docker-compose -f docker-compose.prod.yml logs -f --tail=50
```

## 2단계: 헬스체크 검증

### 기본 헬스체크
```bash
# 전체 시스템 헬스체크
curl -s http://localhost/health | jq

# 백엔드 직접 헬스체크
curl -s http://localhost:3000/health | jq

# 예상 응답:
# {
#   "status": "healthy",
#   "timestamp": "2025-09-18T10:30:00Z",
#   "uptime_seconds": 86400,
#   "version": "1.0.15",
#   "checks": [
#     {
#       "name": "database",
#       "status": "healthy",
#       "response_time_ms": 15
#     },
#     {
#       "name": "redis",
#       "status": "healthy",
#       "response_time_ms": 5
#     }
#   ]
# }
```

### 서비스별 상태 확인
```bash
# PostgreSQL 연결 확인
docker exec dot-platform_postgres_1 pg_isready -U postgres

# Redis 연결 확인
docker exec dot-platform_redis_1 redis-cli ping

# Nginx 상태 확인
curl -I http://localhost/health
```

## 3단계: 핵심 기능 검증

### API 엔드포인트 테스트
```bash
# 인증 API 테스트
curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpassword"}'

# 사용자 정보 API 테스트 (토큰 필요)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost/api/users/profile

# 출석 API 테스트
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost/api/attendance/status
```

### 프론트엔드 접근성 확인
```bash
# 메인 페이지 로딩 확인
curl -I http://localhost/

# 로그인 페이지 확인
curl -s http://localhost/login | grep -o '<title>[^<]*'

# 정적 리소스 로딩 확인
curl -I http://localhost/static/js/main.js
curl -I http://localhost/static/css/main.css
```

## 4단계: E2E 테스트 실행

### Playwright E2E 테스트
```bash
# 프로덕션 URL로 E2E 테스트 실행
E2E_BASE_URL=http://localhost npm run test:e2e:smoke

# 특정 테스트 스위트 실행
E2E_BASE_URL=http://localhost npx playwright test tests/e2e/attendance/

# 테스트 결과 확인
npx playwright show-report
```

### 핵심 사용자 여정 테스트
```bash
# 로그인 플로우 테스트
npx playwright test tests/e2e/auth/login.spec.js --project=chromium

# 출퇴근 체크인 플로우 테스트
npx playwright test tests/e2e/attendance/qr-checkin.spec.js

# 스케줄 조회 테스트
npx playwright test tests/e2e/schedule/view-schedule.spec.js

# 급여 정보 조회 테스트
npx playwright test tests/e2e/payroll/view-payslip.spec.js
```

## 5단계: 성능 검증

### 로드 테스트 실행
```bash
# K6 로드 테스트 (10명 동시 사용자)
k6 run --vus 10 --duration 2m tests/load/k6-script.js

# 성능 메트릭 확인
curl -s http://localhost/metrics | jq

# 예상 성능 지표:
# - 페이지 로딩 시간: < 3초
# - API 응답 시간 p95: < 500ms
# - 동시 사용자: 10명 지원
# - 오류율: < 5%
```

### 리소스 사용량 모니터링
```bash
# 컨테이너 리소스 사용량 확인
docker stats --no-stream

# 시스템 리소스 확인
df -h  # 디스크 사용량
free -h  # 메모리 사용량
top  # CPU 사용량
```

## 6단계: 접근성 및 다국어 검증

### 웹 접근성 테스트
```bash
# Playwright 접근성 테스트 실행
npx playwright test tests/accessibility/ --project=chromium

# 키보드 네비게이션 테스트
npx playwright test tests/e2e/accessibility/keyboard-navigation.spec.js

# 스크린 리더 호환성 테스트
npx playwright test tests/e2e/accessibility/screen-reader.spec.js
```

### 다국어 지원 확인
```bash
# 한국어 UI 확인
curl -H "Accept-Language: ko-KR" http://localhost/

# 영어 UI 확인
curl -H "Accept-Language: en-US" http://localhost/

# 일본어 UI 확인
curl -H "Accept-Language: ja-JP" http://localhost/

# 중국어 UI 확인
curl -H "Accept-Language: zh-CN" http://localhost/
```

## 검증 체크리스트

### ✅ 배포 성공 확인
- [ ] Docker 컨테이너 모두 실행 중 (`docker ps`)
- [ ] 헬스체크 엔드포인트 정상 응답 (`/health`)
- [ ] 데이터베이스 연결 정상 (PostgreSQL)
- [ ] 캐시 서비스 정상 (Redis)
- [ ] 웹 서버 정상 (Nginx)

### ✅ 핵심 기능 검증
- [ ] 사용자 로그인/로그아웃 (`POST /api/auth/login`)
- [ ] 출퇴근 체크인/체크아웃 (`POST /api/attendance/checkin`)
- [ ] QR 코드 생성 및 스캔 (`GET /api/attendance/qr`)
- [ ] GPS 위치 검증 (`POST /api/attendance/validate-location`)
- [ ] 스케줄 조회 (`GET /api/schedules`)
- [ ] 급여 정보 조회 (`GET /api/payroll`)

### ✅ 성능 요구사항 충족
- [ ] 페이지 로딩 시간 < 3초
- [ ] 10명 동시 사용자 지원
- [ ] API 응답 시간 p95 < 500ms
- [ ] 오류율 < 5%
- [ ] 메모리 사용량 정상 범위

### ✅ 품질 기능 검증
- [ ] 웹 접근성 (WCAG 2.1 AA)
- [ ] 키보드 네비게이션
- [ ] 스크린 리더 지원
- [ ] 다국어 지원 (한/영/일/중)
- [ ] 반응형 웹 디자인
- [ ] 에러 추적 및 모니터링

## 문제 해결

### 일반적인 문제들

#### 서비스 시작 실패
```bash
# 로그 확인
docker-compose -f docker-compose.prod.yml logs [service_name]

# 포트 충돌 확인
netstat -tulpn | grep :80
netstat -tulpn | grep :3000

# 권한 문제 확인
ls -la docker-compose.prod.yml
ls -la .env.production
```

#### 데이터베이스 연결 실패
```bash
# PostgreSQL 상태 확인
docker exec dot-platform_postgres_1 pg_isready

# 연결 문자열 확인
echo $DATABASE_URL

# 마이그레이션 상태 확인
docker exec dot-platform_backend_1 npm run migrate:status
```

#### 성능 이슈
```bash
# 느린 쿼리 확인
docker exec dot-platform_postgres_1 psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# Redis 메모리 사용량 확인
docker exec dot-platform_redis_1 redis-cli info memory

# 리소스 사용량 모니터링
docker stats
```

### 롤백 절차
```bash
# 이전 버전으로 롤백
./scripts/deploy.sh --rollback

# 특정 버전으로 롤백
./scripts/deploy.sh v1.0.14 production

# 롤백 후 검증
./scripts/deploy.sh --status
curl -s http://localhost/health | jq '.version'
```

## 지원 및 문의

### 로그 수집
```bash
# 전체 시스템 로그 수집
mkdir -p logs/$(date +%Y%m%d_%H%M%S)
docker-compose -f docker-compose.prod.yml logs > logs/$(date +%Y%m%d_%H%M%S)/all-services.log

# 개별 서비스 로그
docker-compose -f docker-compose.prod.yml logs backend > logs/$(date +%Y%m%d_%H%M%S)/backend.log
docker-compose -f docker-compose.prod.yml logs frontend > logs/$(date +%Y%m%d_%H%M%S)/frontend.log
```

### 시스템 정보 수집
```bash
# 시스템 환경 정보
echo "=== Docker 버전 ===" > system-info.txt
docker --version >> system-info.txt
docker-compose --version >> system-info.txt

echo "=== 시스템 리소스 ===" >> system-info.txt
free -h >> system-info.txt
df -h >> system-info.txt

echo "=== 네트워크 상태 ===" >> system-info.txt
netstat -tulpn | grep -E ':(80|3000|5432|6379)' >> system-info.txt
```

이 quickstart 가이드를 통해 DOT Platform의 배포 후 전체적인 기능 검증을 수행할 수 있습니다. 각 단계를 순서대로 진행하여 시스템이 정상적으로 동작하는지 확인하세요.