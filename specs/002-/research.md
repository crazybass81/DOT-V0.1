# Research Document: DOT Platform V0.1

**Branch**: `002-` | **Date**: 2025-09-16
**Purpose**: 기술 스택 결정 및 기존 DOT 코드 재사용 분석

## 1. 기존 DOT 프로젝트 분석

### 재사용 가능한 검증된 코드

#### GPS 위치 검증 (location-verification.ts)
```javascript
// Haversine 공식을 사용한 거리 계산
calculateDistance(pos1: GeolocationPosition, pos2: GeolocationPosition): number {
  const EARTH_RADIUS_KM = 6371;

  if (pos1.lat === pos2.lat && pos1.lng === pos2.lng) {
    return 0;
  }

  const dLat = this.toRad(pos2.lat - pos1.lat);
  const dLon = this.toRad(pos2.lng - pos1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(this.toRad(pos1.lat)) *
    Math.cos(this.toRad(pos2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c * 1000; // meters
}
```
**결정**: attendance-lib에 이 코드를 그대로 이식하여 사용
**근거**: 이미 production에서 검증된 알고리즘
**대안**: Google Maps API - 외부 의존성과 비용 때문에 배제

#### QR 코드 생성/검증 (qr-verification.ts)
```javascript
// HMAC 서명 기반 동적 QR 생성
async generateQRCode(businessId: string): Promise<QRCodeData> {
  const timestamp = Date.now();
  const expiresAt = timestamp + 30000; // 30초
  const nonce = crypto.randomBytes(16).toString('hex');

  const payload = { businessId, timestamp, nonce, expiresAt };
  const signature = this.createSignature(payload);
  const token = Buffer.from(JSON.stringify({
    ...payload,
    signature
  })).toString('base64');

  const qrCode = await QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300
  });

  return { qrCode, token, expiresAt };
}
```
**결정**: attendance-lib의 QR 모듈로 통합
**근거**: 30초 갱신 주기가 보안과 사용성 균형 최적
**대안**: 고정 QR - 보안 위험으로 배제

#### RLS (Row Level Security) 정책
```sql
-- 조직별 데이터 격리
CREATE OR REPLACE FUNCTION auth.user_role_organizations()
RETURNS TABLE(organization_id uuid, role role_type, is_active boolean)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT ur.organization_id, ur.role, ur.is_active
  FROM user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.is_active = true
    AND (ur.end_date IS NULL OR ur.end_date > NOW());
$$;
```
**결정**: PostgreSQL RLS 적용
**근거**: 데이터베이스 수준 보안이 가장 확실
**대안**: 애플리케이션 레벨 필터링 - 실수 가능성으로 배제

## 2. Node.js/Express 최적화

### 미들웨어 구성
```javascript
// 보안 및 성능 미들웨어 스택
app.use(helmet()); // 보안 헤더
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' })); // 파일 업로드 지원
app.use(compression()); // gzip 압축

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100 // IP당 100 요청
});
app.use('/api', limiter);
```
**결정**: 표준 미들웨어 스택 사용
**근거**: 검증된 보안 및 성능 패턴
**대안**: 커스텀 미들웨어 - 재발명의 위험

### 에러 처리
```javascript
// 중앙집중식 에러 핸들러
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

// 글로벌 에러 핸들러
app.use((err, req, res, next) => {
  const { statusCode = 500, message, code } = err;

  logger.error({
    error: err,
    request: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(statusCode).json({
    status: 'error',
    code,
    message: statusCode === 500 ? '서버 오류가 발생했습니다' : message
  });
});
```
**결정**: 구조화된 에러 처리 시스템
**근거**: 일관된 에러 응답과 로깅
**대안**: 각 라우트별 처리 - 중복과 불일치 위험

## 3. PostgreSQL with PostGIS

### 위치 기반 쿼리 최적화
```sql
-- 사업장 50m 반경 내 체크
SELECT *
FROM businesses
WHERE ST_DWithin(
  location::geography,
  ST_MakePoint($1, $2)::geography,
  50 -- meters
);

-- 인덱스 생성
CREATE INDEX idx_businesses_location
ON businesses USING GIST(location);
```
**결정**: PostGIS 확장 사용
**근거**: 네이티브 지리 함수가 가장 효율적
**대안**: 애플리케이션 레벨 계산 - 성능 저하

### 다중 테넌시 전략
```sql
-- 각 테이블에 business_id 포함
ALTER TABLE attendance ADD COLUMN business_id INTEGER NOT NULL;
ALTER TABLE schedules ADD COLUMN business_id INTEGER NOT NULL;

-- RLS 정책 적용
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_isolation ON attendance
  USING (business_id IN (
    SELECT business_id FROM user_roles
    WHERE user_id = current_user_id()
  ));
```
**결정**: Row Level Security 사용
**근거**: DB 레벨 격리가 가장 안전
**대안**: 스키마 분리 - 관리 복잡도 증가

## 4. React 최적화

### 상태 관리
```javascript
// Context API + useReducer 조합
const AuthContext = createContext();
const AttendanceContext = createContext();

// 전역 상태는 최소화
const authReducer = (state, action) => {
  switch(action.type) {
    case 'LOGIN':
      return { ...state, user: action.payload, isAuthenticated: true };
    case 'LOGOUT':
      return { ...state, user: null, isAuthenticated: false };
    case 'SWITCH_ROLE':
      return { ...state, currentRole: action.payload };
    default:
      return state;
  }
};
```
**결정**: Context API + useReducer
**근거**: Redux 없이도 충분한 규모
**대안**: Redux - MVP에는 과도한 복잡도

