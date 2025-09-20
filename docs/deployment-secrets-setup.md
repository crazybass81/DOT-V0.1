# GitHub Secrets 설정 가이드

## 필수 GitHub Secrets 설정

GitHub 리포지토리의 Settings → Secrets and variables → Actions에서 다음 시크릿을 추가해야 합니다:

### 1. Vercel 관련 (Frontend 배포)

```bash
# Vercel 토큰 및 프로젝트 정보
VERCEL_TOKEN          # Vercel 계정 설정에서 발급
VERCEL_ORG_ID         # Vercel 프로젝트 설정에서 확인
VERCEL_PROJECT_ID     # Vercel 프로젝트 설정에서 확인
```

#### Vercel 토큰 발급 방법:
1. [vercel.com/account/tokens](https://vercel.com/account/tokens) 접속
2. "Create Token" 클릭
3. 토큰 이름 입력 (예: "github-actions")
4. 발급된 토큰을 `VERCEL_TOKEN`으로 저장

#### Vercel 프로젝트 ID 확인:
```bash
# Vercel CLI로 확인
npx vercel link
cat .vercel/project.json
# orgId와 projectId 값 확인
```

### 2. EC2 관련 (Backend 배포)

```bash
# EC2 서버 접속 정보
EC2_HOST              # EC2 인스턴스 Public IP 또는 도메인
EC2_USER              # SSH 접속 유저 (보통 ubuntu 또는 ec2-user)
EC2_SSH_KEY           # EC2 인스턴스 SSH 프라이빗 키 (전체 내용)
```

#### SSH 키 설정 방법:
```bash
# .pem 파일 내용을 복사
cat your-ec2-key.pem
# 전체 내용을 EC2_SSH_KEY로 저장 (BEGIN/END 포함)
```

### 3. Docker Registry (선택사항)

```bash
# GitHub Container Registry 사용 시 (기본 설정)
# GITHUB_TOKEN은 자동으로 제공됨

# Docker Hub 사용 시 (선택사항)
DOCKER_USERNAME       # Docker Hub 사용자명
DOCKER_PASSWORD       # Docker Hub 비밀번호
```

### 4. 알림 설정 (선택사항)

```bash
# Slack 알림
SLACK_WEBHOOK         # Slack Incoming Webhook URL
```

## 환경별 설정

### Production 환경

```bash
# Production 데이터베이스
PROD_DB_HOST
PROD_DB_PORT
PROD_DB_NAME
PROD_DB_USER
PROD_DB_PASSWORD

# Production Redis
PROD_REDIS_HOST
PROD_REDIS_PORT
PROD_REDIS_PASSWORD

# Production JWT
PROD_JWT_SECRET
PROD_JWT_REFRESH_SECRET
```

### Staging 환경

```bash
# Staging 설정 (선택사항)
STAGING_EC2_HOST
STAGING_EC2_USER
STAGING_EC2_SSH_KEY
```

## EC2 서버 초기 설정

EC2 인스턴스에서 처음 배포할 때 필요한 설정:

```bash
# EC2 서버 SSH 접속
ssh -i your-key.pem ubuntu@your-ec2-ip

# 필수 패키지 설치
sudo apt update
sudo apt install -y docker.io docker-compose git

# Docker 권한 설정
sudo usermod -aG docker $USER
newgrp docker

# 프로젝트 디렉토리 생성
mkdir -p /home/ubuntu/dot-platform
cd /home/ubuntu/dot-platform

# 환경 파일 생성
cat > .env << 'EOF'
# Database
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=dot_platform

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_REFRESH_SECRET=your_refresh_secret_key

# Application
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-app.vercel.app
EOF

# Docker Compose 파일 생성 (필요시)
# GitHub Actions가 자동으로 가져옴
```

## 배포 테스트

### 1. 수동 배포 테스트
```bash
# GitHub Actions 페이지에서
# Actions → 워크플로우 선택 → "Run workflow" 클릭
```

### 2. 자동 배포 테스트
```bash
# main 브랜치에 푸시
git add .
git commit -m "test: 자동 배포 테스트"
git push origin main
```

### 3. 배포 상태 확인
- Frontend: https://your-app.vercel.app
- Backend Health: http://your-ec2-ip:3001/health
- GitHub Actions: 리포지토리 Actions 탭에서 확인

## 트러블슈팅

### Vercel 배포 실패
```bash
# Vercel 프로젝트 재연결
npx vercel link --yes
npx vercel --prod
```

### EC2 SSH 연결 실패
```bash
# SSH 키 권한 확인
chmod 400 your-key.pem

# Security Group 확인
# AWS Console → EC2 → Security Groups
# Inbound rules에 SSH (22) 포트 열려있는지 확인
```

### Docker 권한 오류
```bash
# EC2에서 Docker 권한 재설정
sudo chmod 666 /var/run/docker.sock
# 또는
sudo systemctl restart docker
```

## 보안 주의사항

1. **절대 하지 말아야 할 것**:
   - 시크릿을 코드에 하드코딩
   - .env 파일을 Git에 커밋
   - SSH 키를 공개 리포지토리에 업로드

2. **권장 사항**:
   - 정기적으로 시크릿 로테이션
   - 최소 권한 원칙 적용
   - Production과 Staging 환경 분리
   - 배포 알림 설정으로 모니터링