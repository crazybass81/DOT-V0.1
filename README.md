# DOT Platform V0.1

식음료(F&B) 사업을 위한 종합 운영 관리 시스템

## 🚀 프로젝트 개요

DOT Platform은 식음료 사업장의 근태관리, 스케줄링, 급여관리를 통합한 SaaS 플랫폼입니다.

### 핵심 기능
- 📍 **GPS 기반 근태관리**: QR 코드와 GPS 검증을 통한 정확한 출퇴근 관리
- 📅 **스케줄 관리**: 유연한 근무 스케줄 생성 및 관리
- 💰 **급여 계산**: 자동 급여 계산 및 명세서 생성
- 📊 **실시간 모니터링**: WebSocket 기반 실시간 근태 현황 모니터링
- 📄 **문서 관리**: 계약서, 증빙서류 등 문서 관리 (10MB 제한)
- 📧 **알림 시스템**: 이메일 기반 알림 시스템

## 🛠️ 기술 스택

### Backend
- Node.js 20 LTS + Express.js
- PostgreSQL 15 (PostGIS 확장)
- Redis 7 (세션/캐시)
- Socket.io (실시간 통신)
- JWT 인증

### Frontend
- React 18
- Material-UI 5
- Socket.io Client
- React Router v6

### 개발 원칙
- TDD (Test-Driven Development)
- Mock 사용 금지 - 실제 DB 연동
- 라이브러리 기반 아키텍처
- SuperClaude Framework 적용

## 📦 프로젝트 구조

```
DOT-V0.1/
├── backend/         # Express.js 백엔드
│   ├── src/
│   │   ├── lib/    # 핵심 라이브러리 (auth, attendance, schedule 등)
│   │   ├── api/    # REST API 엔드포인트
│   │   └── services/
│   └── tests/      # 테스트 (contract, integration, unit)
├── frontend/       # React 프론트엔드
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   └── tests/
├── shared/         # 공통 타입 및 상수
└── specs/         # 사양 문서

```

## 🚀 빠른 시작

### 필수 요구사항
- Node.js 20 LTS 이상
- PostgreSQL 15 이상 (PostGIS 확장 포함)
- Redis 7 이상
- Docker & Docker Compose (선택사항)

### 설치 및 실행

1. **의존성 설치**
```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install

# Shared
cd ../shared && npm install
```

2. **환경 변수 설정**
```bash
cd backend
cp .env.example .env
# .env 파일 편집하여 DB 연결 정보 입력
```

3. **데이터베이스 설정**
```bash
# Docker Compose 사용 시
docker-compose up -d

# 또는 직접 설치한 경우
createdb dot_platform_dev
psql dot_platform_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

4. **마이그레이션 실행**
```bash
cd backend
npm run db:migrate
npm run db:seed  # 개발용 시드 데이터
```

5. **서버 실행**
```bash
# Backend (터미널 1)
cd backend
npm run dev

# Frontend (터미널 2)
cd frontend
npm start
```

애플리케이션이 다음 주소에서 실행됩니다:
- Backend: http://localhost:3000
- Frontend: http://localhost:3001

## 🧪 테스트

### Backend 테스트
```bash
cd backend
npm run test:contract     # 계약 테스트
npm run test:integration  # 통합 테스트
npm run test:unit        # 단위 테스트
npm run test:coverage    # 커버리지 포함
```

### Frontend 테스트
```bash
cd frontend
npm test                 # 단위 테스트
npm run test:e2e        # E2E 테스트 (Playwright)
```

## 📚 문서

- [기능 명세](specs/002-/spec.md)
- [구현 계획](specs/002-/plan.md)
- [데이터 모델](specs/002-/data-model.md)
- [API 명세](specs/002-/contracts/)
- [빠른 시작 가이드](specs/002-/quickstart.md)

## 🤝 기여

이 프로젝트는 SuperClaude Framework를 사용하여 개발되었습니다.
- TDD 원칙을 준수해주세요
- Mock 사용을 금지합니다
- 한글 주석과 설명을 사용합니다

## 📄 라이선스

MIT License

## 👥 팀

DOT Team

---

*Built with SuperClaude Framework*
