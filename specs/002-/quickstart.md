# DOT Platform V0.1 Quickstart Guide

**Branch**: `002-` | **Version**: 0.1.0
**Purpose**: 개발자가 빠르게 시스템을 실행하고 테스트할 수 있는 가이드

## 🚀 빠른 시작

### 필수 요구사항
- Node.js 20 LTS 이상
- PostgreSQL 15 이상 (PostGIS 확장 포함)
- Redis 7 이상
- Git

### 1. 환경 설정

```bash
# 저장소 클론
git clone https://github.com/your-org/dot-platform.git
cd dot-platform
git checkout 002-

# 백엔드 의존성 설치
cd backend
npm install

# 프론트엔드 의존성 설치
cd ../frontend
npm install

# 환경 변수 설정
cd ../backend
cp .env.example .env
# .env 파일을 편집하여 실제 값 입력
```

### 2. 데이터베이스 설정

```bash
# PostgreSQL 데이터베이스 생성
createdb dot_platform_dev
createdb dot_platform_test  # 테스트용

# PostGIS 확장 설치
psql dot_platform_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql dot_platform_test -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# 마이그레이션 실행
cd backend
npm run db:migrate

# 시드 데이터 생성 (개발용)
npm run db:seed
```

### 3. Redis 설정

```bash
# Redis 서버 시작
redis-server

# 별도 터미널에서 Redis 연결 테스트
redis-cli ping
# PONG 응답 확인
```

### 4. 애플리케이션 실행

```bash
# 터미널 1: 백엔드 서버 (실제 DB 연결)
cd backend
npm run dev
# 서버가 http://localhost:3000 에서 시작됨

# 터미널 2: 프론트엔드 서버
cd frontend
npm run dev
# 애플리케이션이 http://localhost:3001 에서 시작됨
```

## 🧪 TDD 테스트 실행

### 계약 테스트 (RED 단계)
```bash
cd backend

# 모든 계약 테스트 실행 (처음에는 모두 실패해야 함)
npm run test:contract

# 특정 계약 테스트만 실행
npm run test:contract -- auth.contract.test.js
```

### 통합 테스트 (실제 DB 사용)
```bash
# PostgreSQL과 Redis가 실행 중이어야 함

# 통합 테스트 실행
npm run test:integration

# 커버리지 포함 실행
npm run test:coverage
```

### E2E 테스트 (Playwright)
```bash
cd frontend

# Playwright 설치
npx playwright install

# E2E 테스트 실행
npm run test:e2e

# 헤드리스 모드가 아닌 브라우저로 실행
npm run test:e2e -- --headed
```

## 📝 테스트 시나리오

### 시나리오 1: Owner 회원가입 및 사업장 설정
```javascript
// 1. 회원가입 (자동으로 Seeker 역할)
POST /api/v1/auth/register
{
  "email": "owner@test.com",
  "password": "Test123!@#",
  "name": "김사장",
  "phone": "010-1111-2222"
}

// 2. 로그인
POST /api/v1/auth/login
{
  "email": "owner@test.com",
  "password": "Test123!@#"
}
// Response: accessToken, refreshToken, roles

// 3. 사업장 등록
POST /api/v1/businesses
Headers: Authorization: Bearer <accessToken>
{
  "name": "테스트 카페",
  "registrationNumber": "123-45-67890",
  "businessType": "개인사업자",
  "industryType": "카페",
  "address": "서울시 강남구 테헤란로 123",
  "location": {
    "lat": 37.5665,
    "lng": 126.9780
  }
}

// 4. Owner 역할로 전환
POST /api/v1/auth/switch-role
Headers: Authorization: Bearer <accessToken>
{
  "roleId": 2  // Owner 역할 ID
}
```

### 시나리오 2: Worker QR 출퇴근
```javascript
// 1. Worker 로그인
POST /api/v1/auth/login
{
  "email": "worker@test.com",
  "password": "Test123!@#"
}

// 2. QR 코드 생성 (Owner가 실행)
GET /api/v1/qr/generate?businessId=1
// Response: qrCode (base64), token, expiresAt

// 3. 출근 체크인 (GPS 검증 포함)
POST /api/v1/attendance/check-in
Headers: Authorization: Bearer <workerToken>
{
  "qrToken": "<QR_TOKEN>",
  "location": {
    "lat": 37.5665,
    "lng": 126.9780
  }
}
// GPS가 50m 이내인지 실제로 검증됨

// 4. 휴게 시작
POST /api/v1/attendance/break/start
{
  "location": {
    "lat": 37.5665,
    "lng": 126.9780
  }
}

// 5. 휴게 종료
POST /api/v1/attendance/break/end
{
  "location": {
    "lat": 37.5665,
    "lng": 126.9780
  }
}

// 6. 퇴근 체크아웃
POST /api/v1/attendance/check-out
{
  "location": {
    "lat": 37.5665,
    "lng": 126.9780
  }
}
```

