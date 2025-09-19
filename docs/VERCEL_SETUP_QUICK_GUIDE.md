# Vercel 자동 배포 빠른 설정 가이드

## 🎯 현재 상황
- ✅ Vercel 프로젝트 생성됨: `dot-platform`, `frontend`, `backend`
- ❌ GitHub과 연결 안 됨
- ❌ 자동 배포 비활성화 상태

## 🚀 방법 1: Vercel Dashboard에서 GitHub 연동 (가장 간단!)

### 1단계: Vercel Dashboard 접속
1. https://vercel.com/dashboard 로그인
2. 프로젝트 목록에서 `frontend` 또는 `dot-platform` 선택

### 2단계: GitHub 연결
1. **Settings** → **Git** 메뉴
2. **Connect Git Repository** 클릭
3. **GitHub** 선택 → 저장소 `crazybass81/DOT-V0.1` 선택
4. **Branch**: `006-claude-code-vscode` 또는 `main` 선택
5. **Root Directory**: `frontend` (frontend 프로젝트인 경우)

### 3단계: 자동 배포 확인
- 설정 완료 후 자동으로 첫 배포 시작
- 이후 푸시마다 자동 배포

## 🔧 방법 2: GitHub Actions 설정 (현재 파일 활용)

### 1단계: GitHub Secrets 설정
GitHub 저장소 → Settings → Secrets → Actions에서:

```
VERCEL_TOKEN = (Vercel에서 생성한 토큰)
VERCEL_ORG_ID = team_ZRA46B1Ng8n027CYnt0PzJzr
VERCEL_PROJECT_ID = prj_GTezmqTvQW1eSTV6FiokAbNlCleM (frontend용)
```

### 2단계: Vercel 토큰 생성
1. https://vercel.com/account/tokens
2. **Create Token** 클릭
3. 토큰 이름 입력 (예: github-actions)
4. **Full Access** 선택
5. 생성된 토큰을 GitHub Secret에 추가

### 3단계: 워크플로우 파일 수정
`.github/workflows/vercel-deploy.yml` 에서 빌드 명령 수정:

```yaml
- name: Deploy to Vercel Frontend
  env:
    VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
    VERCEL_ORG_ID: team_ZRA46B1Ng8n027CYnt0PzJzr
    VERCEL_PROJECT_ID: prj_GTezmqTvQW1eSTV6FiokAbNlCleM
  run: |
    cd frontend
    vercel --prod --token=$VERCEL_TOKEN --yes
```

## 🎉 배포 URL

### Frontend 프로젝트
- Production: `https://frontend-[your-username].vercel.app`
- Preview: `https://frontend-[hash].vercel.app`

### 메인 프로젝트 (dot-platform)
- Production: `https://dot-platform.vercel.app`
- 또는: `https://dot-platform-six.vercel.app`

## ⚡ 로컬에서 즉시 배포하기

```bash
# 1. Vercel 로그인
npx vercel login

# 2. Frontend 배포
cd frontend
npx vercel --prod

# 3. 배포 확인
npx vercel ls
```

## 🔍 문제 해결

### "Token is not valid" 오류
→ `npx vercel login`으로 재로그인

### "Project not found" 오류
→ `npx vercel link`로 프로젝트 재연결

### Build 실패
→ `npm run build` 로컬에서 먼저 테스트

## 📝 체크리스트

- [ ] Vercel 계정 로그인
- [ ] GitHub 저장소와 연결
- [ ] 자동 배포 브랜치 설정
- [ ] 첫 배포 성공 확인
- [ ] 이후 푸시 테스트

---
작성일: 2025-09-19
프로젝트 ID 정보 포함