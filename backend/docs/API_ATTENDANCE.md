# Attendance API Documentation

## Overview
출퇴근 관리 시스템 API는 GPS 위치 기반 및 QR 코드 기반 출퇴근 체크인/아웃 기능을 제공합니다.

## Base URL
```
http://localhost:3000/api/v1/attendance
```

## Authentication
모든 API 요청에는 JWT Bearer 토큰이 필요합니다.

```http
Authorization: Bearer <token>
```

---

## Endpoints

### 1. 출근 체크인
**POST** `/checkin`

GPS 또는 QR 코드를 사용하여 출근을 기록합니다.

#### Request Body

**GPS 체크인:**
```json
{
  "businessId": 1,
  "method": "gps",
  "location": {
    "latitude": 37.4979,
    "longitude": 127.0276
  }
}
```

**QR 체크인:**
```json
{
  "businessId": 1,
  "method": "qr",
  "qrToken": "eyJidXNpbmVzc0lkIjoiMSIsInRpbWVz..."
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "id": 123,
    "userId": 45,
    "businessId": 1,
    "checkInTime": "2024-01-15T09:00:00Z",
    "status": "working",
    "method": "gps"
  }
}
```

#### Error Responses
- `400 Bad Request` - 필수 파라미터 누락
- `401 Unauthorized` - 인증 실패
- `403 Forbidden` - GPS 범위 벗어남 / QR 코드 만료
- `409 Conflict` - 이미 체크인 상태

---

### 2. 퇴근 체크아웃
**POST** `/checkout`

현재 진행 중인 출근 기록을 종료합니다.

#### Request Body
```json
{
  "businessId": 1,
  "location": {
    "latitude": 37.4979,
    "longitude": 127.0276
  }
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "id": 123,
    "checkInTime": "2024-01-15T09:00:00Z",
    "checkOutTime": "2024-01-15T18:30:00Z",
    "duration": 9.5,
    "workDuration": 34200,
    "status": "completed"
  }
}
```

#### Error Responses
- `404 Not Found` - 출근 기록 없음
- `409 Conflict` - 이미 퇴근 처리됨

---

### 3. 출퇴근 상태 조회
**GET** `/status?businessId=1`

현재 출퇴근 상태를 조회합니다.

#### Response
```json
{
  "success": true,
  "data": {
    "isWorking": true,
    "checkInTime": "2024-01-15T09:00:00Z",
    "checkOutTime": null,
    "method": "gps",
    "totalHours": 0
  }
}
```

---

### 4. 날짜별 근태 조회
**GET** `/history?date=2024-01-15`

특정 날짜의 출퇴근 기록을 조회합니다.

#### Response
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "checkInTime": "2024-01-15T09:00:00Z",
      "checkOutTime": "2024-01-15T18:30:00Z",
      "workDuration": 34200,
      "status": "completed",
      "method": "gps"
    }
  ]
}
```

---

### 5. QR 코드 생성 (사업장용)
**GET** `/qr/generate?businessId=1`

사업장 출퇴근용 QR 코드를 생성합니다.

#### Response
```json
{
  "success": true,
  "data": {
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAA...",
    "token": "eyJidXNpbmVzc0lkIjoiMSIsInRpbWVz...",
    "expiresAt": "2024-01-15T09:00:30Z"
  }
}
```

---

## Error Codes

| Code | Description | 설명 |
|------|-------------|------|
| `AUTH_REQUIRED` | Authentication required | 인증 필요 |
| `INVALID_LOCATION` | Invalid GPS coordinates | 잘못된 GPS 좌표 |
| `OUT_OF_RANGE` | Location out of business range | 사업장 범위 벗어남 |
| `QR_EXPIRED` | QR code has expired | QR 코드 만료 |
| `QR_INVALID` | Invalid QR code | 유효하지 않은 QR 코드 |
| `ALREADY_CHECKED_IN` | Already checked in | 이미 출근 상태 |
| `NOT_CHECKED_IN` | No active check-in | 출근 기록 없음 |
| `ALREADY_CHECKED_OUT` | Already checked out | 이미 퇴근 처리 |

---

## Business Rules

### GPS 체크인/아웃
- 사업장별로 설정된 GPS 반경 내에서만 가능 (기본 50m, 최대 500m)
- 위치 정확도는 Haversine 공식 기반으로 계산
- 체크아웃 시 범위를 벗어난 경우 메모에 기록

### QR 코드 체크인
- QR 코드는 30초간 유효
- HMAC-SHA256 서명으로 무결성 보장
- nonce를 사용하여 재사용 방지
- 사업장 ID가 일치해야 체크인 가능

### 근무 시간 계산
- 체크인부터 체크아웃까지 시간 계산
- 휴게 시간은 별도로 차감
- 초 단위로 저장, 시간 단위로 표시

### 상태 관리
- `working`: 근무 중
- `completed`: 정상 퇴근
- `break`: 휴게 중
- `offsite`: 외근 중

---

## Rate Limiting
- 체크인/아웃: 분당 10회
- QR 생성: 분당 30회
- 조회 API: 분당 100회

---

## WebSocket Events

실시간 출퇴근 상태 업데이트를 위한 WebSocket 이벤트:

```javascript
// 연결
ws.connect('/ws/attendance');

// 이벤트 구독
ws.on('checkin', (data) => {
  console.log('직원 출근:', data);
});

ws.on('checkout', (data) => {
  console.log('직원 퇴근:', data);
});

// 사업장별 구독
ws.emit('subscribe', { businessId: 1 });
```

---

## Examples

### cURL Examples

**GPS 체크인:**
```bash
curl -X POST http://localhost:3000/api/v1/attendance/checkin \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": 1,
    "method": "gps",
    "location": {
      "latitude": 37.4979,
      "longitude": 127.0276
    }
  }'
```

**상태 조회:**
```bash
curl -X GET "http://localhost:3000/api/v1/attendance/status?businessId=1" \
  -H "Authorization: Bearer <token>"
```

### JavaScript SDK

```javascript
// 체크인
const result = await attendance.checkIn({
  businessId: 1,
  method: 'gps',
  location: await getCurrentLocation()
});

// 체크아웃
const checkout = await attendance.checkOut({
  businessId: 1,
  location: await getCurrentLocation()
});

// 상태 조회
const status = await attendance.getStatus(1);
if (status.isWorking) {
  console.log('근무 중');
}
```

---

## Testing

테스트 환경에서는 다음 테스트 계정을 사용할 수 있습니다:

- **Test User**: `test@example.com` / `test1234`
- **Test Business ID**: `999`
- **Test Location**: 37.5665, 126.9780 (서울시청)

QR 코드 테스트를 위한 고정 토큰:
```
TEST_QR_TOKEN=eyJ0ZXN0IjoidG9rZW4ifQ==
```

---

## Migration Guide

### v1에서 v2로 마이그레이션

1. **엔드포인트 변경**
   - `/api/attendance/*` → `/api/v2/attendance/*`

2. **Request Body 변경**
   - `lat/lng` → `latitude/longitude`
   - `businessCode` → `businessId`

3. **Response 변경**
   - `work_duration` → `workDuration` (camelCase)
   - 시간 단위 추가: `duration` (시간), `workDuration` (초)

---

## Support

문제가 발생하면 다음 채널로 문의하세요:

- **Email**: support@dot-platform.com
- **Slack**: #dot-attendance-api
- **GitHub Issues**: https://github.com/dot-platform/backend/issues