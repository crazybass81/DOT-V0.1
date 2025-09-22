# Vercel 통합 배포 가이드

## 🚀 개요
DOT Platform을 Vercel에 배포하는 완전한 가이드입니다. 이 문서는 빠른 설정, 자동 배포, 그리고 상세한 설정 옵션을 모두 포함합니다.

## ⚡ 빠른 시작 (5분)

### 방법 1: Vercel Dashboard 직접 연동 (가장 간단!)
1. [vercel.com/new](https://vercel.com/new) 접속
2. GitHub 저장소 `crazybass81/DOT-V0.1` Import
3. 설정:
   - Framework Preset: `Create React App`
   - Root Directory: `frontend`
   - Branch: `main`
4. Deploy 클릭!

### 방법 2: GitHub Actions 자동 배포 (이미 설정됨)
- ✅ main 브랜치 푸시 → 자동 프로덕션 배포
- ✅ PR 생성 → 자동 프리뷰 배포

## 📋 사전 준비

### 1. Vercel 계정 설정
1. [Vercel](https://vercel.com)에 가입
2. GitHub 계정 연동
3. 새 프로젝트 생성

### 2. 환경 변수 설정 (Vercel 대시보드)
```env
DATABASE_URL=postgresql://user:pass@db.supabase.co:5432/postgres
REDIS_URL=redis://default:password@redis.upstash.io:6379
JWT_SECRET=your-secure-jwt-secret
NODE_ENV=production
```

### 3. GitHub Secrets 설정
Repository Settings → Secrets → Actions에서 추가:
- `VERCEL_TOKEN`: Vercel 액세스 토큰
- `VERCEL_ORG_ID`: Vercel 조직 ID
- `VERCEL_PROJECT_ID`: Vercel 프로젝트 ID

## 🏗️ 프로젝트 구조

```
DOT-V0.1/
├── api/                    # Vercel 서버리스 함수
│   ├── index.js           # 메인 API 엔트리포인트
│   └── auth/              # Auth 관련 함수
├── frontend/              # React 프론트엔드
│   ├── build/            # 빌드 결과물
│   └── src/              # 소스 코드
├── backend/              # Express 백엔드 (서버리스로 변환)
│   └── src/              # 백엔드 로직
└── vercel.json           # Vercel 설정

```

## 🔧 배포 방법

### 방법 1: GitHub Actions 자동 배포
```bash
# 1. 변경사항 커밋
git add .
git commit -m "feat: 새 기능 추가"

# 2. main 브랜치로 푸시 (자동 배포 시작)
git push origin main
```

### 방법 2: Vercel CLI 수동 배포
```bash
# 1. Vercel 로그인
vercel login

# 2. 프로젝트 연결
vercel link

# 3. 프로덕션 배포
vercel --prod
```

### 방법 3: Vercel 대시보드
1. [Vercel Dashboard](https://vercel.com/dashboard) 접속
2. "Import Git Repository" 클릭
3. GitHub 저장소 선택
4. 환경 변수 설정
5. "Deploy" 클릭

## 🌐 배포된 엔드포인트

### 프론트엔드
- `https://your-project.vercel.app/` - React 앱
- `https://your-project.vercel.app/login` - 로그인 페이지
- `https://your-project.vercel.app/dashboard` - 대시보드

### 백엔드 API
- `https://your-project.vercel.app/api/health` - 헬스체크
- `https://your-project.vercel.app/api/auth/login` - 로그인
- `https://your-project.vercel.app/api/attendance/*` - 출퇴근
- `https://your-project.vercel.app/api/schedule/*` - 스케줄
- `https://your-project.vercel.app/api/payroll/*` - 급여

## 🔒 보안 고려사항

1. **환경 변수**: 절대 코드에 직접 입력하지 마세요
2. **CORS 설정**: vercel.json에서 허용 도메인 설정
3. **Rate Limiting**: API 함수에 레이트 리미팅 적용
4. **인증**: JWT 토큰 검증 미들웨어 사용

## 🐛 문제 해결

### 빌드 실패
```bash
# 로컬에서 빌드 테스트
cd frontend && npm run build
```

### 환경 변수 누락
```bash
# Vercel 환경 변수 확인
vercel env ls
```

### 함수 타임아웃
- vercel.json에서 `maxDuration` 조정 (최대 10초 - Hobby, 60초 - Pro)

## 📊 모니터링

### Vercel Analytics
- 대시보드에서 실시간 트래픽 확인
- 함수 실행 시간 모니터링
- 에러 로그 확인

### 성능 최적화
- 정적 자산 CDN 캐싱
- 이미지 최적화 (next/image 사용)
- 서버리스 함수 Cold Start 최소화

## 🔄 롤백

### CLI를 통한 롤백
```bash
# 이전 배포 목록 확인
vercel ls

# 특정 배포로 롤백
vercel rollback [deployment-url]
```

### 대시보드에서 롤백
1. Vercel Dashboard → Deployments
2. 이전 성공 배포 선택
3. "Promote to Production" 클릭

## 📝 참고 사항

- **무료 티어 제한**:
  - 100GB 대역폭/월
  - 100시간 빌드 시간/월
  - 서버리스 함수 실행 시간 제한

- **추천 외부 서비스**:
  - Database: Supabase, Neon, PlanetScale
  - Redis: Upstash
  - File Storage: Cloudinary, AWS S3

## 🤝 지원

문제가 있으시면 Issues에 등록해주세요:
https://github.com/crazybass81/DOT-V0.1/issues