# Vercel 자동 배포 설정 가이드

## 📋 현재 설정 상태

프로젝트에는 이미 GitHub Actions를 통한 Vercel 자동 배포가 구성되어 있습니다:

- ✅ **main 브랜치 자동 배포**: 푸시 시 프로덕션 배포
- ✅ **006-claude-code-vscode 브랜치 자동 배포**: 개발 브랜치 배포
- ✅ **PR 프리뷰 배포**: Pull Request 생성 시 미리보기 환경

## 🔐 필수 환경 변수 설정 (GitHub Secrets)

GitHub 저장소의 Settings → Secrets and variables → Actions에서 다음 변수들을 설정해야 합니다:

### 1. VERCEL_TOKEN
```
Vercel 대시보드 → Account Settings → Tokens → Create Token
생성된 토큰을 복사하여 GitHub Secret에 추가
```

### 2. VERCEL_ORG_ID
```
Vercel 대시보드 → Team Settings → General → Team ID
또는 vercel.json 파일에서 확인 가능
```

### 3. VERCEL_PROJECT_ID
```
Vercel 프로젝트 → Settings → General → Project ID
또는 .vercel/project.json 파일에서 확인 가능
```

## 🚀 자동 배포 작동 방식

### 1. 코드 푸시 시
```bash
# 기능 브랜치에서 작업
git checkout -b feature/new-feature
git add .
git commit -m "feat: 새로운 기능 추가"
git push origin feature/new-feature
```

### 2. PR 생성 시
- GitHub에서 Pull Request 생성
- 자동으로 프리뷰 URL 생성 및 PR에 댓글로 알림
- 테스트 실행 (실패해도 배포는 계속됨)

### 3. main 브랜치 병합 시
```bash
# PR 병합 또는 직접 푸시
git checkout main
git merge feature/new-feature
git push origin main
```
- 자동으로 프로덕션 배포 시작
- 배포 태그 자동 생성 (rollback용)
- Vercel 프로덕션 URL로 배포

## 📊 배포 상태 확인

### GitHub Actions에서 확인
1. GitHub 저장소 → Actions 탭
2. 실행 중인 워크플로우 확인
3. 로그에서 배포 상세 정보 확인

### Vercel 대시보드에서 확인
1. [Vercel 대시보드](https://vercel.com/dashboard) 접속
2. 프로젝트 선택
3. Deployments 탭에서 배포 히스토리 확인

## 🔄 롤백 방법

### GitHub Actions 태그 사용
```bash
# 배포 태그 목록 확인
git tag -l "deploy-*"

# 특정 태그로 롤백
git checkout deploy-20240319-143022
git push origin main --force
```

### Vercel 대시보드 사용
1. Vercel 프로젝트 → Deployments
2. 이전 성공 배포 선택
3. "Promote to Production" 클릭

## ⚡ 빠른 배포 팁

### 테스트 건너뛰기 (급한 경우)
```bash
git commit -m "fix: 긴급 수정 [skip ci]"
```

### 수동 배포 트리거
1. GitHub → Actions → Deploy to Production
2. "Run workflow" 버튼 클릭
3. 브랜치 선택 후 실행

## 🛠️ 문제 해결

### 배포 실패 시
1. GitHub Actions 로그 확인
2. Vercel 빌드 로그 확인
3. 환경 변수 설정 재확인

### 일반적인 오류
- **401 Unauthorized**: VERCEL_TOKEN 확인
- **Project not found**: VERCEL_PROJECT_ID 확인
- **Build failed**: package.json 의존성 확인

## 📝 추가 설정 (선택사항)

### 환경별 배포
```yaml
# .github/workflows/deploy-staging.yml
on:
  push:
    branches:
      - staging
```

### 슬랙 알림 추가
```yaml
- name: Slack Notification
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## 📚 참고 자료

- [Vercel CLI 문서](https://vercel.com/docs/cli)
- [GitHub Actions 문서](https://docs.github.com/en/actions)
- [Vercel GitHub Integration](https://vercel.com/docs/concepts/git/vercel-for-github)

---

**마지막 업데이트**: 2025-09-19
**작성자**: Claude Code Assistant