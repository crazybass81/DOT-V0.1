# DOT Platform 개발자 가이드

> DOT 플랫폼 개발 및 유지보수를 위한 기술 문서

## 목차

1. [프로젝트 구조](#프로젝트-구조)
2. [개발 환경 설정](#개발-환경-설정)
3. [아키텍처 개요](#아키텍처-개요)
4. [API 개발 가이드](#api-개발-가이드)
5. [데이터베이스 설계](#데이터베이스-설계)
6. [인증 및 보안](#인증-및-보안)
7. [테스트 전략](#테스트-전략)
8. [배포 프로세스](#배포-프로세스)
9. [성능 최적화](#성능-최적화)
10. [문제 해결](#문제-해결)

---

## 프로젝트 구조

### 디렉토리 구조
```
DOT-V0.1/
├── backend/                  # 백엔드 서버 (Node.js/Express)
│   ├── src/
│   │   ├── controllers/     # 요청 처리 로직
│   │   ├── models/         # 데이터 모델 (Sequelize ORM)
│   │   ├── routes/         # API 라우트 정의
│   │   ├── services/       # 비즈니스 로직
│   │   ├── middleware/     # Express 미들웨어
│   │   ├── utils/         # 유틸리티 함수
│   │   ├── lib/           # 외부 라이브러리 래퍼
│   │   └── app.js         # Express 앱 초기화
│   ├── migrations/        # 데이터베이스 마이그레이션
│   ├── seeders/          # 테스트 데이터 시더
│   └── config/           # 설정 파일
│
├── frontend/             # 프론트엔드 (React)
│   ├── src/
│   │   ├── components/   # 재사용 컴포넌트
│   │   ├── pages/       # 페이지 컴포넌트
│   │   ├── hooks/       # 커스텀 React 훅
│   │   ├── services/    # API 통신 서비스
│   │   ├── store/       # 상태 관리 (Redux)
│   │   ├── utils/       # 유틸리티 함수
│   │   └── App.js       # 메인 앱 컴포넌트
│   └── public/          # 정적 파일
│
├── shared/              # 공통 코드
│   ├── types/          # TypeScript 타입 정의
│   └── constants/      # 공유 상수
│
├── tests/              # 테스트 코드
│   ├── unit/          # 단위 테스트
│   ├── integration/   # 통합 테스트
│   └── e2e/          # E2E 테스트 (Playwright)
│
├── scripts/           # 유틸리티 스크립트
├── docs/             # 문서
└── docker/           # Docker 설정
```

### 기술 스택

#### Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: Express.js 4.x
- **Database**: PostgreSQL 15
- **ORM**: Sequelize 6
- **Cache**: Redis 7
- **Queue**: Bull (Redis 기반)
- **Auth**: JWT + bcrypt
- **Validation**: Joi
- **Testing**: Jest + Supertest

#### Frontend
- **Framework**: React 18
- **State**: Redux Toolkit
- **Routing**: React Router 6
- **UI**: Material-UI v5
- **Forms**: React Hook Form
- **API Client**: Axios
- **Testing**: React Testing Library

#### DevOps
- **Container**: Docker
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: Winston + ELK Stack
- **APM**: New Relic

---

## 개발 환경 설정

### Prerequisites
```bash
# 필수 설치 항목
node >= 20.0.0
npm >= 10.0.0
postgresql >= 15
redis >= 7.0
git >= 2.30
```

### 초기 설정

#### 1. 프로젝트 클론
```bash
git clone https://github.com/your-org/dot-platform.git
cd dot-platform
```

#### 2. 환경 변수 설정
```bash
# Backend (.env)
cp backend/.env.example backend/.env

# 필수 환경 변수
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/dot_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
```

#### 3. 의존성 설치
```bash
# Root에서 모든 패키지 설치
npm run install:all

# 또는 개별 설치
cd backend && npm install
cd ../frontend && npm install
```

#### 4. 데이터베이스 설정
```bash
# PostgreSQL 데이터베이스 생성
createdb dot_dev
createdb dot_test

# 마이그레이션 실행
cd backend
npm run migrate

# 시드 데이터 (개발용)
npm run seed
```

#### 5. Redis 설정
```bash
# Redis 서버 시작
redis-server

# 연결 테스트
redis-cli ping
# PONG 응답 확인
```

### 개발 서버 실행

#### 전체 실행 (추천)
```bash
# Root에서
npm run dev
# Backend: http://localhost:3000
# Frontend: http://localhost:3001
```

#### 개별 실행
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm start

# Queue Worker
cd backend && npm run worker
```

### VS Code 설정

#### 추천 Extensions
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-azuretools.vscode-docker",
    "prisma.prisma",
    "mtxr.sqltools",
    "mtxr.sqltools-driver-pg",
    "formulahendry.auto-rename-tag",
    "streetsidesoftware.code-spell-checker",
    "wayou.vscode-todo-highlight"
  ]
}
```

#### 디버깅 설정
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "program": "${workspaceFolder}/backend/src/app.js",
      "envFile": "${workspaceFolder}/backend/.env"
    },
    {
      "type": "chrome",
      "request": "launch",
      "name": "Debug Frontend",
      "url": "http://localhost:3001",
      "webRoot": "${workspaceFolder}/frontend/src"
    }
  ]
}
```

---

## 아키텍처 개요

### 시스템 아키텍처
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Database   │
│   (React)   │     │  (Express)  │     │ (PostgreSQL)│
└─────────────┘     └─────────────┘     └─────────────┘
                            │
                            ▼
                    ┌─────────────┐
                    │    Redis    │
                    │   (Cache)   │
                    └─────────────┘
```

### 레이어 아키텍처
```
┌────────────────────────────────────┐
│        Presentation Layer          │  ← React Components
├────────────────────────────────────┤
│         API Gateway Layer          │  ← Express Routes
├────────────────────────────────────┤
│        Business Logic Layer        │  ← Services
├────────────────────────────────────┤
│        Data Access Layer           │  ← Models/Repositories
├────────────────────────────────────┤
│         Infrastructure Layer       │  ← Database/Cache/Queue
└────────────────────────────────────┘
```

### 데이터 플로우
```javascript
// 1. Frontend: API 호출
const response = await api.post('/api/v1/attendance/checkin', {
  latitude: 37.5665,
  longitude: 126.9780
});

// 2. Backend: 라우트 처리
router.post('/checkin', authenticate, validateLocation, attendanceController.checkIn);

// 3. Controller: 요청 처리
async checkIn(req, res) {
  const result = await attendanceService.processCheckIn(req.user.id, req.body);
  res.json(result);
}

// 4. Service: 비즈니스 로직
async processCheckIn(userId, location) {
  // 위치 검증
  await locationService.verify(location);
  // 출근 기록
  const attendance = await Attendance.create({ userId, ...data });
  // 캐시 업데이트
  await cache.set(`attendance:${userId}`, attendance);
  return attendance;
}

// 5. Model: 데이터베이스 작업
const attendance = await db.query('INSERT INTO attendances ...');
```

---

## API 개발 가이드

### RESTful API 설계 원칙

#### URL 구조
```
/api/v1/{resource}/{id}/{action}

예시:
GET    /api/v1/users           # 목록 조회
GET    /api/v1/users/123       # 단일 조회
POST   /api/v1/users           # 생성
PUT    /api/v1/users/123       # 수정
DELETE /api/v1/users/123       # 삭제
POST   /api/v1/users/123/reset # 특정 액션
```

#### HTTP 상태 코드
```javascript
// 성공
200 OK              // 일반 성공
201 Created         // 리소스 생성
204 No Content      // 삭제 성공

// 클라이언트 오류
400 Bad Request     // 잘못된 요청
401 Unauthorized    // 인증 필요
403 Forbidden       // 권한 없음
404 Not Found       // 리소스 없음
409 Conflict        // 충돌 (중복 등)
422 Unprocessable   // 검증 실패

// 서버 오류
500 Internal Error  // 서버 오류
503 Service Unavailable // 일시적 장애
```

### Controller 작성

```javascript
// backend/src/controllers/userController.js
const { validationResult } = require('express-validator');
const userService = require('../services/userService');
const { AppError } = require('../utils/errors');

class UserController {
  /**
   * 사용자 목록 조회
   * @route GET /api/v1/users
   * @query {number} page - 페이지 번호
   * @query {number} limit - 페이지당 항목 수
   */
  async getUsers(req, res, next) {
    try {
      // 검증 오류 확인
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 422, errors.array());
      }

      // 서비스 호출
      const { page = 1, limit = 20 } = req.query;
      const result = await userService.getUsers({ page, limit });

      // 응답
      res.status(200).json({
        success: true,
        data: result.users,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 사용자 생성
   * @route POST /api/v1/users
   */
  async createUser(req, res, next) {
    try {
      const user = await userService.createUser(req.body);

      res.status(201).json({
        success: true,
        data: user,
        message: '사용자가 생성되었습니다'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
```

### Service 작성

```javascript
// backend/src/services/userService.js
const { User, Role } = require('../models');
const bcrypt = require('bcrypt');
const { AppError } = require('../utils/errors');
const cache = require('../lib/cache');

class UserService {
  /**
   * 사용자 목록 조회
   */
  async getUsers({ page, limit }) {
    // 캐시 확인
    const cacheKey = `users:${page}:${limit}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    // 데이터베이스 조회
    const offset = (page - 1) * limit;
    const { rows, count } = await User.findAndCountAll({
      include: [{ model: Role, as: 'role' }],
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const result = {
      users: rows,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    };

    // 캐시 저장 (5분)
    await cache.set(cacheKey, result, 300);

    return result;
  }

  /**
   * 사용자 생성
   */
  async createUser(data) {
    // 중복 확인
    const existing = await User.findOne({
      where: { email: data.email }
    });

    if (existing) {
      throw new AppError('이미 존재하는 이메일입니다', 409);
    }

    // 비밀번호 해싱
    data.password = await bcrypt.hash(data.password, 10);

    // 트랜잭션으로 생성
    const user = await User.create(data);

    // 캐시 무효화
    await cache.del('users:*');

    return user;
  }
}

module.exports = new UserService();
```

### 미들웨어 작성

```javascript
// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * JWT 인증 미들웨어
 */
async function authenticate(req, res, next) {
  try {
    // 토큰 추출
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 필요합니다'
      });
    }

    // 토큰 검증
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 사용자 조회
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '유효하지 않은 토큰입니다'
      });
    }

    // 요청 객체에 사용자 정보 추가
    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '토큰이 만료되었습니다'
      });
    }

    return res.status(401).json({
      success: false,
      message: '인증 실패'
    });
  }
}

