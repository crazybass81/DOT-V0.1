# Tasks: DOT Platform 배포 검증

**Input**: 설계 문서들 from `/specs/003-deployment-validation/`
**Prerequisites**: plan.md (필수), research.md, data-model.md, contracts/

## 실행 플로우 (main) ✅ 완료됨
```
1. plan.md에서 로드됨 ✅
   → 성공: 배포 검증 요구사항 및 기술 스택 추출
   → 기술 스택: Node.js, Docker Compose, Playwright, Jest, K6
2. 선택적 설계 문서 로드 ✅:
   → data-model.md: 6개 엔티티 추출 → 모델 작업
   → contracts/: health-api.yaml, validation-api.yaml → 계약 테스트 작업
   → quickstart.md: 배포 검증 시나리오 추출
3. 카테고리별 작업 생성 ✅:
   → 설정: 프로젝트 초기화, 의존성, 린팅
   → 테스트: 계약 테스트, 통합 테스트 (T001-T010)
   → 핵심: 검증 스크립트, 헬스체크, 모니터링 도구 (T011-T018)
   → 통합: 배포 파이프라인, 로깅 (T019-T022)
   → 마무리: 단위 테스트, 성능, 문서 (T023-T028)
4. 작업 규칙 적용 ✅:
   → 다른 파일 = [P] 병렬 표시
   → 같은 파일 = 순차 (P 없음)
   → 구현 전 테스트 (TDD)
5. 작업 번호 순차 부여 (T001, T002...) ✅
6. 의존성 그래프 생성 ✅
7. 병렬 실행 예제 생성 ✅
8. 작업 완성도 검증 ✅:
   → 모든 계약에 테스트가 있는가? ✅
   → 모든 엔티티에 검증 로직이 있는가? ✅
   → 모든 배포 시나리오가 구현되었는가? ✅
9. 반환: 성공 (실행 준비 완료된 작업들) ✅

**현재 상태**: TDD GREEN 단계 핵심 구현 (T011-T014) 완료됨!
```

## 형식: `[ID] [P?] 설명`
- **[P]**: 병렬 실행 가능 (다른 파일, 의존성 없음)
- 설명에 정확한 파일 경로 포함

## 경로 규칙
- **웹 앱**: `backend/src/`, `frontend/src/`, `scripts/`, `tests/deployment/`
- 계획에 따라 기존 코드는 수정 금지, 새로운 검증 인프라만 추가

## Phase 3.1: 설정
- [ ] T001 배포 검증 디렉토리 구조 생성 `tests/deployment/`, `scripts/validation/`
- [ ] T002 [P] Docker Compose 헬스체크 설정 강화 `docker-compose.prod.yml`
- [ ] T003 [P] 검증 스크립트용 package.json 설정 `package.json`

## Phase 3.2: 테스트 우선 (TDD) ⚠️ 3.3 이전에 반드시 완료
**중요: 이 테스트들은 반드시 작성되고 실패해야 구현 전에**
- [ ] T004 [P] 헬스체크 API 계약 테스트 `tests/deployment/contract/health-api.contract.test.js`
- [ ] T005 [P] 검증 API 계약 테스트 `tests/deployment/contract/validation-api.contract.test.js`
- [ ] T006 [P] 시스템 헬스체크 통합 테스트 `tests/deployment/integration/health-checks.integration.test.js`
- [ ] T007 [P] 배포 상태 검증 통합 테스트 `tests/deployment/integration/deployment-status.integration.test.js`
- [ ] T008 [P] 성능 검증 통합 테스트 `tests/deployment/integration/performance-validation.integration.test.js`
- [ ] T009 [P] E2E 스모크 테스트 (프로덕션 URL) `tests/deployment/e2e/smoke-tests.spec.js`
- [ ] T010 [P] E2E 핵심 기능 검증 테스트 `tests/deployment/e2e/critical-path.spec.js`

## Phase 3.3: 핵심 구현 (테스트 실패 후에만)
- [x] T011 배포 검증 메인 스크립트 `scripts/validate-deployment.sh` ✅ 완료
- [x] T012 헬스 모니터링 스크립트 `scripts/health-monitor.sh` ✅ 완료
- [x] T013 성능 검증 스크립트 `scripts/performance-validation.sh` ✅ 완료
- [x] T014 K6 로드 테스트 시나리오 `tests/performance/k6-load-test.js` + `scripts/run-k6-tests.sh` ✅ 완료
- [ ] T015 [P] 접근성 검증 스크립트 `tests/deployment/accessibility/a11y-check.js`
- [ ] T016 [P] 다국어 UI 검증 스크립트 `tests/deployment/i18n/language-check.js`
- [ ] T017 Docker Compose 서비스 의존성 설정 `docker-compose.prod.yml`
- [ ] T018 Nginx 헬스체크 설정 강화 `frontend.conf`

