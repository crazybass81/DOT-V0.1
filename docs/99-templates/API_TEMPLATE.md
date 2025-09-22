# 🔌 [API 이름]

> [API의 목적과 기능을 한 줄로 설명]

---
상태: 작성중 | 완료 | 검토필요
최종수정: YYYY-MM-DD
작성자: [작성자 이름]
---

## 📋 목차
- [개요](#개요)
- [인증](#인증)
- [엔드포인트](#엔드포인트)
- [요청/응답 형식](#요청응답-형식)
- [에러 처리](#에러-처리)
- [예제](#예제)
- [주의사항](#주의사항)

## 개요

### 기본 정보
- **Base URL**: `https://api.dot-platform.com/v1`
- **인증 방식**: JWT Bearer Token
- **Content-Type**: `application/json`
- **Rate Limit**: 100 requests/minute

### 사용 대상
- [ ] 사장님 (Owner)
- [ ] 직원 (Worker)
- [ ] 구직자 (Seeker)
- [ ] 시스템 관리자 (Admin)

## 인증

### 인증 헤더
```http
Authorization: Bearer {JWT_TOKEN}
```

### 토큰 획득
```bash
POST /api/auth/login
```

## 엔드포인트

### 1. [엔드포인트 이름]

#### `[METHOD] /api/[path]`

[엔드포인트 설명]

#### 요청 파라미터

##### Path Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | string | ✅ | 리소스 ID |

##### Query Parameters
| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|-------|------|
| page | number | ❌ | 1 | 페이지 번호 |
| limit | number | ❌ | 10 | 페이지당 항목 수 |

##### Request Body
```json
{
  "field1": "value1",
  "field2": {
    "nestedField": "value2"
  }
}
```

#### 응답

##### 성공 응답 (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "123",
    "field1": "value1",
    "createdAt": "2025-09-22T10:00:00Z"
  },
  "message": "Successfully retrieved"
}
```

##### 응답 필드 설명
| 필드 | 타입 | 설명 |
|-----|------|------|
| success | boolean | 요청 성공 여부 |
| data | object | 응답 데이터 |
| message | string | 응답 메시지 |

### 2. [다른 엔드포인트]

[반복...]

## 에러 처리

### 에러 응답 형식
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "에러 설명",
    "details": {}
  }
}
```

### 공통 에러 코드
| HTTP 코드 | 에러 코드 | 설명 |
|----------|----------|------|
| 400 | BAD_REQUEST | 잘못된 요청 |
| 401 | UNAUTHORIZED | 인증 필요 |
| 403 | FORBIDDEN | 권한 없음 |
| 404 | NOT_FOUND | 리소스를 찾을 수 없음 |
| 429 | TOO_MANY_REQUESTS | 요청 한도 초과 |
| 500 | INTERNAL_ERROR | 서버 내부 오류 |

## 예제

### cURL 예제
```bash
# GET 요청 예제
curl -X GET "https://api.dot-platform.com/v1/resource/123" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# POST 요청 예제
curl -X POST "https://api.dot-platform.com/v1/resource" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "field1": "value1",
    "field2": "value2"
  }'
```

### JavaScript 예제
```javascript
// Fetch API 사용
const response = await fetch('https://api.dot-platform.com/v1/resource/123', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);
```

### Python 예제
```python
import requests

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

response = requests.get(
    'https://api.dot-platform.com/v1/resource/123',
    headers=headers
)

data = response.json()
print(data)
```

## 주의사항

### 보안 관련
- ⚠️ JWT 토큰을 클라이언트 사이드에 저장할 때는 보안에 주의
- ⚠️ HTTPS를 통해서만 API 호출
- ⚠️ 민감한 정보는 로그에 남기지 않음

### 성능 관련
- 💡 페이지네이션을 활용하여 대량 데이터 처리
- 💡 불필요한 API 호출 최소화
- 💡 응답 캐싱 활용

### 버전 관리
- 현재 버전: v1
- Deprecated 예정: [날짜]
- 마이그레이션 가이드: [링크]

## 관련 문서
- [인증 가이드](../authentication/README.md)
- [에러 처리 가이드](../ERROR_HANDLING.md)
- [API 변경 이력](../CHANGELOG.md)

---

*이 문서는 DOT Platform API의 표준 템플릿입니다.*