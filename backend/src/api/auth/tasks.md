# Auth API Implementation Tasks

**Phase 3**: Auth API (T051-T075)
**Status**: Ready to implement
**Location**: `/backend/src/api/auth/`

## 작업 개요
Auth API는 이미 구현된 auth-lib를 활용하여 REST API 엔드포인트를 제공합니다.

## 즉시 실행 가능한 작업 목록

### T051-T055: Express 기본 설정
```bash
# T051: Express 애플리케이션 설정
# File: backend/src/app.js
# - Express, helmet, cors, compression 설정
# - 미들웨어 체인 구성
# - 에러 핸들러 등록

# T052: 데이터베이스 연결 설정
# Files: backend/src/config/database.js, backend/src/config/redis.js
# - PostgreSQL 연결 풀 설정 (포트 5434)
# - Redis 클라이언트 설정 (포트 6379)

# T053: JWT 인증 미들웨어
# File: backend/src/middleware/auth.js
# - auth-lib의 verifyToken 사용
# - req.user에 사용자 정보 추가

# T054: 입력 검증 미들웨어
# File: backend/src/middleware/validation.js
# - express-validator 활용
# - 이메일, 비밀번호, 전화번호 형식 검증

# T055: 에러 처리 미들웨어
# File: backend/src/middleware/error-handler.js
# - 중앙집중식 에러 처리
# - 로깅 및 응답 포맷 통일
```

### T056-T060: 계약 테스트 (RED Phase)
```bash
# T056: 회원가입 API 테스트
# File: backend/tests/contract/auth/register.test.js
# - POST /api/v1/auth/register
# - 성공, 중복 이메일, 유효성 검증 테스트

# T057: 로그인 API 테스트
# File: backend/tests/contract/auth/login.test.js
# - POST /api/v1/auth/login
# - 성공, 실패, 계정 상태 테스트

# T058: 로그아웃 API 테스트
# File: backend/tests/contract/auth/logout.test.js
# - POST /api/v1/auth/logout
# - 세션 종료 확인

# T059: 토큰 갱신 API 테스트
# File: backend/tests/contract/auth/refresh.test.js
# - POST /api/v1/auth/refresh
# - 토큰 갱신 성공/실패

# T060: 현재 사용자 API 테스트
# File: backend/tests/contract/auth/me.test.js
# - GET /api/v1/auth/me
# - 인증된 사용자 정보 조회
```

### T061-T065: 서비스 구현 (GREEN Phase)
```bash
# T061: 회원가입 서비스
# File: backend/src/services/auth-service.js
# Method: register(email, password, name, phone)
# - auth-lib의 hashPassword 사용
# - users 테이블에 저장
# - user_roles에 Seeker 역할 자동 추가

# T062: 로그인 서비스
# File: backend/src/services/auth-service.js
# Method: login(email, password)
# - auth-lib의 verifyPassword 사용
# - generateToken으로 JWT 생성
# - createSession으로 Redis 세션 생성

# T063: 로그아웃 서비스
# File: backend/src/services/auth-service.js
# Method: logout(sessionId)
# - deleteSession으로 Redis 세션 삭제

# T064: 토큰 갱신 서비스
# File: backend/src/services/auth-service.js
# Method: refreshToken(refreshToken)
# - refreshAccessToken 사용
# - 새 액세스 토큰 발급

# T065: 사용자 조회 서비스
# File: backend/src/services/auth-service.js
# Method: getCurrentUser(userId)
# - users와 user_roles JOIN 쿼리
```

### T066-T070: 라우트 구현
```bash
# T066: 회원가입 라우트
# File: backend/src/routes/auth.js
# Route: POST /api/v1/auth/register
# - validation 미들웨어 적용
# - auth-service.register 호출

# T067: 로그인 라우트
# File: backend/src/routes/auth.js
# Route: POST /api/v1/auth/login
# - auth-service.login 호출
# - 토큰과 역할 반환

# T068: 로그아웃 라우트
# File: backend/src/routes/auth.js
# Route: POST /api/v1/auth/logout
# - auth 미들웨어 필수
# - auth-service.logout 호출

# T069: 토큰 갱신 라우트
# File: backend/src/routes/auth.js
# Route: POST /api/v1/auth/refresh
# - auth-service.refreshToken 호출

# T070: 현재 사용자 라우트
# File: backend/src/routes/auth.js
# Route: GET /api/v1/auth/me
# - auth 미들웨어 필수
# - auth-service.getCurrentUser 호출
```

### T071-T075: 통합 테스트
```bash
# T071: 전체 인증 플로우 테스트
# File: backend/tests/integration/auth-flow.test.js
# - 회원가입 → 로그인 → API 호출 → 로그아웃

# T072: 토큰 생명주기 테스트
# File: backend/tests/integration/token-lifecycle.test.js
# - 토큰 만료 → 갱신 → 재사용

# T073: 다중 세션 테스트
# File: backend/tests/integration/multi-session.test.js
# - 여러 기기 로그인 → 개별 로그아웃

# T074: 비밀번호 재설정 테스트
# File: backend/tests/integration/password-reset.test.js
# - 재설정 요청 → 토큰 검증 → 변경

# T075: 역할 전환 테스트
# File: backend/tests/integration/role-switch.test.js
# - 다중 역할 → 전환 → 권한 확인
```

## 병렬 실행 가능 그룹

### Group 1 (기본 설정): T051, T052, T054, T055
### Group 2 (계약 테스트): T057, T058, T059, T060
### Group 3 (서비스 메서드): T063, T064, T065
### Group 4 (라우트): T068, T069, T070
### Group 5 (통합 테스트): T072, T073, T074, T075

## 주요 의존성
- auth-lib: `/backend/src/lib/auth-lib/` (이미 구현됨)
- 데이터베이스 테이블: users, user_roles, businesses (이미 생성됨)
- Redis: 세션 관리용 (Docker 컨테이너 실행 중)
- PostgreSQL: 포트 5434 (Docker 컨테이너 실행 중)