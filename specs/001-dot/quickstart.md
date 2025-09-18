# DOT Platform Quickstart Guide

**Branch**: `001-dot` | **Version**: 0.1.0

## 🚀 빠른 시작

DOT 플랫폼을 처음 시작하는 사용자를 위한 가이드입니다.

## 1. 개발 환경 설정

### 필수 요구사항
- Node.js 20 LTS 이상
- PostgreSQL 15 이상
- Redis 7 이상
- Git

### 환경 설정
```bash
# 저장소 클론
git clone https://github.com/your-org/dot-platform.git
cd dot-platform

# 백엔드 의존성 설치
cd backend
npm install

# 프론트엔드 의존성 설치
cd ../frontend
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일을 편집하여 데이터베이스 연결 정보 입력
```

### 데이터베이스 설정
```bash
# PostgreSQL 데이터베이스 생성
createdb dot_platform_dev

# PostGIS 확장 설치
psql dot_platform_dev -c "CREATE EXTENSION postgis;"

# 마이그레이션 실행
cd backend
npm run migrate

# 시드 데이터 생성 (개발용)
npm run seed
```

### Redis 설정
```bash
# Redis 서버 시작
redis-server

# Redis 연결 테스트
redis-cli ping
# PONG 응답 확인
```

## 2. 애플리케이션 실행

### 개발 서버 시작
```bash
# 터미널 1: 백엔드 서버
cd backend
npm run dev
# 서버가 http://localhost:3000 에서 시작됨

# 터미널 2: 프론트엔드 서버
cd frontend
npm run dev
# 애플리케이션이 http://localhost:3001 에서 시작됨
```

## 3. 테스트 계정

시드 데이터에 포함된 테스트 계정:

### Owner (사업주)
- 이메일: owner@test.com
- 비밀번호: Test123!
- 사업장: 테스트 카페

### Worker (근로자)
- 이메일: worker@test.com
- 비밀번호: Test123!

### Seeker (구직자)
- 이메일: seeker@test.com
- 비밀번호: Test123!

## 4. 기본 시나리오 테스트

### 시나리오 1: Owner - 사업장 설정 및 QR 생성
```javascript
// 1. 로그인
POST /api/v1/auth/login
{
  "email": "owner@test.com",
  "password": "Test123!"
}

// 2. 사업장 정보 조회
GET /api/v1/businesses/my

// 3. QR 코드 생성
POST /api/v1/qr/generate
{
  "businessId": 1,
  "location": {
    "lat": 37.5665,
    "lng": 126.9780
  }
}
```

### 시나리오 2: Worker - 출퇴근 기록
```javascript
// 1. 로그인
POST /api/v1/auth/login
{
  "email": "worker@test.com",
  "password": "Test123!"
}

// 2. QR 스캔 및 출근
POST /api/v1/attendance/check-in
{
  "qrToken": "<QR_TOKEN>",
  "location": {
    "lat": 37.5665,
    "lng": 126.9780
  }
}

// 3. 휴게 시작
POST /api/v1/attendance/break/start
{
  "location": {
    "lat": 37.5665,
    "lng": 126.9780
  }
}

// 4. 휴게 종료
POST /api/v1/attendance/break/end
{
  "location": {
    "lat": 37.5665,
    "lng": 126.9780
  }
}

// 5. 퇴근
POST /api/v1/attendance/check-out
{
  "location": {
    "lat": 37.5665,
    "lng": 126.9780
  }
}
```

### 시나리오 3: Owner - 실시간 근태 모니터링
```javascript
// WebSocket 연결
const socket = io('http://localhost:3000', {
  auth: { token: '<ACCESS_TOKEN>' }
});

// 사업장 구독
socket.emit('subscribe', businessId);

// 실시간 업데이트 수신
socket.on('attendance:update', (data) => {
  console.log('근태 업데이트:', data);
});

// REST API로 현황 조회
GET /api/v1/attendance/status?businessId=1
```

## 5. 테스트 실행

### 단위 테스트
```bash
cd backend
npm test
```

### 통합 테스트
```bash
cd backend
npm run test:integration
```

### E2E 테스트
```bash
cd frontend
npm run test:e2e
```

### 테스트 커버리지
```bash
cd backend
npm run test:coverage
```

## 6. API 문서

### Swagger UI
개발 서버 실행 후 http://localhost:3000/api-docs 접속

### Postman Collection
`/docs/postman/DOT-Platform.postman_collection.json` 파일 임포트

## 7. 주요 기능 체크리스트

### ✅ 인증/인가
- [ ] 회원가입
- [ ] 로그인/로그아웃
- [ ] 토큰 갱신
- [ ] 역할 전환
- [ ] 비밀번호 재설정

### ✅ 근태관리
- [ ] QR 체크인
- [ ] GPS 위치 검증
- [ ] 휴게/외근 기록
- [ ] 체크아웃
- [ ] 근태 기록 조회

### ✅ 스케줄
- [ ] 스케줄 생성
- [ ] 스케줄 수정
- [ ] 근무 요청
- [ ] 스케줄 조회

### ✅ 대시보드
- [ ] 실시간 근태 현황
- [ ] 근태 이상 감지
- [ ] 예상 인건비
- [ ] 근로자 검색

### ✅ 문서/보고서
- [ ] 문서 업로드 (10MB 제한)
- [ ] 문서 다운로드
- [ ] PDF 근태 보고서
- [ ] 급여명세서

## 8. 성능 벤치마크

### API 응답 시간 목표
- 인증 API: < 100ms (p95)
- 근태 API: < 200ms (p95)
- 보고서 생성: < 3초

### 부하 테스트
```bash
# k6 설치 필요
k6 run scripts/load-test.js

# 예상 결과:
# - 동시 사용자 1000명
# - 평균 응답 시간 < 200ms
# - 에러율 < 0.1%
```

## 9. 문제 해결

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
```

### 포트 충돌
```bash
# 사용 중인 포트 확인
lsof -i :3000
lsof -i :3001

# 포트 변경 (.env 파일)
PORT=3002
```

## 10. 프로덕션 배포

### Docker 컨테이너 빌드
```bash
docker-compose build
docker-compose up -d
```

### 헬스 체크
```bash
curl http://localhost:3000/health
# {"status":"healthy","database":"connected","redis":"connected"}
```

### 로그 확인
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

## 📚 추가 자료

- [API 문서](http://localhost:3000/api-docs)
- [아키텍처 문서](./architecture.md)
- [데이터 모델](./data-model.md)
- [보안 가이드](./security.md)
- [기여 가이드](./CONTRIBUTING.md)

## 🆘 도움 요청

문제가 발생하면:
1. [이슈 트래커](https://github.com/your-org/dot-platform/issues) 확인
2. [위키](https://github.com/your-org/dot-platform/wiki) 검색
3. 팀 슬랙 채널: #dot-platform-support

---
*이 가이드는 DOT Platform v0.1.0 기준입니다.*