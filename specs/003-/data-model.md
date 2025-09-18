# Data Model: Deployment Validation Entities

## Overview
배포 검증 시스템에서 사용되는 데이터 엔티티와 상태 모델 정의.

## Core Entities

### 1. DeploymentStatus
배포 상태와 전체적인 시스템 건강도를 추적하는 엔티티.

**Fields**:
- `deployment_id` (string): 고유 배포 식별자 (UUID)
- `version` (string): 배포된 애플리케이션 버전 (MAJOR.MINOR.BUILD)
- `timestamp` (datetime): 배포 시작 시간 (ISO 8601)
- `status` (enum): 배포 상태
  - `STARTING` - 배포 시작됨
  - `HEALTH_CHECK` - 헬스체크 진행 중
  - `VALIDATING` - 기능 검증 진행 중
  - `HEALTHY` - 모든 검증 통과
  - `DEGRADED` - 일부 서비스 이슈
  - `FAILED` - 배포 실패
- `services` (object): 서비스별 상태 맵
  - `frontend` (ServiceStatus)
  - `backend` (ServiceStatus)
  - `database` (ServiceStatus)
  - `redis` (ServiceStatus)
  - `nginx` (ServiceStatus)
- `validation_summary` (ValidationSummary): 검증 결과 요약
- `performance_metrics` (PerformanceMetrics): 성능 지표
- `created_at` (datetime): 레코드 생성 시간
- `updated_at` (datetime): 마지막 업데이트 시간

**State Transitions**:
```
STARTING → HEALTH_CHECK → VALIDATING → HEALTHY
                                   ↘ DEGRADED
        ↘ FAILED ← HEALTH_CHECK ← VALIDATING
```

### 2. ServiceStatus
개별 서비스(frontend, backend, database 등)의 상태 정보.

**Fields**:
- `service_name` (string): 서비스 이름 (frontend, backend, database, redis, nginx)
- `status` (enum): 서비스 상태
  - `HEALTHY` - 정상 동작
  - `DEGRADED` - 성능 저하
  - `UNHEALTHY` - 서비스 장애
  - `UNKNOWN` - 상태 불명
- `health_checks` (array): 헬스체크 결과 목록
- `last_health_check` (datetime): 마지막 헬스체크 시간
- `response_time_ms` (number): 평균 응답 시간 (밀리초)
- `error_rate` (number): 오류율 (0.0 - 1.0)
- `uptime_seconds` (number): 서비스 가동 시간 (초)
- `memory_usage_mb` (number): 메모리 사용량 (MB)
- `cpu_usage_percent` (number): CPU 사용률 (%)

### 3. HealthCheckResult
개별 헬스체크 수행 결과.

**Fields**:
- `check_id` (string): 헬스체크 고유 식별자
- `service_name` (string): 대상 서비스 이름
- `endpoint` (string): 헬스체크 엔드포인트 URL
- `method` (string): HTTP 메서드 (GET, POST)
- `status` (enum): 체크 결과
  - `PASS` - 성공
  - `FAIL` - 실패
  - `TIMEOUT` - 시간 초과
  - `ERROR` - 오류 발생
- `response_code` (number): HTTP 응답 코드
- `response_time_ms` (number): 응답 시간 (밀리초)
- `response_body` (string): 응답 본문 (선택적)
- `error_message` (string): 오류 메시지 (실패 시)
- `timestamp` (datetime): 헬스체크 수행 시간
- `checks` (array): 세부 의존성 체크 결과
  - `name` (string): 체크 이름 (database, redis, external_api)
  - `status` (string): 체크 상태 (healthy, unhealthy)
  - `details` (object): 추가 세부 정보

### 4. ValidationResult
기능 검증 테스트 수행 결과.

**Fields**:
- `validation_id` (string): 검증 실행 고유 식별자
- `test_suite` (string): 테스트 스위트 이름 (e2e, contract, performance)
- `test_name` (string): 개별 테스트 이름
- `category` (enum): 테스트 카테고리
  - `HEALTH` - 헬스체크
  - `FUNCTIONAL` - 기능 테스트
  - `PERFORMANCE` - 성능 테스트
  - `SECURITY` - 보안 테스트
  - `ACCESSIBILITY` - 접근성 테스트
- `status` (enum): 검증 결과
  - `PASS` - 통과
  - `FAIL` - 실패
  - `SKIP` - 건너뜀
  - `TIMEOUT` - 시간 초과
- `execution_time_ms` (number): 실행 시간 (밀리초)
- `assertion_results` (array): 개별 assertion 결과
  - `assertion` (string): assertion 설명
  - `expected` (any): 예상 값
  - `actual` (any): 실제 값
  - `passed` (boolean): 통과 여부
- `error_details` (object): 오류 세부 정보 (실패 시)
  - `message` (string): 오류 메시지
  - `stack_trace` (string): 스택 트레이스
  - `screenshot_url` (string): 스크린샷 URL (E2E 테스트)
- `metrics` (object): 성능 지표 (성능 테스트)
- `timestamp` (datetime): 검증 실행 시간