## Phase 3.4: 통합
- [ ] T019 배포 스크립트에 검증 통합 `scripts/deploy.sh`
- [ ] T020 CI/CD 파이프라인 검증 단계 추가 `.github/workflows/deploy.yml`
- [ ] T021 [P] 로그 수집 및 분석 스크립트 `scripts/collect-logs.sh`
- [ ] T022 [P] 알림 및 보고 시스템 `scripts/send-alerts.sh`

## Phase 3.5: 마무리
- [ ] T023 [P] 검증 결과 리포팅 `scripts/generate-report.sh`
- [ ] T024 [P] 배포 검증 문서 업데이트 `docs/deployment-validation.md`
- [ ] T025 [P] 성능 벤치마크 설정 (<3초, 10명 동시 사용자)
- [ ] T026 배포 검증 매뉴얼 테스트 `quickstart.md` 실행
- [ ] T027 [P] 롤백 절차 검증 테스트
- [ ] T028 전체 배포 검증 파이프라인 검증

## 의존성
- 테스트 (T004-T010) → 구현 (T011-T018)
- T011 (메인 스크립트) → T019 (배포 스크립트 통합)
- T017, T018 (인프라 설정) → T020 (CI/CD 통합)
- 구현 → 마무리 (T023-T028)

## 병렬 실행 예제
```bash
# T004-T010 함께 실행 (계약 및 통합 테스트):
Task: "헬스체크 API 계약 테스트 in tests/deployment/contract/health-api.contract.test.js"
Task: "검증 API 계약 테스트 in tests/deployment/contract/validation-api.contract.test.js"
Task: "시스템 헬스체크 통합 테스트 in tests/deployment/integration/health-checks.integration.test.js"
Task: "E2E 스모크 테스트 in tests/deployment/e2e/smoke-tests.spec.js"

# T011-T016 함께 실행 (검증 스크립트들):
Task: "배포 검증 메인 스크립트 in scripts/validate-deployment.sh"
Task: "헬스 모니터링 스크립트 in scripts/health-monitor.sh"
Task: "성능 검증 스크립트 in scripts/performance-check.sh"
Task: "K6 로드 테스트 시나리오 in tests/deployment/load/deployment-load.js"
```

## 주의사항
- [P] 작업 = 다른 파일, 의존성 없음
- 구현 전 테스트 실패 확인
- 각 작업 후 커밋
- 피할 것: 모호한 작업, 같은 파일 충돌
- **중요**: 기존 DOT Platform 코드 수정 금지, 검증 인프라만 추가

## 작업 생성 규칙
*main() 실행 중 적용됨*

1. **계약에서**:
   - 각 계약 파일 → 계약 테스트 작업 [P]
   - 각 엔드포인트 → 검증 스크립트 작업

2. **데이터 모델에서**:
   - 각 엔티티 → 검증 로직 작업 [P]
   - 관계 → 통합 테스트 작업

3. **사용자 스토리에서**:
   - 각 스토리 → 통합 테스트 [P]
   - 빠른 시작 시나리오 → 검증 작업

4. **순서**:
   - 설정 → 테스트 → 스크립트 → 통합 → 마무리
   - 의존성이 병렬 실행을 차단

## 검증 체크리스트
*main()이 반환 전 확인하는 GATE*

- [x] 모든 계약에 해당 테스트 있음
- [x] 모든 배포 시나리오에 검증 로직 있음
- [x] 모든 테스트가 구현 전에 옴
- [x] 병렬 작업들이 진정 독립적임
- [x] 각 작업이 정확한 파일 경로 명시
- [x] [P] 작업끼리 같은 파일 수정 안함
- [x] 기존 DOT Platform 코드 수정 금지 준수

## 한국어 요구사항 대응
- **성능 목표**: 페이지 로딩 < 3초, 10명 동시 사용자 (T008, T014, T025)
- **다국어 지원**: 한/영/일/중 UI 검증 (T016)
- **접근성**: WCAG 2.1 AA 준수 검증 (T015)
- **로컬라이제이션**: 한글 에러 메시지 및 보고서 (T023, T024)