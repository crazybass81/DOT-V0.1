# 🚀 Vercel 즉시 설정 가이드

## 1단계: Vercel에 GitHub 저장소 연결 (3분)

1. **Vercel 접속**: https://vercel.com/new
2. **GitHub 저장소 Import**:
   - "Import Git Repository" 클릭
   - GitHub 계정 연결 (이미 연결되어 있을 수 있음)
   - `crazybass81/DOT-V0.1` 저장소 선택

## 2단계: 프로젝트 설정 (2분)

### Framework Preset 설정:
```
Framework Preset: Create React App
Root Directory: frontend  ← 중요!
Build Command: npm run build
Output Directory: build
Install Command: npm install
```

### 환경 변수 추가:
```
REACT_APP_API_URL=https://your-backend-api.com
REACT_APP_SOCKET_URL=wss://your-backend-api.com
REACT_APP_NAME=DOT Platform
REACT_APP_ENV=production
```

## 3단계: Deploy 클릭!

- Vercel이 자동으로 빌드 시작
- 약 2-3분 후 배포 완료
- 생성된 URL로 접속 가능 (예: https://dot-v0-1.vercel.app)

## ✅ 자동 배포 확인

이제 설정이 완료되었습니다!
- **main 브랜치 푸시 → 자동 프로덕션 배포**
- **PR 생성 → 자동 프리뷰 배포**

## 🎯 테스트하기

```bash
# 작은 변경 만들기
echo "<!-- Vercel Test -->" >> frontend/public/index.html

# 배포하기
git-flow deploy

# 2-3분 후 Vercel 대시보드에서 확인
```

## 📊 Vercel 대시보드

https://vercel.com/dashboard 에서:
- 배포 상태 확인
- 로그 보기
- 롤백 실행 (필요시)
- Analytics 확인

## 🚨 트러블슈팅

### 빌드 실패시:
1. Vercel 대시보드 → Functions 탭 → 로그 확인
2. `Root Directory`가 `frontend`로 설정되었는지 확인
3. Node.js 버전 확인 (18+ 필요)

### k6 에러 발생시:
- 이미 해결됨! (package.json에서 k6 제거함)

## 🎉 완료!

이제 GitHub에 푸시할 때마다 자동으로 Vercel에 배포됩니다!