/**
 * 권한 확인 미들웨어
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: '권한이 없습니다'
      });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
```

---

## 데이터베이스 설계

### ERD (Entity Relationship Diagram)
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   businesses │────<│    users     │────<│ attendances  │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │  schedules   │     │ gps_logs     │
                     └──────────────┘     └──────────────┘
```

### 주요 테이블 스키마

#### users 테이블
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    business_id INTEGER REFERENCES businesses(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) DEFAULT 'employee',
    hourly_rate DECIMAL(10,2),
    employment_type VARCHAR(50), -- full-time, part-time, contract
    hired_date DATE,
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    -- 인덱스
    INDEX idx_email (email),
    INDEX idx_business_id (business_id),
    INDEX idx_role (role),
    INDEX idx_active_users (is_active, deleted_at)
);
```

#### attendances 테이블
```sql
CREATE TABLE attendances (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    business_id INTEGER REFERENCES businesses(id),
    check_in_time TIMESTAMP,
    check_out_time TIMESTAMP,
    check_in_location POINT, -- PostGIS
    check_out_location POINT,
    check_in_method VARCHAR(50), -- gps, qr, manual
    check_out_method VARCHAR(50),
    break_minutes INTEGER DEFAULT 0,
    overtime_minutes INTEGER DEFAULT 0,
    status VARCHAR(50), -- present, late, absent, holiday
    notes TEXT,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 인덱스
    INDEX idx_user_date (user_id, DATE(check_in_time)),
    INDEX idx_business_date (business_id, DATE(check_in_time)),
    INDEX idx_status (status),
    SPATIAL INDEX idx_location (check_in_location, check_out_location)
);
```

### Model 정의 (Sequelize)

```javascript
// backend/src/models/User.js
const { Model, DataTypes } = require('sequelize');

class User extends Model {
  static init(sequelize) {
    super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: {
          isEmail: true
        }
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      phone: {
        type: DataTypes.STRING,
        validate: {
          is: /^[0-9-]+$/
        }
      },
      role: {
        type: DataTypes.ENUM('admin', 'manager', 'employee'),
        defaultValue: 'employee'
      },
      hourlyRate: {
        type: DataTypes.DECIMAL(10, 2),
        field: 'hourly_rate'
      },
      employmentType: {
        type: DataTypes.ENUM('full-time', 'part-time', 'contract'),
        field: 'employment_type'
      },
      hiredDate: {
        type: DataTypes.DATEONLY,
        field: 'hired_date'
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active'
      }
    }, {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      paranoid: true, // soft delete
      timestamps: true,
      underscored: true
    });
  }

  static associate(models) {
    this.belongsTo(models.Business, {
      foreignKey: 'businessId',
      as: 'business'
    });

    this.hasMany(models.Attendance, {
      foreignKey: 'userId',
      as: 'attendances'
    });

    this.hasMany(models.Schedule, {
      foreignKey: 'userId',
      as: 'schedules'
    });
  }

  // 인스턴스 메서드
  async checkPassword(password) {
    return bcrypt.compare(password, this.password);
  }

  toJSON() {
    const values = { ...this.get() };
    delete values.password;
    return values;
  }
}

module.exports = User;
```

### 마이그레이션

```javascript
// backend/migrations/20240101000001-create-users.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      business_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'businesses',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      email: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false
      },
      // ... 나머지 필드
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type: Sequelize.DATE
      }
    });

    // 인덱스 추가
    await queryInterface.addIndex('users', ['email']);
    await queryInterface.addIndex('users', ['business_id']);
    await queryInterface.addIndex('users', ['role']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('users');
  }
};
```

---

## 인증 및 보안

### JWT 인증 플로우

```
1. 로그인 요청 (email/password)
    ↓
2. 자격 증명 확인
    ↓
3. JWT 토큰 생성 (access + refresh)
    ↓
4. 토큰 반환
    ↓
5. 이후 요청에 토큰 포함
    ↓
6. 토큰 검증 및 요청 처리
```

### 토큰 관리

```javascript
// backend/src/utils/token.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class TokenManager {
  /**
   * Access Token 생성
   */
  generateAccessToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h'
    });
  }

  /**
   * Refresh Token 생성
   */
  generateRefreshToken() {
    return crypto.randomBytes(40).toString('hex');
  }

  /**
   * Token Pair 생성
   */
  generateTokenPair(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      businessId: user.businessId
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken();

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600 // 1시간
    };
  }

  /**
   * 토큰 갱신
   */
  async refreshTokens(refreshToken) {
    // Redis에서 refresh token 확인
    const userId = await redis.get(`refresh:${refreshToken}`);

    if (!userId) {
      throw new AppError('Invalid refresh token', 401);
    }

    // 새 토큰 생성
    const user = await User.findByPk(userId);
    const tokens = this.generateTokenPair(user);

    // 기존 refresh token 삭제, 새 토큰 저장
    await redis.del(`refresh:${refreshToken}`);
    await redis.setex(
      `refresh:${tokens.refreshToken}`,
      7 * 24 * 3600, // 7일
      user.id
    );

    return tokens;
  }
}

