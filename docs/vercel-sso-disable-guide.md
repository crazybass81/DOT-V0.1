# Vercel SSO/Protection 비활성화 가이드

## 화면별 상세 설정

### 1. 프로젝트 대시보드
```
Vercel Dashboard
├── Projects
│   └── dot-platform [클릭]
│       └── Settings [상단 탭 클릭]
```

### 2. Settings 페이지 구조
```
Settings
├── General
├── Domains
├── Integrations
├── Git
├── Functions
├── Environment Variables
├── Deployment Protection [⬅️ 여기 클릭]
│   ├── Vercel Authentication
│   ├── Password Protection
│   └── Deployment Protection by Environment
└── Advanced
```

### 3. Deployment Protection 설정 화면

#### Option 1: Vercel Authentication (기본 SSO)
```
┌─────────────────────────────────────────┐
│ Vercel Authentication                   │
│ Only members of your Vercel Team can    │
│ access your deployments.                │
│                                         │
│ Status: [ON ←→ OFF]  ← OFF로 변경      │
└─────────────────────────────────────────┘
```

#### Option 2: Password Protection
```
┌─────────────────────────────────────────┐
│ Password Protection                      │
│ Protect deployments with a password     │
│                                         │
│ Status: [ON ←→ OFF]  ← OFF로 변경      │
└─────────────────────────────────────────┘
```

#### Option 3: Environment-specific Protection
```
┌─────────────────────────────────────────┐
│ Deployment Protection by Environment    │
│                                         │
│ Production:                             │
│ [Vercel Authentication ▼]               │
│  └─ None ← 선택                        │
│                                         │
│ Preview:                                │
│ [Vercel Authentication ▼]               │
│  └─ None ← 선택                        │
└─────────────────────────────────────────┘
```

## 확인 방법

### 1. 즉시 테스트
```bash
# 브라우저 캐시 클리어 후
curl -I https://dot-platform-git-main-02102n.vercel.app

# Expected: HTTP/2 200 (성공)
# Not: HTTP/2 401 (여전히 보호됨)
```

### 2. Playwright 테스트
```bash
npm run test:e2e
```

## 문제 해결

### 여전히 401 오류가 나는 경우

1. **브라우저 캐시 문제**
   - Chrome: Ctrl+Shift+Delete → 캐시 삭제
   - 시크릿 모드로 재시도

2. **CDN 캐시 문제**
   - 5-10분 대기 (CDN 전파 시간)
   - Vercel Dashboard → Functions → Purge Cache

3. **팀 레벨 설정 확인**
   - Team Settings → Security → SSO 설정 확인
   - Organization 레벨 정책 확인

4. **도메인별 설정**
   - Settings → Domains → 각 도메인별 protection 확인

## Alternative: CLI로 확인/변경

```bash
# Vercel CLI 설치
npm i -g vercel

# 프로젝트 연결
vercel link

# 현재 설정 확인
vercel inspect

# 공개 배포 강제
vercel --prod --public
```

## 최종 체크리스트

- [ ] Deployment Protection → Vercel Authentication OFF
- [ ] Deployment Protection → Password Protection OFF
- [ ] Environment Protection → Production: None
- [ ] Environment Protection → Preview: None
- [ ] Team Settings → SSO 비활성화 (팀 계정인 경우)
- [ ] 브라우저 캐시 클리어
- [ ] 5분 대기 (CDN 전파)
- [ ] 테스트 URL 접속 확인