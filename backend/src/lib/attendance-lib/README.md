# Attendance Library (근태 관리 라이브러리)

출퇴근 관리를 위한 GPS 위치 검증, QR 코드 생성/검증, 근무 시간 계산 기능을 제공하는 라이브러리입니다.

## 주요 기능

### GPS 위치 검증
- Haversine 공식을 사용한 정확한 거리 계산
- 50m 기본 반경 내 출퇴근 위치 검증
- 다양한 좌표 형식 지원 (객체 형태, 개별 좌표)

### QR 코드 시스템
- HMAC-SHA256 기반 보안 QR 코드 생성
- 30초 기본 만료 시간 설정
- 토큰 재사용 방지 및 서명 검증

### 근무 시간 계산
- 체크인/체크아웃 시간 검증
- 휴게 시간 처리 및 계산
- 야간 근무 시간 별도 계산
- 일일 근무 시간 요약 기능

## 설치 및 사용

### 기본 사용법

```javascript
const attendanceLib = require('./src/lib/attendance-lib');

// GPS 거리 계산
const distance = attendanceLib.calculateDistance(37.5665, 126.9780, 37.5651, 126.9895);
console.log(`거리: ${Math.round(distance)}m`);

// 반경 내 위치 확인
const withinRadius = attendanceLib.isWithinRadius(
  {lat: 37.5665, lng: 126.9780},
  {lat: 37.5651, lng: 126.9895},
  50
);

// QR 코드 생성 (환경 변수 QR_SECRET 필요)
const qrResult = await attendanceLib.generateQRCode('business-123', 30000);

// QR 코드 검증
const verification = await attendanceLib.verifyQRCode(qrResult.token);

// 체크인 검증
const checkInResult = await attendanceLib.validateCheckIn({
  method: 'gps',
  userLocation: {lat: 37.5665, lng: 126.9780},
  businessLocation: {lat: 37.5651, lng: 126.9895},
  maxDistance: 50
});

// 근무 시간 계산
const workHours = attendanceLib.calculateWorkHours(
  new Date('2024-01-01T09:00:00'),
  new Date('2024-01-01T18:00:00'),
  3600 // 1시간 휴게시간
);
```

### CLI 명령어 사용

```bash
# 위치 검증
node src/lib/attendance-lib/cli.js verify-location \
  --userLat 37.5665 --userLng 126.9780 \
  --businessLat 37.5651 --businessLng 126.9895 \
  --radius 50

# QR 코드 생성 (환경 변수 QR_SECRET 필요)
QR_SECRET=your_secret node src/lib/attendance-lib/cli.js generate-qr \
  --businessId "business-123" --expiry 30

# QR 코드 검증
QR_SECRET=your_secret node src/lib/attendance-lib/cli.js verify-qr \
  --token "generated_token_here"

# JSON 형식 출력
node src/lib/attendance-lib/cli.js verify-location \
  --userLat 37.5665 --userLng 126.9780 \
  --businessLat 37.5651 --businessLng 126.9895 \
  --radius 50 --format json
```

## API 참조

### GPS 모듈 (gps.js)

#### `calculateDistance(lat1, lon1, lat2, lon2)` 또는 `calculateDistance(pos1, pos2)`
두 GPS 좌표 간의 거리를 미터 단위로 계산합니다.

#### `isWithinRadius(center, point, radius)`
지정된 반경 내에 위치가 있는지 확인합니다.

### QR 모듈 (qr.js)

#### `generateQRCode(businessId, expiryMs)`
사업장용 QR 코드를 생성합니다.

#### `verifyQRCode(token)`
QR 토큰의 유효성을 검증합니다.

### 검증 모듈 (validation.js)

#### `validateCheckIn({method, userLocation, businessLocation, qrToken, maxDistance})`
체크인 요청의 유효성을 검증합니다.

#### `validateCheckOut({checkInTime, checkOutTime, userLocation, businessLocation, maxDistance, force})`
체크아웃 요청의 유효성을 검증합니다.

#### `calculateWorkHours(checkInTime, checkOutTime, breakTimeSeconds)`
실제 근무 시간을 초 단위로 계산합니다.

## 환경 변수

- `QR_SECRET`: QR 코드 서명을 위한 비밀키 (필수)

## 특징

- **실제 구현**: 모든 기능이 완전히 구현되어 있으며 TODO나 Mock 없음
- **한글 주석**: 모든 코드에 한글 주석 포함
- **기존 코드 재사용**: DOT 프로젝트의 검증된 Haversine 공식과 QR 시스템 재사용
- **유연한 인터페이스**: 다양한 좌표 형식과 호출 방식 지원
- **완성된 CLI**: 한글 도움말과 함께 실용적인 명령어 인터페이스 제공

## 요구사항 충족

✅ **T246**: 메인 export 파일 구현
✅ **T247**: GPS 모듈 - Haversine 거리 계산, 50m 반경 검증
✅ **T248**: QR 모듈 - HMAC 기반, 30초 만료 시간
✅ **T249**: 검증 모듈 - 근무 시간 계산, 휴게 시간 처리
✅ **T250**: CLI 모듈 - --verify-location, --generate-qr 명령어, 한글 도움말