module.exports = new TokenManager();
```

### 보안 미들웨어

```javascript
// backend/src/middleware/security.js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cors = require('cors');

/**
 * 보안 미들웨어 설정
 */
function setupSecurity(app) {
  // Helmet - 보안 헤더 설정
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"]
      }
    }
  }));

  // CORS 설정
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
    optionsSuccessStatus: 200
  }));

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // 최대 100개 요청
    message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.',
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use('/api', limiter);

  // 로그인 Rate Limiting (더 엄격하게)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true
  });

  app.use('/api/v1/auth/login', authLimiter);

  // Data Sanitization
  app.use(mongoSanitize()); // NoSQL injection 방지
  app.use(xss()); // XSS 방지
  app.use(hpp()); // HTTP Parameter Pollution 방지

  // Request Size Limit
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
}

module.exports = { setupSecurity };
```

### 입력 검증

```javascript
// backend/src/validators/userValidator.js
const { body, query, param } = require('express-validator');

const userValidators = {
  createUser: [
    body('email')
      .isEmail().withMessage('유효한 이메일 주소를 입력하세요')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 8 }).withMessage('비밀번호는 최소 8자 이상이어야 합니다')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
      .withMessage('비밀번호는 대소문자, 숫자, 특수문자를 포함해야 합니다'),
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 }).withMessage('이름은 2-50자 사이여야 합니다'),
    body('phone')
      .optional()
      .isMobilePhone('ko-KR').withMessage('유효한 휴대폰 번호를 입력하세요')
  ],

  updateUser: [
    param('id').isInt().withMessage('유효한 사용자 ID가 필요합니다'),
    body('email').optional().isEmail().normalizeEmail(),
    body('name').optional().trim().isLength({ min: 2, max: 50 }),
    body('phone').optional().isMobilePhone('ko-KR')
  ],

  getUsers: [
    query('page').optional().isInt({ min: 1 }).withMessage('페이지는 1 이상이어야 합니다'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit은 1-100 사이여야 합니다'),
    query('role').optional().isIn(['admin', 'manager', 'employee']).withMessage('유효하지 않은 role입니다')
  ]
};