### 시나리오 3: 실시간 근태 모니터링 (WebSocket)
```javascript
// WebSocket 연결
const socket = io('http://localhost:3000', {
  auth: {
    token: '<ownerAccessToken>'
  }
});

// 사업장 구독
socket.emit('subscribe', { businessId: 1 });

// 실시간 업데이트 수신
socket.on('attendance:update', (data) => {
  console.log('근태 업데이트:', data);
  // {
  //   type: 'check_in',
  //   userId: 3,
  //   userName: '김알바',
  //   time: '2025-09-16T09:00:00Z',
  //   location: { lat: 37.5665, lng: 126.9780 }
  // }
});

// REST API로 현황 조회
GET /api/v1/attendance/status?businessId=1
// Response:
// {
//   checkedIn: [...],
//   onBreak: [...],
//   checkedOut: [...]
// }
```

## 🛠️ 라이브러리 CLI 테스트

각 라이브러리는 독립적인 CLI를 제공합니다:

### auth-lib
```bash
cd backend/src/lib/auth-lib

# JWT 토큰 검증
node cli.js --verify-token <token>

# 비밀번호 해싱
node cli.js --hash-password "Test123!@#"

# 도움말
node cli.js --help
```

### attendance-lib
```bash
cd backend/src/lib/attendance-lib

# GPS 거리 계산
node cli.js --calculate-distance 37.5665 126.9780 37.5670 126.9785

# QR 토큰 생성
node cli.js --generate-qr --business-id 1

# QR 토큰 검증
node cli.js --verify-qr <token> --business-id 1
```

## 📊 데이터베이스 확인

```bash
# PostgreSQL 접속
psql dot_platform_dev

# 주요 테이블 확인
\dt

# 사용자 조회
SELECT id, email, name, status FROM users;

# 근태 기록 조회
SELECT u.name, a.date, a.check_in_time, a.check_out_time
FROM attendance a
JOIN users u ON a.user_id = u.id
ORDER BY a.date DESC;

# RLS 정책 확인
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public';
```

## 🐛 문제 해결

### PostgreSQL 연결 오류
```bash
# 연결 정보 확인
psql -h localhost -U postgres -d dot_platform_dev

# 권한 설정
GRANT ALL PRIVILEGES ON DATABASE dot_platform_dev TO your_user;
```

### Redis 연결 오류
```bash
# Redis 상태 확인
redis-cli ping

# Redis 재시작
sudo systemctl restart redis
# 또는
brew services restart redis  # Mac
```

### 포트 충돌
```bash
# 사용 중인 포트 확인
lsof -i :3000
lsof -i :3001

# 포트 변경 (.env 파일)
PORT=3002
FRONTEND_PORT=3003
```

### GPS 검증 실패
```javascript
// 테스트용 가까운 좌표 생성
const testLocation = {
  lat: 37.5665,  // 사업장 위도
  lng: 126.9780  // 사업장 경도
};

// 10m 떨어진 위치 (테스트용)
const nearbyLocation = {
  lat: 37.5665 + 0.0001,  // 약 11m 북쪽
  lng: 126.9780
};
```

## ✅ 성공 기준

모든 설정이 올바르게 되었다면:

1. ✅ 백엔드가 http://localhost:3000 에서 실행
2. ✅ 프론트엔드가 http://localhost:3001 에서 실행
3. ✅ PostgreSQL과 Redis 연결 성공
4. ✅ 회원가입/로그인 가능
5. ✅ QR 코드 생성 및 스캔 가능
6. ✅ GPS 위치 검증 작동
7. ✅ 실시간 업데이트 수신
8. ✅ 모든 테스트 통과

## 📚 추가 문서

- [데이터 모델](./data-model.md)
- [API 명세](./contracts/)
- [구현 계획](./plan.md)
- [연구 문서](./research.md)

---

**중요**: 이 시스템은 Mock을 사용하지 않습니다. 모든 테스트는 실제 PostgreSQL과 Redis를 사용하며, GPS 검증도 실제로 거리를 계산합니다.