### 성능 최적화
```javascript
// 코드 스플리팅
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const WorkerDashboard = lazy(() => import('./pages/WorkerDashboard'));

// 메모이제이션
const ExpensiveComponent = memo(({ data }) => {
  const processedData = useMemo(() =>
    heavyDataProcessing(data), [data]
  );

  const handleClick = useCallback(() => {
    // 이벤트 핸들러
  }, []);

  return <div>{processedData}</div>;
});
```
**결정**: React 내장 최적화 기능 활용
**근거**: 추가 라이브러리 없이 성능 확보
**대안**: 서드파티 최적화 도구 - 의존성 증가

## 5. 인증/보안

### JWT 구현
```javascript
// 토큰 생성
const generateToken = (payload) => {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '1h'
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d'
  });

  return { accessToken, refreshToken };
};

// 비밀번호 해싱
const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};
```
**결정**: JWT + bcrypt (salt rounds: 10)
**근거**: 업계 표준 보안 수준
**대안**: Session 기반 - 분산 환경 제약

## 6. 실시간 업데이트

### WebSocket vs SSE
```javascript
// Socket.io 구현
io.on('connection', (socket) => {
  socket.on('join-business', (businessId) => {
    socket.join(`business:${businessId}`);
  });

  // Redis Pub/Sub 연동
  redisSubscriber.on('message', (channel, message) => {
    const data = JSON.parse(message);
    io.to(`business:${data.businessId}`).emit('attendance-update', data);
  });
});
```
**결정**: Socket.io + Redis Pub/Sub
**근거**: 양방향 통신 필요, 확장 가능
**대안**: Server-Sent Events - 단방향만 지원

## 7. 파일 저장

### 로컬 vs 클라우드
```javascript
// 로컬 파일 시스템 사용
const uploadDir = path.join(__dirname, '../uploads');
const maxFileSize = 10 * 1024 * 1024; // 10MB

// Multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(uploadDir, req.user.id);
    fs.ensureDirSync(userDir);
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: maxFileSize },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('지원하지 않는 파일 형식입니다'));
    }
  }
});
```
**결정**: 로컬 파일 시스템 (MVP)
**근거**: 단순함, 추가 비용 없음
**대안**: AWS S3 - 향후 확장 시 마이그레이션

## 8. 이메일 알림

### SMTP 설정
```javascript
// Nodemailer 설정
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// 이메일 템플릿
const sendScheduleChangeNotification = async (user, schedule) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: '근무 스케줄 변경 알림',
    html: `
      <h2>스케줄 변경 안내</h2>
      <p>${user.name}님의 근무 스케줄이 변경되었습니다.</p>
      <p>날짜: ${schedule.date}</p>
      <p>시간: ${schedule.startTime} - ${schedule.endTime}</p>
    `
  };

  await transporter.sendMail(mailOptions);
};
```
**결정**: Nodemailer + Gmail SMTP
**근거**: MVP에 충분, 설정 간단
**대안**: SendGrid - 월 비용 발생

## 9. PDF 생성

### 보고서 생성
```javascript
// PDFKit 사용
const PDFDocument = require('pdfkit');

const generateAttendanceReport = (data) => {
  const doc = new PDFDocument();

  // 한글 폰트 설정
  doc.font('fonts/NanumGothic.ttf');

  doc.fontSize(20).text('근태 보고서', 50, 50);
  doc.fontSize(12).text(`기간: ${data.startDate} ~ ${data.endDate}`);

  // 테이블 생성
  data.records.forEach((record, i) => {
    doc.text(`${record.date} | ${record.userName} | ${record.checkIn} - ${record.checkOut}`);
  });

  return doc;
};
```
**결정**: PDFKit
**근거**: 순수 JS, 한글 지원
**대안**: Puppeteer - 무겁고 복잡

## 10. 테스팅 전략

### TDD 구현
```javascript
// 1. RED - 실패하는 테스트 작성
describe('Attendance Service', () => {
  test('should validate GPS location within 50m', async () => {
    const result = await attendanceService.checkIn(userId, qrToken, location);
    expect(result.status).toBe('checked_in');
  });
});

// 2. GREEN - 최소 구현
class AttendanceService {
  async checkIn(userId, qrToken, location) {
    // 최소 구현
    return { status: 'checked_in' };
  }
}

// 3. REFACTOR - 개선
class AttendanceService {
  async checkIn(userId, qrToken, location) {
    const business = await this.validateQRToken(qrToken);
    const distance = calculateDistance(location, business.location);

    if (distance > 50) {
      throw new AppError('위치가 너무 멀리 떨어져 있습니다', 400);
    }

    // 실제 DB 저장
    const attendance = await this.db.attendance.create({
      userId,
      businessId: business.id,
      checkInTime: new Date(),
      checkInLocation: location,
      status: 'checked_in'
    });

    return attendance;
  }
}
```
**결정**: Jest + Supertest, 실제 DB 사용
**근거**: Mock 금지, 실제 환경 테스트
**대안**: Mock 사용 - 명시적으로 금지됨

## 결론

모든 기술 결정은 다음 원칙을 따릅니다:
1. **검증된 코드 재사용**: 기존 DOT의 핵심 로직 활용
2. **Mock 사용 금지**: 실제 DB, 실제 서비스 연동
3. **단순화 금지**: 실제 production 수준 구현
4. **TDD 엄격 적용**: RED-GREEN-Refactor 사이클
5. **한글 우선**: 사용자 메시지, 주석, 문서 모두 한글

이러한 결정들은 MVP의 빠른 개발과 향후 확장 가능성을 모두 고려한 것입니다.