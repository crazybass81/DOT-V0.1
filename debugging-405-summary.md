# 405 Method Not Allowed 오류 디버깅 요약

## 문제 상황
- **프론트엔드**: Vercel (HTTPS)
- **백엔드**: EC2 (HTTP)
- **오류**: 405 Method Not Allowed when POST /api/v1/auth/register
- **백엔드 직접 테스트**: 정상 작동 (201 Created)
- **Vercel 프록시**: 405 오류 발생

## 발견된 문제들

### 1. 백엔드 라우팅 문제
- `/api/v1/health` 엔드포인트가 404 반환
- `/api/health`는 정상 작동
- 백엔드 라우팅 구조에 v1 prefix 누락

### 2. Vercel 설정 문제
- `vercel.json`의 rewrite 규칙 충돌
- catch-all route `/(.*)`가 API 요청을 가로챔
- 프록시 함수가 호출되지 않음

### 3. 프록시 함수 문제
- HTTP Method 전달 실패
- 헤더 처리 문제
- 에러 핸들링 부족

## 적용된 해결책

### 1. 백엔드 라우팅 수정
```javascript
// v1 API 라우트에 health 엔드포인트 추가
router.get('/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    version: 'v1',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### 2. Vercel 설정 분리
```json
{
  "rewrites": [
    {
      "source": "/api/v1/(.*)",
      "destination": "/api/proxy/$1"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

### 3. 프록시 함수 개선
- Runtime 설정 추가: `nodejs18.x`
- 상세한 로깅 및 에러 처리
- CORS 헤더 완전 설정
- Path 파라미터 검증 강화

## 테스트 결과

### 배포 전 테스트
```bash
# 백엔드 직접
curl -X POST http://100.25.70.173:3001/api/v1/auth/register
→ 201 Created (정상)

# Vercel 프록시
curl -X POST https://dot-platform-six.vercel.app/api/v1/auth/register
→ 405 Method Not Allowed (오류)
```

### 예상 결과 (배포 후)
- Vercel 프록시도 201 또는 409 (중복) 반환 예상
- 프록시 함수 로그에서 상세한 디버깅 정보 확인 가능

## 추가 디버깅 도구

### 1. 로컬 테스트 스크립트
```javascript
// test-proxy-local.js
node test-proxy-local.js
```

### 2. 웹 기반 테스트 페이지
```
https://dot-platform-six.vercel.app/test-api.html
```

### 3. 직접 API 테스트
```bash
# Health Check
curl https://dot-platform-six.vercel.app/api/v1/health

# 회원가입 테스트
curl -X POST https://dot-platform-six.vercel.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"테스트","phone":"010-1234-5678"}'
```

## 근본 원인 분석

405 Method Not Allowed 오류의 주요 원인:

1. **Vercel Rewrite 충돌**: catch-all route가 API 요청을 가로챔
2. **프록시 함수 미호출**: Vercel이 프록시 함수를 실행하지 않음
3. **HTTP Method 손실**: 요청이 프록시 함수에 도달하지 못함

## 해결 확인 방법

배포 완료 후:
1. 프록시 함수 로그 확인 (Vercel 대시보드)
2. test-proxy-local.js 재실행
3. 웹 테스트 페이지에서 API 호출
4. 브라우저 개발자 도구에서 네트워크 탭 확인

배포가 성공하면 405 오류가 해결되고 정상적인 API 응답을 받을 수 있을 것입니다.