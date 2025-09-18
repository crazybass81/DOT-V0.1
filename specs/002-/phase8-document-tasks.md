# Phase 8: 문서 관리 시스템 (T211-T230)

**Feature**: DOT Platform Document Management
**Branch**: `002-`
**Priority**: Phase 8
**Dependencies**: Phase 1-7 완료

## Overview
문서 관리 시스템 구현 - 파일 업로드, 다운로드, 메타데이터 관리

## 작업 목록

### document-lib 기본 구조 설정 (T211-T215) [P]
병렬 실행 가능 - 독립적인 파일 생성

```bash
# Task 에이전트를 사용하여 병렬 실행
task --delegate folders \
  "T211: Create /home/ec2-user/DOT-V0.1/backend/src/lib/document-lib/ directory structure" \
  "T212: Create document-lib/package.json with multer and file-type dependencies" \
  "T213: Create document-lib/cli.js with basic command structure" \
  "T214: Create document-lib/index.js with main exports" \
  "T215: Implement document-lib CLI commands (--upload, --download, --validate)"
```

**T211**: `backend/src/lib/document-lib/` 디렉토리 구조 생성
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/lib/document-lib/`
- 하위 디렉토리: src/, tests/, storage/
- 한글 주석 필수

**T212**: `document-lib/package.json` 생성
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/lib/document-lib/package.json`
- 의존성: multer, file-type, mime-types, sharp (이미지 리사이징)
- 스크립트: test, lint

**T213**: `document-lib/cli.js` 생성 - CLI 인터페이스
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/lib/document-lib/cli.js`
- 기본 명령어 구조: --help, --version
- 한글 주석으로 명령어 설명

**T214**: `document-lib/index.js` 생성 - 메인 export
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/lib/document-lib/index.js`
- 모듈 export: uploadFile, downloadFile, validateFile, deleteFile

**T215**: `document-lib/cli.js` 구현 - 기본 명령어
- 명령어: --upload, --download, --validate, --delete
- JSON/text 출력 포맷 지원
- 한글 에러 메시지

### Document 테이블 생성 (T216-T220)
순차 실행 필요 - 테이블 생성 후 인덱스와 RLS 정책

**T216**: `documents` 테이블 생성 테스트 작성 (RED)
- 파일: `/home/ec2-user/DOT-V0.1/backend/tests/integration/documents.test.js`
- 테스트: 테이블 존재 확인, 컬럼 검증
- TDD: 실패하는 테스트 먼저 작성

**T217**: `documents` 테이블 생성 마이그레이션 구현
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/db/migrations/010_create_documents_table.sql`
- 컬럼: data-model.md의 Document 엔티티 참조
- 파일 크기 제한: CHECK (file_size <= 10485760)
- 만료일: expires_at DEFAULT (NOW() + INTERVAL '3 years')

**T218**: `documents` 테이블 인덱스 추가
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/db/migrations/011_add_documents_indexes.sql`
- 인덱스: owner_id, business_id, category, expires_at
- 복합 인덱스: (business_id, category)

**T219**: `documents` 테이블 RLS 정책 테스트 작성 (RED)
- 파일: `/home/ec2-user/DOT-V0.1/backend/tests/integration/documents-rls.test.js`
- 테스트: 소유자만 읽기/쓰기, 공개 문서는 모두 읽기
- 실제 PostgreSQL 사용 (no mocks)

**T220**: `documents` 테이블 RLS 정책 구현
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/db/migrations/012_add_documents_rls_policies.sql`
- 정책: owner_can_all, public_can_read, business_members_can_read
- app.current_user_id 사용

### 파일 업로드/다운로드 구현 (T221-T225) [P]
병렬 가능 - 독립적인 기능 구현

```bash
# 업로드/다운로드 병렬 구현
task --delegate files \
  "T221-T222: Implement file upload with 10MB limit" \
  "T223-T224: Implement file download with access control" \
  "T225: Implement file validation (type, size, virus scan)"
```

**T221**: `document-lib/upload.test.js` 작성 - 업로드 테스트 (RED)
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/lib/document-lib/tests/upload.test.js`
- 테스트: 10MB 제한, 허용 확장자, 메타데이터 저장
- 실제 파일시스템 사용

