# Research Document: DOT Platform

**Branch**: `001-dot` | **Date**: 2025-09-16
**Purpose**: 기술 스택 결정 및 모범 사례 조사

## Executive Summary
DOT 플랫폼 구현을 위한 기술 스택과 아키텍처 패턴을 조사했습니다. Node.js/Express 백엔드와 React 프론트엔드를 선택했으며, PostgreSQL을 메인 데이터베이스로, Redis를 캐시와 세션 관리에 사용합니다. 모든 기능은 독립 라이브러리로 구현하며 TDD 방식을 엄격히 따릅니다.

## 1. 백엔드 기술 스택

### 선택: Node.js 20 LTS + Express.js
**결정 근거**:
- 프론트엔드와 동일 언어 (JavaScript/TypeScript) 사용
- 넓은 생태계와 패키지
- 비동기 I/O로 높은 동시성 처리
- 실시간 기능 (WebSocket) 지원 우수

**대안 검토**:
- Java/Spring Boot: 더 무겁고 학습 곡선이 가파름
- Python/Django: Node.js 대비 실시간 처리 약함
- Go: 생태계가 작고 프론트엔드와 언어 불일치

### Express.js 모범 사례
```javascript
// 미들웨어 구성 순서
app.use(helmet()); // 보안 헤더
app.use(cors(corsOptions)); // CORS
app.use(compression()); // 응답 압축
app.use(express.json({ limit: '10mb' })); // JSON 파싱
app.use(rateLimiter); // Rate limiting
app.use(requestLogger); // 로깅
app.use('/api', apiRouter); // API 라우트
app.use(errorHandler); // 에러 처리 (마지막)
```

## 2. 데이터베이스 설계

### 선택: PostgreSQL 15
**결정 근거**:
- ACID 보장으로 금융 데이터 (급여) 안전
- JSON 지원으로 유연한 스키마
- 강력한 인덱싱과 쿼리 최적화
- PostGIS 확장으로 위치 기반 쿼리 지원

**다중 테넌시 전략**:
```sql
-- 모든 테이블에 business_id 포함
CREATE TABLE attendances (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  user_id INTEGER NOT NULL,
  check_in_time TIMESTAMP,
  check_in_location POINT,
  -- Row Level Security로 테넌트 분리
  CONSTRAINT attendance_business_user
    FOREIGN KEY (business_id, user_id)
    REFERENCES user_roles(business_id, user_id)
);

-- RLS 정책
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attendances
  USING (business_id = current_setting('app.current_business_id')::INT);
```

### 선택: Redis
**용도**:
- 세션 저장
- 실시간 데이터 캐싱
- Pub/Sub for WebSocket
- Rate limiting 카운터

## 3. GPS 위치 검증

### Haversine 공식 구현
```javascript
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 지구 반경 (미터)
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // 미터 단위 거리
}

// 50m 반경 검증
const MAX_DISTANCE = 50; // 미터
if (calculateDistance(workLat, workLon, userLat, userLon) > MAX_DISTANCE) {
  throw new Error('위치가 작업장에서 너무 멀리 떨어져 있습니다');
}
```

### 위치 스푸핑 방지
- 연속된 위치 기록의 속도 검증
- IP 주소와 GPS 위치 일관성 확인
- 디바이스 신뢰도 점수 관리

## 4. QR 코드 시스템

### JWT 기반 시간 제한 QR
```javascript
// QR 코드 생성
function generateQRToken(businessId, workplaceId) {
  return jwt.sign(
    {
      businessId,
      workplaceId,
      type: 'attendance',
      iat: Date.now()
    },
    process.env.QR_SECRET,
    { expiresIn: '1h' } // 1시간 유효
  );
}

// QR 코드 검증 및 출석 기록
async function verifyAndCheckIn(token, userId, location) {
  try {
    const payload = jwt.verify(token, process.env.QR_SECRET);

    // 위치 검증
    const workplace = await getWorkplace(payload.workplaceId);
    if (!isWithinRadius(location, workplace.location)) {
      throw new Error('잘못된 위치');
    }

    // 출석 기록
    return await createAttendance({
      businessId: payload.businessId,
      userId,
      checkInTime: new Date(),
      location
    });
  } catch (error) {
    throw new Error('유효하지 않은 QR 코드');
  }
}
```

## 5. 실시간 업데이트 아키텍처