module.exports = userValidators;
```

---

## 테스트 전략

### 테스트 구조
```
tests/
├── unit/               # 단위 테스트
│   ├── services/      # 서비스 로직
│   ├── utils/         # 유틸리티 함수
│   └── models/        # 모델 메서드
├── integration/       # 통합 테스트
│   ├── api/          # API 엔드포인트
│   └── database/     # DB 작업
└── e2e/              # E2E 테스트
    ├── auth/         # 인증 플로우
    ├── attendance/   # 출퇴근 시나리오
    └── schedule/     # 스케줄 관리
```

### 단위 테스트

```javascript
// tests/unit/services/userService.test.js
const userService = require('../../../backend/src/services/userService');
const { User } = require('../../../backend/src/models');
const bcrypt = require('bcrypt');

// Mock 설정
jest.mock('../../../backend/src/models');
jest.mock('bcrypt');

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('새 사용자를 생성해야 함', async () => {
      // Given
      const userData = {
        email: 'test@example.com',
        password: 'Password123!',
        name: '테스트 사용자'
      };

      User.findOne.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashed_password');
      User.create.mockResolvedValue({ id: 1, ...userData });

      // When
      const result = await userService.createUser(userData);

      // Then
      expect(User.findOne).toHaveBeenCalledWith({
        where: { email: userData.email }
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, 10);
      expect(User.create).toHaveBeenCalledWith({
        ...userData,
        password: 'hashed_password'
      });
      expect(result.id).toBe(1);
    });

    it('중복 이메일일 경우 에러를 발생시켜야 함', async () => {
      // Given
      User.findOne.mockResolvedValue({ id: 1 });

      // When & Then
      await expect(userService.createUser({
        email: 'existing@example.com'
      })).rejects.toThrow('이미 존재하는 이메일입니다');
    });
  });
});
```

### 통합 테스트

```javascript
// tests/integration/api/auth.test.js
const request = require('supertest');
const app = require('../../../backend/src/app');
const { sequelize } = require('../../../backend/src/models');

