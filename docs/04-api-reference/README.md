# 🔌 DOT Platform API 레퍼런스

> DOT Platform의 모든 API 엔드포인트 문서

## 📚 API 카테고리

### [🔐 인증 API](authentication/)
사용자 인증 및 권한 관리
- 로그인/로그아웃
- 회원가입
- 토큰 갱신
- 비밀번호 재설정

### [⏰ 출퇴근 API](attendance/)
직원 출퇴근 관리
- QR 체크인/체크아웃
- GPS 위치 확인
- 출퇴근 기록 조회
- 근무 시간 통계

### [📅 일정 관리 API](scheduling/)
근무 일정 관리
- 일정 생성/수정/삭제
- 일정 템플릿
- 일정 조회
- 일정 변경 요청

### [💰 급여 관리 API](payroll/)
급여 계산 및 관리
- 급여 계산
- 급여 명세서
- 공제 항목 관리
- 급여 지급 내역

## 🔑 공통 정보

### Base URL
```
Production: https://api.dot-platform.com/v1
Development: http://localhost:3001/api
```

### 인증 방식
모든 API 요청에는 JWT Bearer 토큰이 필요합니다:
```http
Authorization: Bearer {JWT_TOKEN}
```

### 요청/응답 형식
- **Content-Type**: `application/json`
- **Accept**: `application/json`
- **Charset**: `UTF-8`

### 응답 구조

#### 성공 응답
```json
{
  "success": true,
  "data": {
    // 실제 데이터
  },
  "message": "요청이 성공적으로 처리되었습니다",
  "timestamp": "2025-09-22T10:00:00Z"
}
```

#### 에러 응답
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "에러 메시지",
    "details": {
      // 추가 정보
    }
  },
  "timestamp": "2025-09-22T10:00:00Z"
}
```

## 📊 HTTP 상태 코드

| 코드 | 의미 | 설명 |
|-----|------|------|
| 200 | OK | 요청 성공 |
| 201 | Created | 리소스 생성 성공 |
| 204 | No Content | 성공했지만 응답 본문 없음 |
| 400 | Bad Request | 잘못된 요청 |
| 401 | Unauthorized | 인증 필요 |
| 403 | Forbidden | 권한 없음 |
| 404 | Not Found | 리소스를 찾을 수 없음 |
| 409 | Conflict | 충돌 (중복 등) |
| 422 | Unprocessable Entity | 유효성 검사 실패 |
| 429 | Too Many Requests | 요청 한도 초과 |
| 500 | Internal Server Error | 서버 내부 오류 |
| 503 | Service Unavailable | 서비스 일시 중단 |

## 🚦 Rate Limiting

API 요청 제한:
- **인증된 사용자**: 100 requests/minute
- **인증되지 않은 사용자**: 20 requests/minute

Rate limit 정보는 응답 헤더에 포함됩니다:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1695376800
```

## 📄 페이지네이션

리스트 API는 페이지네이션을 지원합니다:

### 요청 파라미터
```
GET /api/resource?page=1&limit=20&sort=createdAt&order=desc
```

### 응답 메타데이터
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## 🔍 필터링 및 검색

### 필터링
```
GET /api/resource?status=active&type=full-time
```

### 검색
```
GET /api/resource?search=keyword
```

### 날짜 범위
```
GET /api/resource?startDate=2025-09-01&endDate=2025-09-30
```

## 🌐 다국어 지원

Accept-Language 헤더로 응답 언어 설정:
```http
Accept-Language: ko-KR  # 한국어
Accept-Language: en-US  # 영어
Accept-Language: ja-JP  # 일본어
Accept-Language: zh-CN  # 중국어
```

## 🔄 API 버전 관리

### 현재 버전
- **Stable**: v1 (권장)
- **Beta**: v2 (테스트 중)

### 버전 지정 방법
URL 경로에 버전 포함:
```
https://api.dot-platform.com/v1/resource
https://api.dot-platform.com/v2/resource
```

## 📝 API 테스트 도구

### Postman Collection
[DOT Platform API Postman Collection 다운로드](./postman/dot-platform-api.json)

### cURL 예제
```bash
# 로그인
curl -X POST https://api.dot-platform.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# 인증된 요청
curl -X GET https://api.dot-platform.com/v1/user/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### JavaScript SDK
```javascript
import { DotAPI } from '@dot-platform/sdk';

const api = new DotAPI({
  apiKey: 'YOUR_API_KEY',
  baseURL: 'https://api.dot-platform.com/v1'
});

// 사용 예제
const profile = await api.user.getProfile();
```

## ⚠️ 주의사항

1. **보안**
   - HTTPS를 통해서만 API 호출
   - 토큰을 안전하게 저장 (localStorage 지양)
   - CORS 정책 준수

2. **성능**
   - 불필요한 API 호출 최소화
   - 응답 캐싱 활용
   - 페이지네이션 사용

3. **에러 처리**
   - 모든 에러 케이스 처리
   - 재시도 로직 구현
   - 사용자 친화적 에러 메시지

## 📞 지원

### API 관련 문의
- GitHub Issues: [github.com/crazybass81/DOT-V0.1/issues](https://github.com/crazybass81/DOT-V0.1/issues)
- Email: api-support@dot-platform.com

### 변경 사항 알림
- [API Changelog](./CHANGELOG.md)
- [Breaking Changes](./BREAKING_CHANGES.md)

---

*최종 업데이트: 2025-09-22*
*API 버전: v1.0.0*