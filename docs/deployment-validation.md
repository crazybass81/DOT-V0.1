# DOT Platform 배포 검증 시스템

배포 후 파일 수정 없이 DOT Platform의 구현된 기능을 실제 환경에서 검증하는 종합적인 시스템입니다.

## 📋 목차

1. [시스템 개요](#시스템-개요)
2. [한국어 요구사항](#한국어-요구사항)
3. [아키텍처](#아키텍처)
4. [설치 및 설정](#설치-및-설정)
5. [검증 스크립트](#검증-스크립트)
6. [CI/CD 통합](#cicd-통합)
7. [모니터링 및 알림](#모니터링-및-알림)
8. [리포팅](#리포팅)
9. [문제 해결](#문제-해결)
10. [API 레퍼런스](#api-레퍼런스)

## 시스템 개요

DOT Platform 배포 검증 시스템은 다음과 같은 핵심 기능을 제공합니다:

### 🎯 핵심 기능

- **자동 헬스체크**: 모든 서비스의 상태를 실시간으로 모니터링
- **성능 검증**: 한국어 요구사항(< 3초, 10명 동시 사용자) 준수 확인
- **기능 검증**: E2E 테스트를 통한 핵심 사용자 여정 검증
- **로그 분석**: 시스템 로그에서 에러 패턴 및 성능 이슈 자동 탐지
- **알림 시스템**: 다양한 채널을 통한 실시간 알림
- **종합 리포팅**: HTML, JSON, 텍스트 형식의 상세한 검증 리포트

### 🏗️ 검증 레이어

```
┌─────────────────────────────────────────────────────────────┐
│                 배포 검증 레이어 (신규)                        │
├─────────────────────────────────────────────────────────────┤
│  헬스체크         │  성능 검증        │  기능 검증             │
│  - Docker 상태    │  - K6 로드테스트  │  - Playwright E2E     │
│  - 서비스 의존성   │  - 응답시간 측정  │  - API 계약 검증      │
│  - 데이터베이스   │  - 리소스 모니터링 │  - 사용자 여정        │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                  기존 DOT Platform                          │
│  프론트엔드       │  백엔드          │  인프라               │
│  - React 18      │  - Node.js 18    │  - PostgreSQL 14      │
│  - 한국어 지원    │  - Express API   │  - Redis 7           │
│  - 접근성 지원    │  - JWT 인증      │  - Nginx 프록시       │
└─────────────────────────────────────────────────────────────┘
```

## 한국어 요구사항

DOT Platform은 한국의 중소 레스토랑을 대상으로 하는 시스템으로 다음 요구사항을 준수해야 합니다:

### 🇰🇷 필수 요구사항

| 요구사항 | 기준 | 검증 방법 |
|---------|------|-----------|
| **페이지 로딩 시간** | < 3초 | 자동 응답시간 측정, K6 로드테스트 |
| **동시 사용자 지원** | 10명 이상 | 로드테스트, 커넥션 풀 모니터링 |
| **문자 인코딩** | UTF-8 | 로그 인코딩 검증, API 응답 검증 |
| **다국어 지원** | 한/영/일/중 | UI 언어 전환 테스트 |
| **접근성** | WCAG 2.1 AA | Playwright 접근성 테스트 |

### 📊 성능 지표

- **First Contentful Paint (FCP)**: < 1.5초
- **Time to Interactive (TTI)**: < 3초
- **API 응답시간 (p95)**: < 500ms
- **오류율**: < 5%
- **가동시간**: > 99%

## 아키텍처

### 검증 프로세스 플로우

```mermaid
graph TD
    A[배포 시작] --> B[기본 헬스체크]
    B --> C[서비스 의존성 확인]
    C --> D[성능 검증]
    D --> E[기능 검증]
    E --> F[로그 분석]
    F --> G[알림 발송]
    G --> H[리포트 생성]

    B --> I[실패시 알림]
    C --> I
    D --> I
    E --> I

    I --> J[롤백 고려]
```

### 컴포넌트 구조

```
scripts/
├── deploy.sh                    # 배포 스크립트 (검증 통합)
├── validate-deployment.sh       # 메인 검증 스크립트
├── health-monitor.sh            # 헬스 모니터링
├── performance-validation.sh    # 성능 검증
├── run-k6-tests.sh             # K6 로드테스트
├── collect-logs.sh             # 로그 수집 및 분석
├── send-alerts.sh              # 알림 시스템
└── generate-report.sh          # 리포트 생성

tests/deployment/
├── contract/                   # API 계약 테스트
├── integration/               # 통합 테스트
├── e2e/                      # E2E 테스트
├── accessibility/            # 접근성 테스트
├── i18n/                    # 다국어 테스트
└── performance/             # 성능 테스트

logs/
├── analysis/                 # 로그 분석 결과
├── alerts/                  # 알림 기록
└── reports/                 # 검증 리포트
```

## 설치 및 설정

### 시스템 요구사항

- **운영체제**: Linux (Ubuntu 20.04+ 권장)
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Node.js**: 18+ (테스트 실행용)
- **메모리**: 최소 4GB RAM
- **디스크**: 최소 20GB 여유 공간

### 기본 설정

1. **환경 변수 설정**

```bash
# 필수 환경 변수
export DATABASE_URL="postgresql://postgres:password@localhost:5432/dot_platform"
export REDIS_URL="redis://localhost:6379"
export JWT_SECRET="your-jwt-secret-key"
export SESSION_SECRET="your-session-secret-key"

# 알림 설정 (선택사항)
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
export EMAIL_SMTP_SERVER="smtp.gmail.com"
export EMAIL_FROM="alerts@yourcompany.com"
export EMAIL_TO="admin@yourcompany.com"
```

2. **배포 및 검증 실행**

```bash
# 기본 배포 (검증 포함)
./scripts/deploy.sh

# 특정 버전 배포
./scripts/deploy.sh v1.0.15 production

# 검증만 별도 실행
./scripts/validate-deployment.sh
```

## 검증 스크립트

### 1. 메인 검증 스크립트 (`validate-deployment.sh`)

전체 시스템을 종합적으로 검증하는 메인 스크립트입니다.

```bash
# 기본 실행
./scripts/validate-deployment.sh

# 특정 검증 모드
VALIDATION_MODE=smoke ./scripts/validate-deployment.sh
VALIDATION_MODE=performance ./scripts/validate-deployment.sh
VALIDATION_MODE=full ./scripts/validate-deployment.sh
```

**검증 모드**:
- `health`: 기본 헬스체크만 (60초)
- `smoke`: 핵심 기능 스모크 테스트 (180초)
- `functional`: 전체 기능 테스트 (300초)
- `performance`: 성능 및 로드 테스트
- `full`: 모든 검증 포함 (헬스체크, 성능, 기능, 접근성, 다국어)

### 2. 헬스 모니터링 (`health-monitor.sh`)

시스템의 실시간 상태를 지속적으로 모니터링합니다.

```bash
# 연속 모니터링 시작
./scripts/health-monitor.sh --continuous

# 1회 상태 체크
./scripts/health-monitor.sh --once

# 특정 서비스만 모니터링
./scripts/health-monitor.sh --services backend,database
```

### 3. 성능 검증 (`performance-validation.sh`)

한국어 요구사항을 중심으로 성능을 검증합니다.

```bash
# 기본 성능 테스트
./scripts/performance-validation.sh

# 로드 테스트 (10명 동시 사용자)
./scripts/performance-validation.sh --load-test --users 10

# 응답시간 벤치마크
./scripts/performance-validation.sh --benchmark --threshold 3000
```

### 4. K6 로드 테스트 (`run-k6-tests.sh`)

실제 사용자 시나리오를 시뮬레이션하는 로드 테스트를 실행합니다.

```bash
# 한국어 요구사항 기준 테스트 (10명 동시 사용자)
./scripts/run-k6-tests.sh --scenario korean-requirements

# 스트레스 테스트
./scripts/run-k6-tests.sh --scenario stress-test --users 50

# 스파이크 테스트
./scripts/run-k6-tests.sh --scenario spike-test
```

## CI/CD 통합

### GitHub Actions 워크플로우

DOT Platform은 GitHub Actions를 통해 완전히 자동화된 배포 및 검증 파이프라인을 제공합니다.

#### 배포 파이프라인 단계

1. **코드 품질 검사**
   - ESLint 및 TypeScript 검사
   - 단위 테스트 실행
   - 코드 커버리지 확인

2. **Docker 이미지 빌드**
   - GitHub Container Registry에 이미지 푸시
   - 멀티 아키텍처 지원 (amd64, arm64)

3. **Staging 배포 및 검증**
   - Docker Compose 기반 배포
   - 자동 헬스체크 및 스모크 테스트
   - 한국어 요구사항 검증

4. **통합 테스트**
   - Playwright E2E 테스트
   - 접근성 검증 (WCAG 2.1 AA)
   - 다국어 지원 테스트 (한/영/일/중)
   - K6 성능 테스트

5. **Production 배포 (수동 승인)**
   - 수동 승인 프로세스
   - 전체 검증 실행
   - 자동 롤백 기능

6. **배포 후 모니터링**
   - 5분간 지속적 모니터링
   - 한국어 요구사항 재검증
   - 최종 리포트 생성

#### 환경 변수 설정

GitHub 저장소 Settings > Secrets에서 다음 변수들을 설정하세요:

```yaml
# 배포 관련
STAGING_SSH_KEY: SSH 개인키
STAGING_HOST: staging.yourcompany.com
STAGING_USER: deploy
STAGING_PATH: /opt/dot-platform

PRODUCTION_SSH_KEY: SSH 개인키
PRODUCTION_HOST: app.yourcompany.com
PRODUCTION_USER: deploy
PRODUCTION_PATH: /opt/dot-platform

# 승인자 목록
PRODUCTION_APPROVERS: "admin1,admin2,admin3"

# 알림 설정
SLACK_WEBHOOK: Slack 웹훅 URL
```

## 모니터링 및 알림

### 알림 시스템 (`send-alerts.sh`)

다양한 채널을 통해 실시간 알림을 발송합니다.

#### 지원하는 알림 채널

- **Slack**: 웹훅을 통한 실시간 알림
- **Email**: SMTP를 통한 이메일 알림
- **Webhook**: 사용자 정의 웹훅
- **Microsoft Teams**: Teams 채널 알림

#### 알림 유형

1. **배포 관련**
   ```bash
   # 배포 성공
   ./scripts/send-alerts.sh deployment-success v1.0.15 production

   # 배포 실패
   ./scripts/send-alerts.sh deployment-failure v1.0.15 production "Database connection failed"
   ```

2. **검증 관련**
   ```bash
   # 검증 실패
   ./scripts/send-alerts.sh validation-failure health-check "PostgreSQL not responding"

   # 성능 이슈
   ./scripts/send-alerts.sh performance-issue response_time 5000ms 3000ms
   ```

3. **한국어 요구사항 위반**
   ```bash
   # 응답시간 초과
   ./scripts/send-alerts.sh korean-requirement response_time "응답시간이 3.5초로 요구사항 초과"

   # 동시 사용자 지원 문제
   ./scripts/send-alerts.sh korean-requirement concurrent_users "연결 풀 부족으로 동시 사용자 지원 불가"
   ```

#### 알림 설정

```bash
# 심각도 임계값 설정
export ALERT_SEVERITY_THRESHOLD="warning"  # info, warning, error, critical

# 알림 빈도 제한 (초)
export MAX_ALERT_FREQUENCY="300"  # 5분 간격

# 알림 보관 기간 (일)
export ALERT_RETENTION_DAYS="30"
```

### 로그 수집 및 분석 (`collect-logs.sh`)

시스템의 모든 로그를 수집하고 분석하여 문제를 조기에 발견합니다.

#### 수집 대상

- **Docker 컨테이너 로그**: 모든 서비스의 stdout/stderr
- **애플리케이션 로그**: 백엔드 앱 로그, 에러 로그
- **웹 서버 로그**: Nginx 접근/에러 로그
- **데이터베이스 로그**: PostgreSQL 쿼리 로그
- **성능 메트릭**: CPU, 메모리, 네트워크 사용량

#### 분석 기능

- **한국어 에러 패턴 감지**: 한글 오류 메시지 우선 분석
- **성능 이슈 탐지**: 3초 임계값 위반, 높은 리소스 사용
- **인코딩 검증**: UTF-8 인코딩 준수 확인
- **응답시간 분석**: 한국어 요구사항 기준 성능 분석

```bash
# 전체 로그 수집 및 분석
./scripts/collect-logs.sh

# 특정 서비스만 수집
./scripts/collect-logs.sh -s backend,nginx -d 600

# 한국어 에러만 분석
./scripts/collect-logs.sh --korean-errors --analysis deep

# 성능 관련 로그만 수집
./scripts/collect-logs.sh --performance-only
```

## 리포팅

### 종합 리포트 생성 (`generate-report.sh`)

모든 검증 결과를 종합하여 상세한 리포트를 생성합니다.

#### 리포트 형식

1. **HTML 리포트**: 웹 브라우저에서 확인할 수 있는 대화형 리포트
2. **JSON 리포트**: API 연동 및 자동화를 위한 구조화된 데이터
3. **텍스트 리포트**: 터미널 및 이메일에 적합한 텍스트 형식

#### 리포트 섹션

- **한국어 요구사항 검증 상태**: 🇰🇷 모든 요구사항의 통과/실패 현황
- **배포 상태**: 서비스별 상태 및 헬스체크 결과
- **성능 분석**: 응답시간, 리소스 사용량, 부하 테스트 결과
- **검증 결과**: 에러 패턴, 기능 테스트, 보안 검사 결과

```bash
# 전체 리포트 생성 (HTML, JSON, 텍스트)
./scripts/generate-report.sh

# HTML 리포트만 생성
./scripts/generate-report.sh -f html

# 특정 섹션만 포함
./scripts/generate-report.sh -s deployment,performance

# 압축된 리포트
./scripts/generate-report.sh --compress

# 이메일로 발송
./scripts/generate-report.sh -f pdf --email
```

#### 리포트 예시

**한국어 요구사항 상태**:
- ✅ 페이지 로딩 시간: 2.1초 (< 3초)
- ✅ 동시 사용자 지원: 15명 (≥ 10명)
- ✅ UTF-8 인코딩: 정상
- ✅ 한국어 메시지: 지원됨

**전체 평가**: 정상 (HEALTHY) - 한국어 요구사항 준수율 100%

## 문제 해결

### 일반적인 문제들

#### 1. 서비스 시작 실패

**증상**: Docker 컨테이너가 시작되지 않거나 헬스체크 실패

**해결 방법**:
```bash
# 로그 확인
docker-compose -f docker-compose.prod.yml logs [service_name]

# 포트 충돌 확인
netstat -tulpn | grep :80
netstat -tulpn | grep :3000

# 권한 문제 확인
ls -la docker-compose.prod.yml
ls -la .env.production

# 환경 변수 확인
echo $DATABASE_URL
echo $REDIS_URL
```

#### 2. 성능 요구사항 미달

**증상**: 페이지 로딩 시간이 3초를 초과하거나 동시 사용자 지원 불가

**해결 방법**:
```bash
# 성능 분석 실행
./scripts/performance-validation.sh --benchmark

# 리소스 사용량 확인
docker stats

# 데이터베이스 성능 확인
docker exec dot-postgres-prod psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# 캐시 상태 확인
docker exec dot-redis-prod redis-cli info memory
```

#### 3. 한국어 인코딩 문제

**증상**: 한글 텍스트가 깨지거나 UTF-8 인코딩 오류

**해결 방법**:
```bash
# 로그 인코딩 확인
./scripts/collect-logs.sh --korean-errors

# 데이터베이스 인코딩 확인
docker exec dot-postgres-prod psql -c "SHOW server_encoding;"

# 웹 서버 설정 확인
curl -I http://localhost/ | grep -i content-type
```

#### 4. 알림 발송 실패

**증상**: 배포 또는 검증 실패 시 알림이 오지 않음

**해결 방법**:
```bash
# 알림 설정 확인
echo $SLACK_WEBHOOK_URL
echo $EMAIL_SMTP_SERVER

# 알림 테스트
./scripts/send-alerts.sh custom -t "테스트 알림" -m "알림 시스템 테스트" --force

# 알림 로그 확인
ls -la /home/ec2-user/DOT-V0.1/logs/alerts/
```

### 롤백 절차

배포 검증 실패 시 자동 또는 수동 롤백을 수행할 수 있습니다.

#### 자동 롤백

검증 실패 시 자동으로 이전 버전으로 롤백:

```bash
# 배포 시 자동 롤백 활성화
ROLLBACK_ON_VALIDATION_FAILURE=true ./scripts/deploy.sh v1.0.15

# CI/CD에서 자동 롤백 (GitHub Actions)
export ROLLBACK_ON_VALIDATION_FAILURE="true"
```

#### 수동 롤백

```bash
# 이전 버전으로 롤백
./scripts/deploy.sh --rollback

# 특정 버전으로 롤백
./scripts/deploy.sh v1.0.14 production

# 롤백 후 검증
./scripts/deploy.sh --status
curl -s http://localhost/health | jq '.version'
```

### 로그 수집 및 지원

문제가 지속될 경우 다음 명령어로 로그를 수집하여 지원팀에 전달하세요:

```bash
# 전체 시스템 로그 수집
mkdir -p support-logs/$(date +%Y%m%d_%H%M%S)
./scripts/collect-logs.sh -o support-logs/$(date +%Y%m%d_%H%M%S)

# 종합 리포트 생성
./scripts/generate-report.sh --compress

# 시스템 정보 수집
echo "=== 시스템 정보 ===" > system-info.txt
docker --version >> system-info.txt
docker-compose --version >> system-info.txt
free -h >> system-info.txt
df -h >> system-info.txt
```

## API 레퍼런스

### 헬스체크 엔드포인트

#### `GET /health`

시스템 전체 상태를 확인합니다.

**응답 예시**:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-18T10:30:00Z",
  "uptime_seconds": 86400,
  "version": "1.0.15",
  "korean_requirements": {
    "response_time_ms": 2100,
    "concurrent_users_supported": 15,
    "encoding": "UTF-8",
    "language_support": ["ko", "en", "ja", "zh"]
  },
  "checks": [
    {
      "name": "database",
      "status": "healthy",
      "response_time_ms": 15
    },
    {
      "name": "redis",
      "status": "healthy",
      "response_time_ms": 5
    }
  ]
}
```

#### `GET /health/detailed`

상세한 시스템 정보를 제공합니다.

**응답 예시**:
```json
{
  "nginx": {
    "status": "healthy",
    "version": "1.21.6"
  },
  "performance": {
    "request_time_avg": "< 3초",
    "korean_requirement": "만족"
  },
  "timestamp": "2025-09-18T10:30:00Z"
}
```

#### `GET /health/backend`

백엔드 서비스의 상태를 확인합니다.

#### `GET /health/full`

외부 헬스체크 스크립트를 통한 전체 검증을 실행합니다.

### 메트릭 엔드포인트

#### `GET /metrics`

Prometheus 형식의 메트릭을 제공합니다 (설정된 경우).

#### `GET /nginx_status`

Nginx 상태 정보를 제공합니다 (내부 네트워크만 접근 가능).

## 설정 파일 레퍼런스

### 환경 변수

| 변수명 | 설명 | 기본값 | 예시 |
|--------|------|--------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | 필수 | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis 연결 문자열 | 필수 | `redis://localhost:6379` |
| `JWT_SECRET` | JWT 토큰 서명 키 | 필수 | `your-secret-key` |
| `SESSION_SECRET` | 세션 서명 키 | 필수 | `your-session-secret` |
| `VALIDATION_MODE` | 검증 모드 | `full` | `health`, `smoke`, `functional`, `performance`, `full` |
| `VALIDATION_TIMEOUT` | 검증 타임아웃 (초) | `300` | `180`, `600` |
| `SKIP_VALIDATION` | 검증 건너뛰기 | `false` | `true`, `false` |
| `ROLLBACK_ON_VALIDATION_FAILURE` | 검증 실패 시 자동 롤백 | `true` | `true`, `false` |
| `SLACK_WEBHOOK_URL` | Slack 웹훅 URL | 선택사항 | `https://hooks.slack.com/...` |
| `EMAIL_SMTP_SERVER` | SMTP 서버 | 선택사항 | `smtp.gmail.com` |
| `EMAIL_FROM` | 발신자 이메일 | 선택사항 | `alerts@company.com` |
| `EMAIL_TO` | 수신자 이메일 | 선택사항 | `admin@company.com` |

### Docker Compose 설정

주요 설정 파일: `docker-compose.prod.yml`

- **네트워크**: `dot-network-prod`
- **볼륨**: PostgreSQL 데이터, Redis 데이터, 업로드 파일, 로그
- **헬스체크**: 모든 서비스에 강화된 헬스체크 설정
- **리소스 제한**: CPU 및 메모리 제한으로 안정성 확보

### Nginx 설정

주요 설정 파일: `nginx/nginx.prod.conf`

- **업스트림**: 백엔드 및 프론트엔드 로드밸런싱
- **헬스체크**: 다양한 헬스체크 엔드포인트
- **캐싱**: 정적 파일 캐싱 및 성능 최적화
- **로깅**: 성능 모니터링용 고급 로그 형식
- **Rate Limiting**: API 및 로그인 요청 제한

## 버전 정보

- **현재 버전**: 1.0.15
- **Node.js**: 18+
- **Docker**: 20.10+
- **PostgreSQL**: 14
- **Redis**: 7
- **Nginx**: 1.21+

## 라이선스

이 문서와 관련 스크립트는 DOT Platform의 일부로 제공됩니다.

## 지원 및 문의

- **이슈 리포팅**: GitHub Issues
- **문서 업데이트**: 각 배포 검증 기능 추가 시 자동 업데이트
- **성능 최적화**: 한국어 요구사항 기준 지속적 개선

---

**마지막 업데이트**: 2025-09-18
**문서 버전**: 1.0
**작성자**: DOT Platform 배포 검증 시스템