**T222**: `document-lib/upload.js` 구현 - 10MB 제한 업로드 (GREEN)
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/lib/document-lib/src/upload.js`
- multer 설정: limits: { fileSize: 10485760 }
- 저장 경로: storage/documents/{year}/{month}/{uuid}-{filename}
- 메타데이터 DB 저장

**T223**: `document-lib/download.test.js` 작성 - 다운로드 테스트 (RED)
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/lib/document-lib/tests/download.test.js`
- 테스트: 파일 존재, 권한 확인, 스트리밍
- 실제 파일 읽기 테스트

**T224**: `document-lib/download.js` 구현 - 파일 다운로드 (GREEN)
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/lib/document-lib/src/download.js`
- 권한 확인: owner_id 또는 is_public
- 스트리밍 응답: fs.createReadStream
- Content-Disposition 헤더 설정

**T225**: `document-lib/validate.js` 구현 - 파일 타입 검증
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/lib/document-lib/src/validate.js`
- 허용 타입: pdf, jpg, jpeg, png, doc, docx
- file-type 패키지로 실제 타입 검증
- 파일명 sanitization

### 문서 API 엔드포인트 (T226-T230)
순차 실행 - 테스트 작성 후 구현

**T226**: `document.contract.test.js` 작성 - POST /api/v1/documents 테스트 (RED)
- 파일: `/home/ec2-user/DOT-V0.1/backend/tests/contract/document.contract.test.js`
- 테스트: multipart/form-data, 파일 업로드
- 인증 필수, 10MB 제한

**T227**: `backend/src/routes/documents/upload.js` 생성 - 업로드 라우트
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/routes/documents/upload.js`
- 라우트: POST /api/v1/documents
- multer 미들웨어 설정
- 인증 미들웨어 적용

**T228**: 문서 업로드 통합 테스트 작성
- 파일: `/home/ec2-user/DOT-V0.1/backend/tests/integration/document-upload.test.js`
- 테스트: 전체 업로드 플로우
- DB 저장 확인, 파일시스템 확인
- 실제 PostgreSQL 사용

**T229**: 문서 업로드 엔드포인트 구현 (GREEN)
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/controllers/document.controller.js`
- 메소드: uploadDocument, validateFile, saveMetadata
- 트랜잭션 처리: 파일 저장 + DB 저장
- 에러 시 롤백

**T230**: 문서 다운로드 엔드포인트 구현
- 파일: `/home/ec2-user/DOT-V0.1/backend/src/routes/documents/download.js`
- 라우트: GET /api/v1/documents/:id/download
- 권한 확인 후 스트리밍
- 다운로드 이력 기록

## 병렬 실행 예시

### 초기 설정 (T211-T215) 병렬
```bash
# 5개 작업 동시 실행
task --concurrency 5 \
  "Create document-lib directory structure" \
  "Create package.json with dependencies" \
  "Create CLI interface" \
  "Create main exports" \
  "Implement CLI commands"
```

### 테스트와 구현 병렬 (T221-T225)
```bash
# 업로드와 다운로드 병렬 개발
task --delegate auto \
  "Implement upload with tests" \
  "Implement download with tests" \
  "Implement validation"
```

## 주의사항

1. **TDD 원칙 준수**
   - 테스트 작성 (RED) → 구현 (GREEN) → 리팩토링
   - 실제 PostgreSQL과 파일시스템 사용 (no mocks)

2. **파일 크기 제한**
   - 10MB (10,485,760 bytes) 엄격 적용
   - 클라이언트/서버 양쪽 검증

3. **보안 고려사항**
   - 파일명 sanitization
   - 경로 탐색 공격 방지
   - 실제 파일 타입 검증 (확장자만 믿지 않음)

4. **한글 주석**
   - 모든 코드에 한글 주석 필수
   - 에러 메시지도 한글로

5. **자동 만료**
   - 3년 후 자동 만료 설정
   - 만료된 문서 정리 배치 작업 (추후 구현)

## 완료 조건

- [ ] document-lib CLI 명령어 동작
- [ ] 10MB 파일 업로드 성공
- [ ] 파일 다운로드 스트리밍 동작
- [ ] RLS 정책으로 권한 제어
- [ ] 모든 테스트 통과 (계약, 통합, 단위)
- [ ] 한글 주석 100%

## 다음 단계

Phase 9 (T231-T245): 알림 시스템 구현
- 이메일 발송
- 알림 이력 관리
- 템플릿 시스템