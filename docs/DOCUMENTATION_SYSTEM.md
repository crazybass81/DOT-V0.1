# 📚 DOT Platform 문서 시스템

> 일관되고 체계적인 문서화를 위한 통합 가이드

## 🏗️ 문서 구조

```
docs/
├── README.md                    # 문서 시스템 진입점
├── DOCUMENTATION_SYSTEM.md      # 이 문서 (시스템 가이드)
├── 00-overview/                 # 프로젝트 개요
│   ├── PROJECT_OVERVIEW.md      # 프로젝트 소개
│   ├── ARCHITECTURE.md          # 시스템 아키텍처
│   └── ROADMAP.md              # 개발 로드맵
│
├── 01-getting-started/          # 시작 가이드
│   ├── INSTALLATION.md          # 설치 가이드
│   ├── QUICKSTART.md           # 빠른 시작
│   └── CONFIGURATION.md        # 설정 가이드
│
├── 02-user-guides/              # 사용자 가이드
│   ├── owner/                  # 사장님 가이드
│   ├── worker/                 # 직원 가이드
│   └── seeker/                 # 구직자 가이드
│
├── 03-developer-guides/         # 개발자 가이드
│   ├── DEVELOPMENT_SETUP.md    # 개발 환경 설정
│   ├── CODING_STANDARDS.md     # 코딩 표준
│   ├── TESTING_GUIDE.md        # 테스트 가이드
│   └── CONTRIBUTION.md         # 기여 가이드
│
├── 04-api-reference/            # API 레퍼런스
│   ├── authentication/          # 인증 API
│   ├── attendance/             # 출퇴근 API
│   ├── scheduling/             # 일정 관리 API
│   └── payroll/               # 급여 관리 API
│
├── 05-component-library/        # 컴포넌트 문서
│   ├── atoms/                  # 기본 컴포넌트
│   ├── molecules/              # 복합 컴포넌트
│   └── organisms/              # 페이지 컴포넌트
│
├── 06-deployment/               # 배포 문서
│   ├── VERCEL.md              # Vercel 배포
│   ├── DOCKER.md              # Docker 배포
│   └── CI_CD.md               # CI/CD 파이프라인
│
├── 07-maintenance/              # 유지보수 문서
│   ├── TROUBLESHOOTING.md      # 문제 해결
│   ├── MONITORING.md           # 모니터링
│   └── BACKUP_RESTORE.md       # 백업/복원
│
└── 99-templates/                # 문서 템플릿
    ├── API_TEMPLATE.md          # API 문서 템플릿
    ├── COMPONENT_TEMPLATE.md    # 컴포넌트 템플릿
    └── GUIDE_TEMPLATE.md        # 가이드 템플릿
```

## 📝 문서 작성 표준

### 1. 파일 명명 규칙
- **대문자 스네이크 케이스**: `DOCUMENTATION_SYSTEM.md`
- **의미 있는 이름**: 내용을 명확히 표현
- **일관된 접두사**: 숫자로 순서 표시 (00-overview)

### 2. 문서 구조 표준

```markdown
# 제목 (이모지 + 명확한 제목)

> 한 줄 요약 설명

## 목차
- [개요](#개요)
- [상세 내용](#상세-내용)
- [예제](#예제)
- [참고사항](#참고사항)

## 개요
문서의 목적과 대상 독자 설명

## 상세 내용
### 소제목 1
내용...

### 소제목 2
내용...

## 예제
\`\`\`language
코드 예제
\`\`\`

## 참고사항
- 주의사항
- 관련 링크
- 추가 정보
```

### 3. 언어 사용 가이드
- **한국어 우선**: 사용자 문서는 한국어로 작성
- **기술 용어**: 영어 병기 (예: 인증(Authentication))
- **코드 주석**: 한국어로 작성 (프로젝트 표준)

### 4. 이모지 사용 규칙
| 용도 | 이모지 | 예시 |
|------|--------|------|
| 개요 | 📚 | 📚 문서 시스템 |
| 설정 | ⚙️ | ⚙️ 환경 설정 |
| 경고 | ⚠️ | ⚠️ 주의사항 |
| 팁 | 💡 | 💡 유용한 팁 |
| 완료 | ✅ | ✅ 설치 완료 |
| 진행중 | 🔄 | 🔄 작업 진행중 |
| 오류 | ❌ | ❌ 오류 해결 |
| 보안 | 🔐 | 🔐 보안 설정 |

## 🔄 문서 유지보수

### 버전 관리
- 모든 문서는 Git으로 버전 관리
- 중요 변경사항은 CHANGELOG 작성
- 문서 업데이트 시 날짜 기록

### 문서 검토 프로세스
1. **작성**: 템플릿 기반 초안 작성
2. **검토**: 기술적 정확성 확인
3. **개선**: 피드백 반영
4. **배포**: main 브랜치 병합

### 문서 상태 표시
```markdown
---
상태: 완료 | 작성중 | 검토필요 | 폐기예정
최종수정: 2025-09-22
작성자: 시스템
---
```

## 📋 문서 타입별 가이드

### API 문서
- **구조**: 엔드포인트, 파라미터, 응답, 예제
- **형식**: OpenAPI/Swagger 호환
- **예제**: 실제 사용 가능한 curl 명령어 포함

### 컴포넌트 문서
- **구조**: Props, 사용법, 스타일링, 접근성
- **형식**: Storybook 연동 고려
- **예제**: 실제 React 코드 포함

### 가이드 문서
- **구조**: 목표, 단계별 설명, 트러블슈팅
- **형식**: 스크린샷/다이어그램 포함
- **예제**: 실제 시나리오 기반

## 🎯 문서화 우선순위

### P0 (필수)
- README.md (프로젝트 진입점)
- API 레퍼런스
- 설치 가이드
- 배포 가이드

### P1 (중요)
- 사용자 가이드
- 개발자 가이드
- 아키텍처 문서
- 트러블슈팅

### P2 (선택)
- 컴포넌트 상세 문서
- 성능 최적화 가이드
- 마이그레이션 가이드

## 🔗 관련 도구

### 문서 생성 도구
- **JSDoc**: JavaScript 코드 문서화
- **TypeDoc**: TypeScript 코드 문서화
- **Swagger**: API 문서 자동 생성
- **Storybook**: 컴포넌트 문서화

### 문서 검증 도구
- **Markdown Lint**: 마크다운 문법 검사
- **Link Checker**: 링크 유효성 검사
- **Spell Checker**: 맞춤법 검사

## 📌 Quick Links

- [프로젝트 개요](/docs/00-overview/PROJECT_OVERVIEW.md)
- [빠른 시작 가이드](/docs/01-getting-started/QUICKSTART.md)
- [API 레퍼런스](/docs/04-api-reference/README.md)
- [문제 해결 가이드](/docs/07-maintenance/TROUBLESHOOTING.md)

---

*이 문서는 DOT Platform의 문서화 표준을 정의합니다.*
*최종 업데이트: 2025-09-22*