describe('Auth API', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('새 사용자를 등록해야 함', async () => {
      // When
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'Password123!',
          name: '새 사용자',
          phone: '010-1234-5678'
        });

      // Then
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe('newuser@example.com');
    });

    it('잘못된 이메일 형식일 경우 400 에러를 반환해야 함', async () => {
      // When
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'Password123!',
          name: '테스트'
        });

      // Then
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          field: 'email',
          message: expect.stringContaining('유효한 이메일')
        })
      );
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // 테스트용 사용자 생성
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          name: '테스트 사용자'
        });
    });

    it('올바른 자격증명으로 로그인해야 함', async () => {
      // When
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Password123!'
        });

      // Then
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('잘못된 비밀번호로 로그인 시 401 에러를 반환해야 함', async () => {
      // When
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword!'
        });

      // Then
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('이메일 또는 비밀번호가 일치하지 않습니다');
    });
  });
});
```

### E2E 테스트

```javascript
// tests/e2e/attendance/checkin.spec.js
const { test, expect } = require('@playwright/test');

test.describe('출퇴근 관리', () => {
  test.beforeEach(async ({ page }) => {
    // 로그인
    await page.goto('http://localhost:3001/login');
    await page.fill('[name="email"]', 'employee@example.com');
    await page.fill('[name="password"]', 'Password123!');
    await page.click('[type="submit"]');
    await page.waitForURL('**/dashboard');
  });

  test('GPS 기반 출근 체크인', async ({ page }) => {
    // Given: 대시보드에서
    await page.goto('http://localhost:3001/dashboard');

    // When: 출근 버튼 클릭
    await page.click('[data-testid="checkin-button"]');

    // 위치 권한 허용 (브라우저 context 설정 필요)
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({
      latitude: 37.5665,
      longitude: 126.9780
    });

    // Then: 출근 성공 확인
    await expect(page.locator('[data-testid="checkin-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="work-status"]')).toHaveText('근무중');
  });

  test('QR 코드 체크인', async ({ page }) => {
    // Given: QR 체크인 페이지
    await page.goto('http://localhost:3001/attendance/qr');

    // When: QR 코드 스캔 시뮬레이션
    await page.evaluate(() => {
      window.postMessage({
        type: 'QR_SCANNED',
        data: 'DOT-BUSINESS-123-CHECKIN-TOKEN'
      });
    });

    // Then: 체크인 성공
    await expect(page.locator('[data-testid="qr-success"]')).toBeVisible();
  });
});
```

### 테스트 실행

```bash
# 단위 테스트
npm run test:unit