### WebSocket + Redis Pub/Sub
```javascript
// Redis Pub/Sub 설정
const publisher = redis.createClient();
const subscriber = redis.createClient();

// 이벤트 발행
async function broadcastAttendanceUpdate(businessId, data) {
  await publisher.publish(
    `business:${businessId}:attendance`,
    JSON.stringify(data)
  );
}

// WebSocket 연결 처리
io.on('connection', (socket) => {
  socket.on('subscribe', async (businessId) => {
    // 권한 확인
    if (!await canAccessBusiness(socket.userId, businessId)) {
      return socket.emit('error', 'Unauthorized');
    }

    // Redis 구독
    socket.join(`business:${businessId}`);
    subscriber.subscribe(`business:${businessId}:attendance`);
  });
});

// Redis 메시지 → WebSocket 전달
subscriber.on('message', (channel, message) => {
  io.to(channel).emit('update', JSON.parse(message));
});
```

## 6. 프론트엔드 아키텍처

### 선택: React 18 + Material-UI
**결정 근거**:
- 컴포넌트 기반 구조
- 큰 생태계와 커뮤니티
- Material-UI로 일관된 UI
- React Query로 서버 상태 관리

**상태 관리**:
```javascript
// React Query for 서버 상태
const { data: attendance } = useQuery({
  queryKey: ['attendance', businessId],
  queryFn: () => fetchAttendance(businessId),
  refetchInterval: 30000 // 30초마다 갱신
});

// Zustand for 로컬 상태
const useAuthStore = create((set) => ({
  user: null,
  role: null,
  setUser: (user) => set({ user }),
  switchRole: (role) => set({ role })
}));
```

## 7. 테스팅 전략

### TDD 구현 계획
1. **계약 테스트** (OpenAPI 기반)
   ```javascript
   // Jest + Supertest
   describe('POST /api/attendance/checkin', () => {
     it('should fail without implementation', async () => {
       const response = await request(app)
         .post('/api/attendance/checkin')
         .send({ qrToken: 'test', location: {...} });

       expect(response.status).toBe(404); // RED phase
     });
   });
   ```

2. **통합 테스트** (실제 DB)
   ```javascript
   // 실제 PostgreSQL 사용
   beforeEach(async () => {
     await db.migrate.latest();
     await db.seed.run();
   });

   test('worker can check in', async () => {
     const attendance = await attendanceService.checkIn(
       workerId,
       businessId,
       location
     );

     expect(attendance.status).toBe('checked_in');
   });
   ```

3. **E2E 테스트** (Playwright)
   ```javascript
   test('complete attendance flow', async ({ page }) => {
     await page.goto('/login');
     await page.fill('[name=email]', 'worker@test.com');
     await page.fill('[name=password]', 'password');
     await page.click('button[type=submit]');

     await page.click('[data-test=scan-qr]');
     // QR 스캔 시뮬레이션
     await page.evaluate(() => {
       window.postMessage({ type: 'qr-scan', data: 'test-token' });
     });

     await expect(page.locator('[data-test=status]'))
       .toHaveText('출근 완료');
   });
   ```

## 8. 보안 고려사항

### 인증/인가
- JWT 토큰 (Access + Refresh)
- Role-Based Access Control (RBAC)
- Multi-factor authentication 준비

### API 보안
```javascript
// Rate Limiting
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 최대 100 요청
  standardHeaders: true,
  legacyHeaders: false,
});

// Input Validation
const { body, validationResult } = require('express-validator');

router.post('/checkin',
  body('qrToken').isJWT(),
  body('location.lat').isFloat({ min: -90, max: 90 }),
  body('location.lng').isFloat({ min: -180, max: 180 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // 처리 로직
  }
);
```

## 9. 성능 최적화

### 데이터베이스
- 적절한 인덱스 생성
- Connection pooling
- Query optimization
- Prepared statements

### API
- Response caching (Redis)
- Pagination
- Field filtering
- Compression

### 프론트엔드
- Code splitting
- Lazy loading
- Image optimization
- Service Worker caching

## 10. 배포 및 운영

### 컨테이너화
```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### 모니터링
- Winston for 로깅
- Prometheus + Grafana for 메트릭
- Sentry for 에러 추적
- Health check 엔드포인트

## 결론
선택된 기술 스택과 아키텍처는 DOT 플랫폼의 요구사항을 충족하며, 확장 가능하고 유지보수가 용이한 구조를 제공합니다. TDD 방식과 실제 의존성 사용으로 높은 품질을 보장하고, 모든 기능을 독립 라이브러리로 구현하여 재사용성을 극대화합니다.