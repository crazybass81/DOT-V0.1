# Implementation Plan: DOT Platform V0.1

**Branch**: `002-` | **Date**: 2025-09-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → 성공: 사양 로드 완료
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → 완료: 모든 요구사항이 명확화됨
   → 프로젝트 타입 감지: web (frontend + backend)
   → 구조 결정: Option 2 선택
3. Evaluate Constitution Check section below
   → 주의: Mock 사용 금지, 실제 기능 구현
   → 진행: TDD 원칙 엄격 적용
   → Progress Tracking 업데이트: 초기 Constitution Check
4. Execute Phase 0 → research.md
   → 기존 DOT 코드 분석 및 재사용 가능 자산 식별
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
6. Re-evaluate Constitution Check section
   → 검증: 설계 준수 확인
   → Progress Tracking 업데이트: 설계 후 Constitution Check
7. Plan Phase 2 → 작업 생성 접근법 설명 (tasks.md 생성하지 않음)
8. STOP - /tasks 명령 준비 완료
```

## Summary
DOT 플랫폼은 식음료 사업을 위한 종합 운영 관리 시스템으로, 근태관리, 스케줄링, 급여관리를 포함합니다. 기존 DOT 프로젝트에서 검증된 GPS 계산, QR 생성/검증, RLS 정책 코드를 재사용하여 안정성을 확보하면서도 복잡도를 최소화합니다.

## Technical Context
**Language/Version**: Node.js 20 LTS (백엔드), React 18 (프론트엔드)
**Primary Dependencies**: Express.js, PostgreSQL, React, Material-UI, bcrypt, jsonwebtoken
**Storage**: PostgreSQL 15 (메인 DB with PostGIS), Redis (세션/캐시)
**Testing**: Jest (단위/통합), Supertest (API), React Testing Library, Playwright (E2E)
**Target Platform**: Linux 서버 (백엔드), 웹 브라우저 (프론트엔드)
**Project Type**: web - 웹 애플리케이션
**Performance Goals**: 동시 접속 1,000명, API 응답 <200ms (p95)
**Constraints**: GPS 정확도 50m 이내, 파일 크기 10MB 제한, 데이터 보관 3년
**Scale/Scope**: MVP 10개 사업장, 사업장당 50명 근로자

## Constitution Check
*GATE: Phase 0 연구 전 필수 통과. Phase 1 설계 후 재확인.*

**Simplicity**:
- Projects: 3개 (backend, frontend, shared)
- 프레임워크 직접 사용? 예 (Express, React 직접 사용, 래퍼 없음)
- 단일 데이터 모델? 예 (DB 엔티티를 직접 사용, DTO 없음)
- 불필요한 패턴 회피? 예 (Repository 패턴 없음, 직접 SQL 사용)

**Architecture**:
- 모든 기능을 라이브러리로? 예
- 라이브러리 목록:
  - `auth-lib`: 인증/인가 처리 (JWT, bcrypt)
  - `attendance-lib`: 근태 관리 로직 (GPS 검증, QR 처리)
  - `schedule-lib`: 스케줄 관리
  - `payroll-lib`: 급여 계산
  - `document-lib`: 문서 관리 (10MB 제한)
  - `notification-lib`: 이메일 알림
- 각 라이브러리 CLI:
  - 모든 라이브러리: `--help`, `--version`, `--format json|text`
  - 예: `node auth-lib --verify-token <token>`
- 라이브러리 문서: llms.txt 형식 계획됨

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor 사이클 적용? 예 (테스트 먼저 작성, 실패 확인)
- Git 커밋에 테스트가 구현보다 먼저? 예
- 순서: Contract→Integration→E2E→Unit 엄격 준수? 예
- 실제 의존성 사용? 예 (실제 PostgreSQL, Redis, Mock 사용 금지)
- 통합 테스트: 새 라이브러리, 계약 변경, 공유 스키마? 예
- 금지: 테스트 전 구현, RED 단계 건너뛰기

**Observability**:
- 구조화된 로깅 포함? 예 (winston 사용)
- 프론트엔드 로그 → 백엔드? 예 (통합 스트림)
- 에러 컨텍스트 충분? 예

**Versioning**:
- 버전 번호 할당? 예 (0.1.0부터 시작)
- BUILD 증가? 예 (모든 변경마다)
- Breaking changes 처리? 예 (병렬 테스트, 마이그레이션)

## Project Structure

### Documentation (this feature)
```
specs/002-/
├── spec.md              # 기능 사양
├── plan.md              # 이 파일 (/plan 명령 출력)
├── research.md          # Phase 0 출력 - 기존 DOT 코드 분석
├── data-model.md        # Phase 1 출력 - 데이터 모델
├── quickstart.md        # Phase 1 출력 - 빠른 시작 가이드
├── contracts/           # Phase 1 출력 - API 계약
│   ├── auth-api.yaml    # 인증 API 계약
│   ├── attendance-api.yaml # 근태 API 계약
│   └── schedule-api.yaml # 스케줄 API 계약
└── tasks.md             # Phase 2 출력 (/tasks 명령 - /plan에서 생성 안 함)
```

### Source Code (repository root)
```
# Option 2: Web application
backend/
├── src/
│   ├── models/          # DB 모델 (User, Business, Attendance 등)
│   ├── services/        # 비즈니스 로직
│   ├── api/            # REST API 엔드포인트
│   └── lib/            # 재사용 라이브러리
│       ├── auth-lib/
│       ├── attendance-lib/
│       ├── schedule-lib/
│       ├── payroll-lib/
│       ├── document-lib/
│       └── notification-lib/
└── tests/
    ├── contract/       # API 계약 테스트
    ├── integration/    # 통합 테스트
    └── unit/          # 단위 테스트

