# DOT Platform 405 오류 해결 방안

## 문제 요약
- **백엔드**: HTTP (EC2) - 정상 작동
- **프론트엔드**: HTTPS (Vercel) - 405 Method Not Allowed
- **원인**: Mixed Content 정책 및 Vercel 프록시 제한

## 현재 상태
✅ **백엔드 API**: 완전히 정상 작동 (POST /api/v1/auth/register → 409/201)
❌ **Vercel 프록시**: 405 오류 지속 발생
✅ **프론트엔드 앱**: 정상 빌드 및 배포

## 권장 해결책 (우선순위별)

### 1. 백엔드 HTTPS 설정 (권장)
**가장 근본적이고 안전한 해결책**

```bash
# Let's Encrypt SSL 인증서 설정
sudo certbot --nginx -d your-domain.com

# 또는 AWS ALB/CloudFront 사용
aws elbv2 create-load-balancer --name dot-platform-alb \
  --subnets subnet-xxx --security-groups sg-xxx \
  --scheme internet-facing --type application
```

**장점:**
- Mixed Content 문제 완전 해결
- 프로덕션 환경에 적합
- 보안성 향상
- 프록시 불필요

**구현 방법:**
1. 도메인 구매 및 DNS 설정
2. SSL 인증서 발급 (Let's Encrypt 또는 AWS Certificate Manager)
3. 백엔드에 HTTPS 설정
4. 프론트엔드 API URL을 `https://api.yourdomain.com`으로 변경

### 2. Vercel 환경 변수 활용
**개발/스테이징 환경용 임시 해결책**

```javascript
// 프론트엔드에서 환경별 API URL 설정
const API_BASE_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:3001/api/v1'  // 로컬 개발
  : 'https://api.yourdomain.com/api/v1';  // 프로덕션

// 개발 환경에서만 HTTP 허용
if (process.env.NODE_ENV === 'development') {
  // Mixed Content 경고 무시 (개발용)
}
```

### 3. Cloudflare 프록시 활용
**중간 해결책**

```bash
# Cloudflare를 통한 HTTP → HTTPS 프록시
# 1. Cloudflare 계정 생성
# 2. 백엔드 도메인 등록
# 3. SSL/TLS 설정을 "Flexible"로 설정
# 4. 프론트엔드에서 Cloudflare 도메인 사용
```

### 4. CORS 프록시 서비스 (임시)
**빠른 테스트용**

```javascript
// 임시 테스트용 CORS 프록시
const PROXY_URL = 'https://cors-anywhere.herokuapp.com/';
const API_URL = PROXY_URL + 'http://100.25.70.173:3001/api/v1';

// 주의: 프로덕션에서 사용 금지
```

### 5. 백엔드 이전 (장기 해결책)
**완전한 해결책**

- **Vercel Functions**로 백엔드 이전
- **AWS Lambda + API Gateway**로 이전
- **Railway, Render** 등 HTTPS 지원 플랫폼 사용

## 즉시 구현 가능한 해결책

### Option A: 도메인 + SSL 설정 (권장)
```bash
# 1. 도메인 구매 (예: namecheap, godaddy)
# 2. EC2에 도메인 연결
sudo vim /etc/nginx/sites-available/default

# 3. SSL 인증서 설정
sudo certbot --nginx -d api.yourdomain.com

# 4. 프론트엔드 API URL 변경
REACT_APP_API_URL=https://api.yourdomain.com/api/v1
```

### Option B: Railway/Render 배포 (빠른 해결)
```bash
# Railway에 백엔드 배포
railway login
railway init
railway up

# 자동으로 HTTPS 도메인 제공
# 예: https://dot-platform-backend-production.up.railway.app
```

### Option C: AWS ALB + SSL (엔터프라이즈)
```bash
# Application Load Balancer 생성
aws elbv2 create-load-balancer \
  --name dot-platform-alb \
  --subnets subnet-xxx subnet-yyy \
  --security-groups sg-xxx

# SSL 인증서 연결
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTPS --port 443 \
  --ssl-policy ELBSecurityPolicy-TLS-1-2-2017-01 \
  --certificates CertificateArn=arn:aws:acm:...
```

## 현재 프로젝트를 위한 추천

**단기 (1-2일)**: Railway나 Render에 백엔드 재배포
- 무료 HTTPS 도메인 제공
- 설정 간단
- 즉시 Mixed Content 문제 해결

**중기 (1주)**: 도메인 구매 + Let's Encrypt SSL
- 전문적인 도메인 사용
- 비용 효율적
- 완전한 컨트롤

**장기 (1개월)**: AWS 인프라 구축
- ALB + EC2 + CloudFront
- 완전한 엔터프라이즈 설정
- 확장성 보장

## 결론

405 오류는 **Mixed Content 정책**과 **Vercel의 프록시 제한** 때문입니다. 가장 깔끔한 해결책은 **백엔드를 HTTPS로 설정**하는 것입니다.

프록시 함수로 해결하려고 시도했지만, Vercel의 Edge Network 제한으로 인해 HTTP 백엔드 프록시가 안정적으로 작동하지 않습니다.

**권장**: Railway에 백엔드를 재배포하여 즉시 HTTPS 지원을 받는 것이 가장 빠르고 효과적인 해결책입니다.