### 5. SystemMetrics
시스템 전체 성능 지표.

**Fields**:
- `metrics_id` (string): 메트릭 수집 고유 식별자
- `timestamp` (datetime): 메트릭 수집 시간
- `response_times` (object): 응답 시간 분포
  - `p50_ms` (number): 50th 백분위수 (밀리초)
  - `p95_ms` (number): 95th 백분위수 (밀리초)
  - `p99_ms` (number): 99th 백분위수 (밀리초)
  - `max_ms` (number): 최대 응답 시간 (밀리초)
- `concurrent_users` (number): 현재 동시 사용자 수
- `requests_per_second` (number): 초당 요청 수
- `error_rate` (number): 전체 오류율 (0.0 - 1.0)
- `page_load_times` (object): 페이지 로딩 시간
  - `first_contentful_paint_ms` (number): FCP (밀리초)
  - `time_to_interactive_ms` (number): TTI (밀리초)
  - `largest_contentful_paint_ms` (number): LCP (밀리초)
- `resource_usage` (object): 리소스 사용량
  - `total_memory_mb` (number): 전체 메모리 사용량 (MB)
  - `total_cpu_percent` (number): 전체 CPU 사용률 (%)
  - `disk_usage_percent` (number): 디스크 사용률 (%)
  - `network_io_mbps` (number): 네트워크 I/O (Mbps)

### 6. ValidationSummary
전체 검증 결과 요약 정보.

**Fields**:
- `summary_id` (string): 요약 고유 식별자
- `deployment_id` (string): 관련 배포 식별자
- `total_tests` (number): 전체 테스트 수
- `passed_tests` (number): 통과한 테스트 수
- `failed_tests` (number): 실패한 테스트 수
- `skipped_tests` (number): 건너뛴 테스트 수
- `success_rate` (number): 성공률 (0.0 - 1.0)
- `execution_time_ms` (number): 전체 실행 시간 (밀리초)
- `categories` (object): 카테고리별 결과
  - `health` (CategoryResult)
  - `functional` (CategoryResult)
  - `performance` (CategoryResult)
  - `security` (CategoryResult)
  - `accessibility` (CategoryResult)
- `critical_failures` (array): 중요 실패 목록
- `performance_requirements_met` (boolean): 성능 요구사항 충족 여부
- `deployment_recommendation` (enum): 배포 권고사항
  - `PROCEED` - 배포 진행 권장
  - `PROCEED_WITH_CAUTION` - 주의하여 진행
  - `ROLLBACK` - 롤백 권장
  - `INVESTIGATE` - 조사 필요

## Validation Rules

### DeploymentStatus
- `deployment_id`는 UUID v4 형식이어야 함
- `version`은 Semantic Versioning (MAJOR.MINOR.BUILD) 형식
- `timestamp`는 UTC 기준 ISO 8601 형식
- `services` 객체는 모든 필수 서비스를 포함해야 함

### HealthCheckResult
- `response_time_ms`는 0 이상이어야 함
- `response_code`는 유효한 HTTP 상태 코드여야 함
- `status`가 FAIL인 경우 `error_message` 필수

### ValidationResult
- `execution_time_ms`는 0 이상이어야 함
- `status`가 FAIL인 경우 `error_details` 필수
- Performance 카테고리인 경우 `metrics` 필수

### SystemMetrics
- 모든 시간 관련 필드는 0 이상이어야 함
- 백분율 필드는 0.0-1.0 범위 (error_rate) 또는 0-100 범위 (cpu_percent)
- `p50_ms ≤ p95_ms ≤ p99_ms ≤ max_ms` 순서 유지

## Relationships

```
DeploymentStatus (1) → (N) ValidationResult
DeploymentStatus (1) → (N) HealthCheckResult
DeploymentStatus (1) → (N) SystemMetrics
DeploymentStatus (1) → (1) ValidationSummary
ServiceStatus (1) → (N) HealthCheckResult
```

## JSON Schema Examples

### DeploymentStatus Example
```json
{
  "deployment_id": "550e8400-e29b-41d4-a716-446655440000",
  "version": "1.0.15",
  "timestamp": "2025-09-18T10:30:00Z",
  "status": "HEALTHY",
  "services": {
    "frontend": { "status": "HEALTHY", "response_time_ms": 120 },
    "backend": { "status": "HEALTHY", "response_time_ms": 85 },
    "database": { "status": "HEALTHY", "response_time_ms": 15 },
    "redis": { "status": "HEALTHY", "response_time_ms": 5 },
    "nginx": { "status": "HEALTHY", "response_time_ms": 8 }
  }
}
```

### ValidationResult Example
```json
{
  "validation_id": "test-run-20250918-103015",
  "test_suite": "e2e-smoke",
  "test_name": "user-login-flow",
  "category": "FUNCTIONAL",
  "status": "PASS",
  "execution_time_ms": 2450,
  "assertion_results": [
    {
      "assertion": "Login page loads within 3 seconds",
      "expected": "< 3000ms",
      "actual": "2100ms",
      "passed": true
    }
  ]
}
```