frontend/
├── src/
│   ├── components/     # React 컴포넌트
│   ├── pages/         # 페이지 컴포넌트
│   ├── services/      # API 클라이언트
│   └── utils/         # 유틸리티
└── tests/
    ├── integration/   # 통합 테스트
    └── e2e/          # E2E 테스트 (Playwright)

shared/
├── types/            # TypeScript 타입 정의
├── constants/        # 공유 상수
└── contracts/        # API 계약 (OpenAPI)
```

**Structure Decision**: Option 2 - Web application (frontend + backend 분리)

## Phase 0: Outline & Research

### 연구 완료 항목:
1. **기존 DOT 코드 재사용 분석**
   - GPS 계산: `location-verification.ts`의 Haversine 공식
   - QR 생성/검증: `qr-verification.ts`의 HMAC 서명 방식
   - RLS 정책: `enhanced-rls-policies.sql`의 보안 함수
   - 인증 패턴: NestJS `auth.service.ts`의 bcrypt/JWT 구현

2. **Node.js/Express 모범 사례**
   - 미들웨어 구성: helmet, cors, rate-limiting
   - 에러 처리: 중앙집중식 에러 핸들러
   - 보안: JWT 토큰 관리, 환경 변수 사용

3. **PostgreSQL 최적화**
   - PostGIS 활용한 위치 쿼리
   - Row Level Security 구현
   - 인덱스 전략: 복합 인덱스 활용

4. **React 최적화**
   - 코드 스플리팅
   - 상태 관리: Context API + useReducer
   - 성능: React.memo, useMemo, useCallback

**Output**: research.md 생성 완료

## Phase 1: Design & Contracts

### 1. 데이터 모델 추출 → `data-model.md`:
핵심 엔티티:
- User: 사용자 정보, 인증
- Business: 사업장 정보, GPS 위치
- UserRole: 사용자-사업장-역할 매핑
- Attendance: 출퇴근 기록, GPS 검증
- Schedule: 근무 스케줄
- ScheduleAssignment: 스케줄 할당
- Document: 문서 저장 (10MB 제한)
- PayStatement: 급여 명세서

### 2. API 계약 생성 → `/contracts/`:
- 인증 API: 로그인, 로그아웃, 토큰 갱신, 역할 전환
- 근태 API: 체크인/아웃, 휴게, 외근, GPS 검증, 실시간 조회
- 스케줄 API: 생성, 수정, 조회, 근무 요청/승인
- 급여 API: 계산, 명세서 생성, 이력 조회
- 문서 API: 업로드(10MB), 다운로드, 검색
- 알림 API: 이메일 발송

### 3. 계약 테스트 생성:
각 엔드포인트에 대한 실패하는 테스트 작성 (RED 단계)

### 4. 통합 테스트 시나리오:
- Owner 전체 플로우 테스트
- Worker 출퇴근 플로우 테스트
- Seeker → Worker 역할 전환 테스트

### 5. CLAUDE.md 업데이트:
프로젝트별 기술 스택 및 재사용 코드 정보 추가

**Output**: data-model.md, /contracts/*, 실패 테스트, quickstart.md, CLAUDE.md

## Phase 2: Task Planning Approach
*이 섹션은 /tasks 명령이 수행할 작업을 설명 - /plan 중에는 실행하지 않음*

**작업 생성 전략**:
- 기반: `.specify/templates/tasks-template.md`
- Phase 1 설계 문서에서 작업 생성
- 각 계약 → 계약 테스트 작업 [P]
- 각 엔티티 → 모델 생성 작업 [P]
- 각 사용자 스토리 → 통합 테스트 작업
- 기존 DOT 코드 이식 → 별도 작업으로 명시

**순서 전략**:
- TDD 순서: 테스트가 구현보다 먼저
- 의존성 순서: 모델 → 서비스 → API → UI
- [P] 표시: 병렬 실행 가능 (독립 파일)

**예상 출력**: tasks.md에 40-50개의 번호가 매겨진 순서화된 작업

**중요**: 이 단계는 /tasks 명령이 실행, /plan이 아님

## Phase 3+: Future Implementation
*이 단계들은 /plan 명령 범위 외*

**Phase 3**: 작업 실행 (/tasks 명령이 tasks.md 생성)
**Phase 4**: 구현 (constitutional 원칙에 따라 tasks.md 실행)
**Phase 5**: 검증 (테스트 실행, quickstart.md 실행, 성능 검증)

## Complexity Tracking
*Constitution Check 위반이 정당화되어야 하는 경우에만 작성*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 없음 | - | - |

## Progress Tracking
*실행 플로우 중 이 체크리스트 업데이트*

**Phase Status**:
- [x] Phase 0: 연구 완료 (/plan 명령) - 기존 DOT 코드 분석 ✅
- [x] Phase 1: 설계 완료 (/plan 명령) ✅
- [x] Phase 2: 작업 계획 완료 (/plan 명령 - 접근법만 설명) ✅
- [ ] Phase 3: 작업 생성 (/tasks 명령)
- [ ] Phase 4: 구현 완료
- [ ] Phase 5: 검증 통과

**Gate Status**:
- [x] 초기 Constitution Check: 통과
- [x] 설계 후 Constitution Check: 통과
- [x] 모든 NEEDS CLARIFICATION 해결
- [x] 복잡도 편차 문서화 (없음)

---
*Based on Constitution v0.1.0 - See `/memory/constitution.md`*
*한글 설명 규칙 준수, Mock 사용 금지, 단순화 금지, 테스트를 위한 기능 희생 금지*