# 통합 테스트
npm run test:integration

# E2E 테스트
npm run test:e2e

# 전체 테스트
npm test

# 커버리지 리포트
npm run test:coverage

# Watch 모드
npm run test:watch
```

---

## 배포 프로세스

### Docker 설정

#### Dockerfile (Backend)
```dockerfile
# backend/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 복사
COPY . .

# Production 이미지
FROM node:20-alpine

WORKDIR /app

# 필요한 패키지 설치
RUN apk add --no-cache tini

# 사용자 생성
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 빌드된 파일 복사
COPY --from=builder --chown=nodejs:nodejs /app .

# 포트 노출
EXPOSE 3000

# 사용자 전환
USER nodejs

# Tini를 사용한 프로세스 관리
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/app.js"]
```

#### docker-compose.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: dot_production
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - dot-network
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - dot-network
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/dot_production
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
    ports:
      - "3000:3000"
    networks:
      - dot-network
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      REACT_APP_API_URL: http://backend:3000
    ports:
      - "80:80"
    networks:
      - dot-network
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "443:443"
    depends_on:
      - backend
      - frontend
    networks:
      - dot-network
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:

networks:
  dot-network:
    driver: bridge
```

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: |
          npm ci
          cd backend && npm ci
          cd ../frontend && npm ci

      - name: Run tests
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-secret
        run: |
          npm run test:unit
          npm run test:integration

      - name: Build
        run: |
          cd frontend && npm run build
          cd ../backend && npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build and push Docker images
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: dot-platform
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:backend-$IMAGE_TAG ./backend
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:frontend-$IMAGE_TAG ./frontend
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:backend-$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:frontend-$IMAGE_TAG

      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster dot-cluster \
            --service dot-service \
            --force-new-deployment
```

---

## 성능 최적화

### 백엔드 최적화

#### 데이터베이스 쿼리 최적화
```javascript
// N+1 문제 해결
// ❌ Bad
const users = await User.findAll();
for (const user of users) {
  user.attendances = await Attendance.findAll({
    where: { userId: user.id }
  });
}

// ✅ Good
const users = await User.findAll({
  include: [{
    model: Attendance,
    as: 'attendances',
    required: false
  }]
});

// 필요한 필드만 선택
const users = await User.findAll({
  attributes: ['id', 'name', 'email'], // 필요한 필드만
  include: [{
    model: Attendance,
    attributes: ['checkInTime', 'checkOutTime'],
    where: {
      checkInTime: {
        [Op.gte]: startOfDay,
        [Op.lte]: endOfDay
      }
    }
  }]
});
```

#### Redis 캐싱 전략
```javascript
// backend/src/lib/cache.js
class CacheManager {
  constructor(redis) {
    this.redis = redis;
  }

  /**
   * Cache-Aside 패턴
   */
  async getOrSet(key, fetchFunction, ttl = 300) {
    // 캐시 확인
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // 캐시 미스 - 데이터 조회
    const data = await fetchFunction();

    // 캐시 저장
    await this.redis.setex(key, ttl, JSON.stringify(data));

    return data;
  }

  /**
   * 캐시 무효화
   */
  async invalidate(pattern) {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * TTL 전략
   */
  getTTL(dataType) {
    const ttlMap = {
      'user:profile': 3600,      // 1시간
      'schedule:weekly': 1800,   // 30분
      'attendance:daily': 300,   // 5분
      'statistics:monthly': 86400 // 1일
    };

    return ttlMap[dataType] || 600; // 기본 10분
  }
}
```

### 프론트엔드 최적화

#### Code Splitting
```javascript
// frontend/src/App.js
import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Loading from './components/Loading';

// Lazy loading
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Payroll = lazy(() => import('./pages/Payroll'));
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/admin/*" element={<AdminPanel />} />
      </Routes>
    </Suspense>
  );
}
```

#### React 성능 최적화
```javascript
// Memo를 사용한 리렌더링 방지
import React, { memo, useMemo, useCallback } from 'react';

const ExpensiveComponent = memo(({ data, onUpdate }) => {
  // useMemo로 계산 비용이 큰 값 메모이제이션
  const processedData = useMemo(() => {
    return data.map(item => ({
      ...item,
      calculated: heavyCalculation(item)
    }));
  }, [data]);

  // useCallback으로 함수 메모이제이션
  const handleClick = useCallback((id) => {
    onUpdate(id);
  }, [onUpdate]);

  return (
    <div>
      {processedData.map(item => (
        <div key={item.id} onClick={() => handleClick(item.id)}>
          {item.name}
        </div>
      ))}
    </div>
  );
});

// Virtual Scrolling for large lists
import { FixedSizeList } from 'react-window';

const LargeList = ({ items }) => {
  const Row = ({ index, style }) => (
    <div style={style}>
      {items[index].name}
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={items.length}
      itemSize={50}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
};
```

---

## 문제 해결

### 일반적인 문제들

#### 1. 메모리 누수
```javascript
// 문제 진단
// backend/src/utils/memory.js
const v8 = require('v8');
const { performance } = require('perf_hooks');

function checkMemoryUsage() {
  const heapStats = v8.getHeapStatistics();
  const usage = process.memoryUsage();

  console.log('Memory Usage:');
  console.log(`  RSS: ${(usage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap Used: ${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap Total: ${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  External: ${(usage.external / 1024 / 1024).toFixed(2)} MB`);

  // 힙 사용률이 90% 이상이면 경고
  const heapUsagePercent = (usage.heapUsed / heapStats.heap_size_limit) * 100;
  if (heapUsagePercent > 90) {
    console.warn(`⚠️ High heap usage: ${heapUsagePercent.toFixed(2)}%`);
  }
}

// 정기적인 메모리 체크
setInterval(checkMemoryUsage, 60000); // 1분마다
```

#### 2. 느린 API 응답
```javascript
// API 성능 모니터링
// backend/src/middleware/performance.js
const { performance } = require('perf_hooks');

function performanceMonitoring(req, res, next) {
  const start = performance.now();

  // Response 완료 시 시간 측정
  res.on('finish', () => {
    const duration = performance.now() - start;

    // 느린 API 로깅 (1초 이상)
    if (duration > 1000) {
      console.warn(`Slow API: ${req.method} ${req.path} took ${duration.toFixed(2)}ms`);

      // 상세 분석을 위한 로깅
      logger.warn('Slow API detected', {
        method: req.method,
        path: req.path,
        duration,
        query: req.query,
        body: req.body,
        user: req.user?.id
      });
    }
  });

  next();
}
```

#### 3. 데이터베이스 연결 풀 고갈
```javascript
// backend/src/config/database.js
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,

  // 연결 풀 설정
  pool: {
    max: 20,        // 최대 연결 수
    min: 5,         // 최소 연결 수
    acquire: 30000, // 연결 획득 최대 대기 시간
    idle: 10000     // 연결 유휴 시간
  },

  // 재시도 설정
  retry: {
    max: 3,
    match: [
      Sequelize.ConnectionError,
      Sequelize.ConnectionTimedOutError,
      Sequelize.TimeoutError
    ]
  }
});

// 연결 풀 모니터링
async function monitorPool() {
  const pool = sequelize.connectionManager.pool;

  console.log('Database Pool Status:');
  console.log(`  Size: ${pool.size}`);
  console.log(`  Available: ${pool.available}`);
  console.log(`  Using: ${pool.using}`);
  console.log(`  Waiting: ${pool.waiting}`);

  // 풀이 거의 가득 찬 경우 경고
  if (pool.using / pool.size > 0.8) {
    console.warn('⚠️ Database pool is nearly exhausted');
  }
}

// 정기적인 풀 모니터링
setInterval(monitorPool, 30000); // 30초마다
```

### 디버깅 도구

#### 로깅 설정
```javascript
// backend/src/lib/logger.js
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),

  transports: [
    // 콘솔 출력
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    // 파일 출력 (일별 로테이션)
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }),

    // 에러 로그 별도 파일
    new DailyRotateFile({
      level: 'error',
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
});

// 개발 환경에서 쿼리 로깅
if (process.env.NODE_ENV === 'development') {
  logger.add(new winston.transports.File({
    filename: 'logs/queries.log',
    level: 'debug'
  }));
}

module.exports = logger;
```

#### APM (Application Performance Monitoring)
```javascript
// backend/src/lib/apm.js
const newrelic = require('newrelic');

// Custom metrics
function recordMetric(name, value) {
  if (process.env.NODE_ENV === 'production') {
    newrelic.recordMetric(`Custom/${name}`, value);
  }
}

// Custom events
function recordEvent(eventType, attributes) {
  if (process.env.NODE_ENV === 'production') {
    newrelic.recordCustomEvent(eventType, attributes);
  }
}

// Transaction tracing
function startSegment(name, callback) {
  if (process.env.NODE_ENV === 'production') {
    return newrelic.startSegment(name, true, callback);
  }
  return callback();
}

module.exports = {
  recordMetric,
  recordEvent,
  startSegment
};
```

---

## 부록

### 유용한 스크립트

#### 데이터베이스 백업
```bash
#!/bin/bash
# scripts/backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
DB_NAME="dot_production"

# 백업 디렉토리 생성
mkdir -p $BACKUP_DIR

# PostgreSQL 백업
pg_dump $DATABASE_URL > "$BACKUP_DIR/backup_$DATE.sql"

# 압축
gzip "$BACKUP_DIR/backup_$DATE.sql"

# S3 업로드 (선택사항)
aws s3 cp "$BACKUP_DIR/backup_$DATE.sql.gz" "s3://dot-backups/db/"

# 오래된 백업 삭제 (30일 이상)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.sql.gz"
```

#### 성능 프로파일링
```javascript
// scripts/profile.js
const { performance } = require('perf_hooks');
const fs = require('fs');

class Profiler {
  constructor() {
    this.marks = new Map();
    this.measures = [];
  }

  mark(name) {
    this.marks.set(name, performance.now());
  }

  measure(name, startMark, endMark) {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : performance.now();

    const duration = end - start;
    this.measures.push({ name, duration });

    return duration;
  }

  report() {
    console.log('\n=== Performance Report ===\n');

    this.measures.sort((a, b) => b.duration - a.duration);

    this.measures.forEach(({ name, duration }) => {
      console.log(`${name}: ${duration.toFixed(2)}ms`);
    });

    // CSV 파일로 저장
    const csv = this.measures
      .map(m => `${m.name},${m.duration}`)
      .join('\n');

    fs.writeFileSync('performance-report.csv', csv);
  }
}

module.exports = Profiler;
```

### 참고 자료

#### 공식 문서
- [Node.js Documentation](https://nodejs.org/docs/)
- [Express.js Guide](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [PostgreSQL Manual](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/docs/)
- [Docker Documentation](https://docs.docker.com/)

#### 보안 가이드
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Checklist](https://github.com/goldbergyoni/nodebestpractices#6-security-best-practices)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

#### 성능 최적화
- [Node.js Performance](https://nodejs.org/en/docs/guides/simple-profiling/)
- [React Performance](https://react.dev/learn/render-and-commit)
- [PostgreSQL Performance](https://wiki.postgresql.org/wiki/Performance_Optimization)

---

*DOT Platform - 기술적 우수성을 추구하는 개발자 가이드*