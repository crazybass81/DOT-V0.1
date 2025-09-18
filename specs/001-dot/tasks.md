# Task List: DOT Platform

**Feature**: DOT Platform - 식음료 운영 관리 시스템
**Branch**: `001-dot` | **Created**: 2025-09-16

## Summary
총 45개 작업으로 구성된 DOT 플랫폼 구현 계획입니다. 각 작업은 최소 단위로 분해되어 있으며, Mock 사용 없이 실제 구현을 목표로 합니다. [P] 표시는 병렬 실행 가능한 작업입니다.

## Task Dependencies Graph
```
Setup (T001-T006)
    ↓
Database (T007-T010)
    ↓
Contract Tests (T011-T014) [P]
    ↓
Core Libraries (T015-T020) [P]
    ↓
Models (T021-T030) [P]
    ↓
Services (T031-T036)
    ↓
API Endpoints (T037-T041)
    ↓
Frontend (T042-T043)
    ↓
Integration Tests (T044-T045)
```

---

## Phase 1: Setup & Infrastructure (T001-T010)

### T001: 프로젝트 구조 초기화
**파일**: `package.json`, `.gitignore`, `README.md`
**설명**: 프로젝트 루트 구조를 생성하고 기본 설정 파일을 구성합니다.
```bash
mkdir -p backend/src/{models,services,api,lib}
mkdir -p backend/tests/{contract,integration,unit}
mkdir -p frontend/src/{components,pages,services,utils}
mkdir -p frontend/tests/{integration,e2e}
mkdir -p shared/{types,constants,contracts}
```

### T002: 백엔드 의존성 설치
**파일**: `backend/package.json`
**설명**: Express, PostgreSQL, Redis, JWT 등 백엔드 의존성을 설치합니다.
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "pg": "^8.11.0",
    "redis": "^4.6.0",
    "jsonwebtoken": "^9.0.0",
    "bcrypt": "^5.1.0",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "winston": "^3.10.0",
    "express-rate-limit": "^6.10.0",
    "express-validator": "^7.0.0"
  },
  "devDependencies": {
    "jest": "^29.6.0",
    "supertest": "^6.3.0",
    "@types/node": "^20.0.0",
    "nodemon": "^3.0.0"
  }
}
```

### T003: 프론트엔드 의존성 설치
**파일**: `frontend/package.json`
**설명**: React, Material-UI, React Query 등 프론트엔드 의존성을 설치합니다.
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@mui/material": "^5.14.0",
    "@tanstack/react-query": "^4.35.0",
    "axios": "^1.5.0",
    "zustand": "^4.4.0",
    "react-router-dom": "^6.15.0",
    "socket.io-client": "^4.5.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.37.0",
    "@testing-library/react": "^14.0.0",
    "vite": "^4.4.0"
  }
}
```

### T004: 환경 변수 설정
**파일**: `backend/.env.example`, `frontend/.env.example`
**설명**: 환경 변수 템플릿을 생성합니다.
```env
# backend/.env.example
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/dot_platform
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d
QR_SECRET=qr-secret-key
```

### T005: ESLint 및 Prettier 설정
**파일**: `.eslintrc.js`, `.prettierrc`
**설명**: 코드 품질 도구를 설정합니다.
```javascript
// .eslintrc.js
module.exports = {
  extends: ['eslint:recommended'],
  env: {
    node: true,
    jest: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: 2022
  }
};
```

### T006: TypeScript 설정
**파일**: `tsconfig.json`, `backend/tsconfig.json`, `frontend/tsconfig.json`
**설명**: TypeScript 컴파일러 설정을 구성합니다.
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### T007: PostgreSQL 데이터베이스 생성
**파일**: `backend/scripts/init-db.sh`
**설명**: 개발 및 테스트 데이터베이스를 생성합니다.
```bash
#!/bin/bash
createdb dot_platform_dev
createdb dot_platform_test
psql dot_platform_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql dot_platform_test -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### T008: 데이터베이스 마이그레이션 설정
**파일**: `backend/knexfile.js`, `backend/migrations/`
**설명**: Knex.js 마이그레이션 시스템을 설정합니다.
```javascript
module.exports = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: { directory: './migrations' }
  },
  test: {
    client: 'postgresql',
    connection: process.env.TEST_DATABASE_URL
  }
};
```

### T009: Redis 연결 설정
**파일**: `backend/src/config/redis.js`
**설명**: Redis 클라이언트를 설정하고 연결합니다.
```javascript
const redis = require('redis');
const client = redis.createClient({
  url: process.env.REDIS_URL
});

client.on('error', (err) => console.error('Redis Error:', err));
await client.connect();

module.exports = client;
```

### T010: 로깅 시스템 설정
**파일**: `backend/src/config/logger.js`
**설명**: Winston 로거를 구성합니다.
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

module.exports = logger;
```

---

## Phase 2: Contract Tests (T011-T014) [P]
**TDD 원칙: 테스트를 먼저 작성하고 실패하는 것을 확인**

### T011: 인증 API 계약 테스트 [P]
**파일**: `backend/tests/contract/auth.contract.test.js`
**설명**: auth-api.yaml 기반 계약 테스트를 작성합니다. 실제 PostgreSQL과 Redis를 사용합니다.
```javascript
describe('Auth API Contract', () => {
  let db, redis;

  beforeAll(async () => {
    // 실제 데이터베이스 연결
    db = await connectToDatabase(process.env.TEST_DATABASE_URL);
    redis = await connectToRedis(process.env.REDIS_URL);
  });

  describe('POST /api/v1/auth/register', () => {
    it('should create new user with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          name: '홍길동',
          phone: '010-1234-5678'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');

      // 실제 DB 확인
      const user = await db.query('SELECT * FROM users WHERE email = $1', ['test@example.com']);
      expect(user.rows).toHaveLength(1);
    });
  });
});
```

### T012: 근태 API 계약 테스트 [P]
**파일**: `backend/tests/contract/attendance.contract.test.js`
**설명**: attendance-api.yaml 기반 계약 테스트를 작성합니다. GPS 위치 검증 포함.
```javascript
describe('Attendance API Contract', () => {
  describe('POST /api/v1/attendance/check-in', () => {
    it('should record check-in with valid QR and location', async () => {
      const qrToken = jwt.sign({ businessId: 1, workplaceId: 1 }, process.env.QR_SECRET);

      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          qrToken,
          location: { lat: 37.5665, lng: 126.9780 }
        });

      expect(response.status).toBe(200);

      // 실제 DB에서 출석 기록 확인
      const attendance = await db.query(
        'SELECT * FROM attendances WHERE user_id = $1 AND date = CURRENT_DATE',
        [userId]
      );
      expect(attendance.rows[0].check_in_time).toBeDefined();
    });
  });
});
```

### T013: 스케줄 API 계약 테스트 [P]
**파일**: `backend/tests/contract/schedule.contract.test.js`
**설명**: 스케줄 관련 API 계약 테스트를 작성합니다.
```javascript
describe('Schedule API Contract', () => {
  describe('POST /api/v1/schedules', () => {
    it('should create schedule for business', async () => {
      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          businessId: 1,
          startDate: '2025-09-16',
          endDate: '2025-09-22',
          assignments: [
            { userId: 1, date: '2025-09-16', shiftStart: '09:00', shiftEnd: '18:00' }
          ]
        });

      expect(response.status).toBe(201);
    });
  });
});
```

### T014: 급여 API 계약 테스트 [P]
**파일**: `backend/tests/contract/payroll.contract.test.js`
**설명**: 급여 계산 및 명세서 API 테스트를 작성합니다.
```javascript
describe('Payroll API Contract', () => {
  describe('GET /api/v1/payroll/calculate', () => {
    it('should calculate payroll based on attendance', async () => {
      // 실제 근태 데이터 삽입
      await db.query(`
        INSERT INTO attendances (business_id, user_id, date, total_work_minutes)
        VALUES (1, 1, '2025-09-01', 480)
      `);

      const response = await request(app)
        .get('/api/v1/payroll/calculate')
        .query({ userId: 1, month: '2025-09' });

      expect(response.body.totalHours).toBe(8);
    });
  });
});
```

---

## Phase 3: Core Libraries (T015-T020) [P]

### T015: auth-lib 라이브러리 구현 [P]
**파일**: `backend/src/lib/auth-lib/index.js`
**설명**: JWT 토큰 생성/검증, 비밀번호 해싱 등 인증 기능을 구현합니다. CLI 인터페이스 포함.
```javascript
#!/usr/bin/env node
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

class AuthLib {
  async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }

  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  generateToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  }

  verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
  }
}

// CLI 인터페이스
if (require.main === module) {
  const [,, command, ...args] = process.argv;
  const lib = new AuthLib();

  switch(command) {
    case '--verify-token':
      console.log(lib.verifyToken(args[0]));
      break;
    case '--help':
      console.log('Usage: auth-lib --verify-token <token>');
      break;
  }
}

module.exports = AuthLib;
```

### T016: attendance-lib 라이브러리 구현 [P]
**파일**: `backend/src/lib/attendance-lib/index.js`
**설명**: 근태 기록, GPS 검증, QR 처리 로직을 구현합니다.
```javascript
class AttendanceLib {
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  validateLocation(userLocation, workplaceLocation, maxDistance = 50) {
    const distance = this.calculateDistance(
      userLocation.lat, userLocation.lng,
      workplaceLocation.lat, workplaceLocation.lng
    );

    if (distance > maxDistance) {
      throw new Error(`위치가 작업장에서 ${Math.round(distance)}m 떨어져 있습니다`);
    }

    return true;
  }

  async recordCheckIn(db, userId, businessId, location) {
    // 트랜잭션 시작
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(`
        INSERT INTO attendances (business_id, user_id, date, check_in_time, check_in_location, status)
        VALUES ($1, $2, CURRENT_DATE, NOW(), POINT($3, $4), 'checked_in')
        ON CONFLICT (business_id, user_id, date)
        DO UPDATE SET check_in_time = NOW(), check_in_location = POINT($3, $4), status = 'checked_in'
        RETURNING *
      `, [businessId, userId, location.lat, location.lng]);

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = AttendanceLib;
```

### T017: schedule-lib 라이브러리 구현 [P]
**파일**: `backend/src/lib/schedule-lib/index.js`
**설명**: 스케줄 생성, 수정, 충돌 검증 로직을 구현합니다.
```javascript
class ScheduleLib {
  async createSchedule(db, businessId, startDate, endDate, assignments) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 스케줄 생성
      const schedule = await client.query(`
        INSERT INTO schedules (business_id, start_date, end_date)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [businessId, startDate, endDate]);

      // 할당 생성
      for (const assignment of assignments) {
        await client.query(`
          INSERT INTO schedule_assignments (schedule_id, user_role_id, date, shift_start, shift_end)
          VALUES ($1, $2, $3, $4, $5)
        `, [schedule.rows[0].id, assignment.userRoleId, assignment.date, assignment.shiftStart, assignment.shiftEnd]);
      }

      await client.query('COMMIT');
      return schedule.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  detectConflicts(assignments) {
    // 충돌 검증 로직
    const conflicts = [];
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        if (assignments[i].userId === assignments[j].userId &&
            assignments[i].date === assignments[j].date) {
          conflicts.push({ user: assignments[i].userId, date: assignments[i].date });
        }
      }
    }
    return conflicts;
  }
}

module.exports = ScheduleLib;
```

### T018: payroll-lib 라이브러리 구현 [P]
**파일**: `backend/src/lib/payroll-lib/index.js`
**설명**: 급여 계산, 세금 계산, 명세서 생성 로직을 구현합니다.
```javascript
class PayrollLib {
  calculatePayroll(workHours, hourlyRate, overtimeThreshold = 40) {
    const regularHours = Math.min(workHours, overtimeThreshold);
    const overtimeHours = Math.max(0, workHours - overtimeThreshold);

    const basePay = regularHours * hourlyRate;
    const overtimePay = overtimeHours * hourlyRate * 1.5;

    const totalPay = basePay + overtimePay;
    const tax = this.calculateTax(totalPay);
    const insurance = this.calculateInsurance(totalPay);

    return {
      regularHours,
      overtimeHours,
      basePay,
      overtimePay,
      totalPay,
      tax,
      insurance,
      netPay: totalPay - tax - insurance
    };
  }

  calculateTax(amount) {
    // 간소화된 세금 계산
    if (amount <= 1000000) return amount * 0.06;
    if (amount <= 3000000) return amount * 0.15;
    return amount * 0.24;
  }

  calculateInsurance(amount) {
    // 4대보험 계산 (간소화)
    return amount * 0.045;
  }
}

module.exports = PayrollLib;
```

### T019: document-lib 라이브러리 구현 [P]
**파일**: `backend/src/lib/document-lib/index.js`
**설명**: 문서 업로드, 저장, 검증 로직을 구현합니다.
```javascript
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class DocumentLib {
  constructor(storagePath = './uploads') {
    this.storagePath = storagePath;
  }

  async validateFile(file) {
    const allowedTypes = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    const ext = path.extname(file.originalname).toLowerCase().slice(1);

    if (!allowedTypes.includes(ext)) {
      throw new Error(`파일 형식 ${ext}은(는) 지원되지 않습니다`);
    }

    if (file.size > maxSize) {
      throw new Error('파일 크기는 10MB를 초과할 수 없습니다');
    }

    return true;
  }

  async saveFile(file, userId, businessId) {
    const filename = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
    const filepath = path.join(this.storagePath, filename);

    await fs.writeFile(filepath, file.buffer);

    return {
      filename,
      originalFilename: file.originalname,
      fileType: path.extname(file.originalname).slice(1),
      fileSize: file.size,
      storagePath: filepath,
      expiresAt: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000) // 3년 후
    };
  }
}

module.exports = DocumentLib;
```

### T020: notification-lib 라이브러리 구현 [P]
**파일**: `backend/src/lib/notification-lib/index.js`
**설명**: 이메일 알림 발송 로직을 구현합니다.
```javascript
const nodemailer = require('nodemailer');

class NotificationLib {
  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendEmail(to, subject, content) {
    const mailOptions = {
      from: process.env.SMTP_FROM,
      to,
      subject,
      html: content
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Email send error:', error);
      throw new Error('이메일 발송에 실패했습니다');
    }
  }

  async sendScheduleChangeNotification(user, schedule) {
    const subject = '스케줄 변경 알림';
    const content = `
      <h2>스케줄이 변경되었습니다</h2>
      <p>${user.name}님의 근무 스케줄이 변경되었습니다.</p>
      <p>날짜: ${schedule.date}</p>
      <p>시간: ${schedule.shiftStart} - ${schedule.shiftEnd}</p>
    `;

    return this.sendEmail(user.email, subject, content);
  }
}

module.exports = NotificationLib;
```

---

## Phase 4: Database Models (T021-T030) [P]

### T021: User 모델 생성 [P]
**파일**: `backend/src/models/User.js`, `backend/migrations/001_create_users.js`
**설명**: 사용자 테이블을 생성하고 모델을 구현합니다.
```javascript
// Migration
exports.up = function(knex) {
  return knex.schema.createTable('users', table => {
    table.increments('id').primary();
    table.string('email', 255).unique().notNullable();
    table.string('phone', 20).unique();
    table.string('password_hash', 255).notNullable();
    table.string('name', 100).notNullable();
    table.string('profile_image_url', 500);
    table.enum('status', ['active', 'inactive', 'suspended']).defaultTo('active');
    table.boolean('email_verified').defaultTo(false);
    table.boolean('phone_verified').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('last_login_at');

    table.index('email');
    table.index('phone');
    table.index('status');
  });
};

// Model
class User {
  constructor(db) {
    this.db = db;
  }

  async create(userData) {
    const result = await this.db('users').insert(userData).returning('*');
    return result[0];
  }

  async findByEmail(email) {
    return this.db('users').where({ email }).first();
  }

  async updateLastLogin(userId) {
    return this.db('users')
      .where({ id: userId })
      .update({ last_login_at: new Date() });
  }
}

module.exports = User;
```

### T022: Business 모델 생성 [P]
**파일**: `backend/src/models/Business.js`, `backend/migrations/002_create_businesses.js`
**설명**: 사업장 테이블을 생성하고 모델을 구현합니다.
```javascript
exports.up = function(knex) {
  return knex.raw('CREATE EXTENSION IF NOT EXISTS postgis')
    .then(() => {
      return knex.schema.createTable('businesses', table => {
        table.increments('id').primary();
        table.string('name', 100).notNullable();
        table.string('registration_number', 20).unique().notNullable();
        table.enum('business_type', ['개인사업자', '법인사업자']).notNullable();
        table.enum('industry_type', ['카페', '레스토랑', '바', '베이커리']);
        table.text('address').notNullable();
        table.specificType('location', 'POINT').notNullable();
        table.string('phone', 20);
        table.string('subscription_plan', 50).defaultTo('free');
        table.timestamp('subscription_expires_at');
        table.string('timezone', 50).defaultTo('Asia/Seoul');
        table.string('language', 10).defaultTo('ko');
        table.jsonb('settings').defaultTo('{}');
        table.timestamps(true, true);

        table.index('registration_number');
      });
    })
    .then(() => {
      return knex.raw('CREATE INDEX idx_businesses_location ON businesses USING GIST(location)');
    });
};
```

### T023: UserRole 모델 생성 [P]
**파일**: `backend/src/models/UserRole.js`, `backend/migrations/003_create_user_roles.js`
**설명**: 사용자-역할 매핑 테이블을 생성합니다.
```javascript
exports.up = function(knex) {
  return knex.schema.createTable('user_roles', table => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('business_id').references('id').inTable('businesses').onDelete('CASCADE');
    table.enum('role_type', ['owner', 'manager', 'worker', 'seeker']).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.jsonb('permissions').defaultTo('[]');
    table.timestamp('valid_from').defaultTo(knex.fn.now());
    table.timestamp('valid_until');
    table.timestamps(true, true);

    table.unique(['user_id', 'business_id', 'role_type']);
    table.index('user_id');
    table.index('business_id');
    table.index('role_type');

    // Seeker는 business_id가 null이어야 함
    table.check(`(role_type = 'seeker' AND business_id IS NULL) OR (role_type != 'seeker' AND business_id IS NOT NULL)`);
  });
};
```

### T024: Attendance 모델 생성 [P]
**파일**: `backend/src/models/Attendance.js`, `backend/migrations/004_create_attendances.js`
**설명**: 근태 기록 테이블을 생성합니다.
```javascript
exports.up = function(knex) {
  return knex.schema.createTable('attendances', table => {
    table.increments('id').primary();
    table.integer('business_id').notNullable().references('id').inTable('businesses');
    table.integer('user_id').notNullable().references('id').inTable('users');
    table.integer('user_role_id').notNullable().references('id').inTable('user_roles');
    table.date('date').notNullable();
    table.timestamp('check_in_time');
    table.specificType('check_in_location', 'POINT');
    table.string('check_in_method', 20);
    table.timestamp('check_out_time');
    table.specificType('check_out_location', 'POINT');
    table.string('check_out_method', 20);
    table.specificType('break_start_times', 'TIMESTAMP[]');
    table.specificType('break_end_times', 'TIMESTAMP[]');
    table.specificType('break_locations', 'POINT[]');
    table.enum('status', ['scheduled', 'checked_in', 'on_break', 'outside_work', 'checked_out']).defaultTo('scheduled');
    table.integer('total_work_minutes');
    table.integer('total_break_minutes');
    table.integer('overtime_minutes');
    table.text('notes');
    table.jsonb('anomalies').defaultTo('[]');
    table.timestamps(true, true);

    table.unique(['business_id', 'user_id', 'date']);
    table.index(['business_id', 'date']);
    table.index(['user_id', 'date']);
    table.index('status');
  });
};
```

### T025: Schedule 모델 생성 [P]
**파일**: `backend/src/models/Schedule.js`, `backend/migrations/005_create_schedules.js`
**설명**: 스케줄 테이블을 생성합니다.

### T026: ScheduleAssignment 모델 생성 [P]
**파일**: `backend/src/models/ScheduleAssignment.js`, `backend/migrations/006_create_schedule_assignments.js`
**설명**: 스케줄 할당 테이블을 생성합니다.

### T027: Document 모델 생성 [P]
**파일**: `backend/src/models/Document.js`, `backend/migrations/007_create_documents.js`
**설명**: 문서 관리 테이블을 생성합니다.

### T028: QRCode 모델 생성 [P]
**파일**: `backend/src/models/QRCode.js`, `backend/migrations/008_create_qr_codes.js`
**설명**: QR 코드 테이블을 생성합니다.

### T029: Notification 모델 생성 [P]
**파일**: `backend/src/models/Notification.js`, `backend/migrations/009_create_notifications.js`
**설명**: 알림 테이블을 생성합니다.

### T030: PayStatement 모델 생성 [P]
**파일**: `backend/src/models/PayStatement.js`, `backend/migrations/010_create_pay_statements.js`
**설명**: 급여명세서 테이블을 생성합니다.

---

## Phase 5: Services (T031-T036)

### T031: AuthService 구현
**파일**: `backend/src/services/AuthService.js`
**설명**: 인증 비즈니스 로직을 구현합니다. auth-lib를 활용합니다.
```javascript
const AuthLib = require('../lib/auth-lib');
const User = require('../models/User');
const UserRole = require('../models/UserRole');

class AuthService {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
    this.authLib = new AuthLib();
    this.userModel = new User(db);
    this.userRoleModel = new UserRole(db);
  }

  async register(userData) {
    // 트랜잭션으로 사용자 생성과 seeker 역할 생성
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // 비밀번호 해싱
      userData.password_hash = await this.authLib.hashPassword(userData.password);
      delete userData.password;

      // 사용자 생성
      const user = await this.userModel.create(userData);

      // Seeker 역할 자동 생성
      await this.userRoleModel.create({
        user_id: user.id,
        role_type: 'seeker'
      });

      await client.query('COMMIT');

      // 토큰 생성
      const accessToken = this.authLib.generateToken({ userId: user.id });
      const refreshToken = this.authLib.generateRefreshToken({ userId: user.id });

      // Redis에 리프레시 토큰 저장
      await this.redis.set(`refresh:${user.id}`, refreshToken, 'EX', 604800); // 7일

      return { user, accessToken, refreshToken };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async login(email, password) {
    const user = await this.userModel.findByEmail(email);
    if (!user) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
    }

    const isValid = await this.authLib.verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
    }

    await this.userModel.updateLastLogin(user.id);

    const roles = await this.userRoleModel.findByUserId(user.id);
    const accessToken = this.authLib.generateToken({ userId: user.id, roles });
    const refreshToken = this.authLib.generateRefreshToken({ userId: user.id });

    await this.redis.set(`refresh:${user.id}`, refreshToken, 'EX', 604800);

    return { user, roles, accessToken, refreshToken };
  }
}

module.exports = AuthService;
```

### T032: AttendanceService 구현
**파일**: `backend/src/services/AttendanceService.js`
**설명**: 근태 비즈니스 로직을 구현합니다. attendance-lib를 활용합니다.
```javascript
const AttendanceLib = require('../lib/attendance-lib');
const QRCodeService = require('./QRCodeService');
const NotificationLib = require('../lib/notification-lib');

class AttendanceService {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
    this.attendanceLib = new AttendanceLib();
    this.qrService = new QRCodeService(db);
    this.notificationLib = new NotificationLib();
  }

  async checkIn(userId, qrToken, location) {
    // QR 토큰 검증
    const qrData = await this.qrService.verifyQRToken(qrToken);

    // 사업장 위치 조회
    const business = await this.db('businesses')
      .where({ id: qrData.businessId })
      .first();

    // GPS 위치 검증
    this.attendanceLib.validateLocation(location, {
      lat: business.location.x,
      lng: business.location.y
    });

    // 출근 기록
    const attendance = await this.attendanceLib.recordCheckIn(
      this.db,
      userId,
      qrData.businessId,
      location
    );

    // Redis에 실시간 상태 업데이트
    await this.redis.hset(
      `attendance:${qrData.businessId}:${new Date().toISOString().split('T')[0]}`,
      userId,
      JSON.stringify({ status: 'checked_in', time: new Date() })
    );

    // WebSocket 브로드캐스트를 위한 이벤트 발행
    await this.redis.publish(
      `business:${qrData.businessId}:attendance`,
      JSON.stringify({
        type: 'check_in',
        userId,
        time: new Date()
      })
    );

    return attendance;
  }

  async checkOut(userId, businessId, location) {
    const today = new Date().toISOString().split('T')[0];

    // 오늘 출근 기록 확인
    const attendance = await this.db('attendances')
      .where({ user_id: userId, business_id: businessId, date: today })
      .first();

    if (!attendance || !attendance.check_in_time) {
      throw new Error('출근 기록이 없습니다');
    }

    // 퇴근 시간 업데이트
    const checkOutTime = new Date();
    const totalMinutes = Math.floor(
      (checkOutTime - new Date(attendance.check_in_time)) / 60000
    );

    await this.db('attendances')
      .where({ id: attendance.id })
      .update({
        check_out_time: checkOutTime,
        check_out_location: this.db.raw('POINT(?, ?)', [location.lat, location.lng]),
        status: 'checked_out',
        total_work_minutes: totalMinutes
      });

    // Redis 업데이트
    await this.redis.hset(
      `attendance:${businessId}:${today}`,
      userId,
      JSON.stringify({ status: 'checked_out', time: checkOutTime })
    );

    return { ...attendance, check_out_time: checkOutTime, total_work_minutes: totalMinutes };
  }
}

module.exports = AttendanceService;
```

### T033: ScheduleService 구현
**파일**: `backend/src/services/ScheduleService.js`
**설명**: 스케줄 관리 비즈니스 로직을 구현합니다.

### T034: PayrollService 구현
**파일**: `backend/src/services/PayrollService.js`
**설명**: 급여 계산 비즈니스 로직을 구현합니다.

### T035: DocumentService 구현
**파일**: `backend/src/services/DocumentService.js`
**설명**: 문서 관리 비즈니스 로직을 구현합니다.

### T036: QRCodeService 구현
**파일**: `backend/src/services/QRCodeService.js`
**설명**: QR 코드 생성 및 검증 로직을 구현합니다.

---

## Phase 6: API Endpoints (T037-T041)

### T037: Express 앱 설정 및 미들웨어
**파일**: `backend/src/app.js`
**설명**: Express 애플리케이션을 설정하고 미들웨어를 구성합니다.
```javascript
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./config/logger');

const app = express();

// 보안 미들웨어
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));

// 요청 로깅
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// API 라우트
app.use('/api/v1/auth', require('./api/auth'));
app.use('/api/v1/attendance', require('./api/attendance'));
app.use('/api/v1/schedules', require('./api/schedules'));
app.use('/api/v1/payroll', require('./api/payroll'));
app.use('/api/v1/documents', require('./api/documents'));

// 에러 핸들링
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(err.status || 500).json({
    code: err.code || 'INTERNAL_ERROR',
    message: err.message || '서버 오류가 발생했습니다'
  });
});

module.exports = app;
```

### T038: Auth API 엔드포인트 구현
**파일**: `backend/src/api/auth.js`
**설명**: 인증 관련 API 엔드포인트를 구현합니다.
```javascript
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const AuthService = require('../services/AuthService');

// 의존성 주입
const authService = new AuthService(db, redis);

// 회원가입
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  body('name').isLength({ min: 2, max: 50 }),
  body('phone').matches(/^010-\d{4}-\d{4}$/)
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// 로그인
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const result = await authService.login(req.body.email, req.body.password);
    res.json(result);
  } catch (error) {
    if (error.message.includes('올바르지 않습니다')) {
      res.status(401).json({ code: 'INVALID_CREDENTIALS', message: error.message });
    } else {
      next(error);
    }
  }
});

module.exports = router;
```

### T039: Attendance API 엔드포인트 구현
**파일**: `backend/src/api/attendance.js`
**설명**: 근태 관련 API 엔드포인트를 구현합니다.

### T040: Schedule API 엔드포인트 구현
**파일**: `backend/src/api/schedules.js`
**설명**: 스케줄 관련 API 엔드포인트를 구현합니다.

### T041: WebSocket 서버 구현
**파일**: `backend/src/websocket.js`
**설명**: 실시간 업데이트를 위한 WebSocket 서버를 구현합니다.

---

## Phase 7: Frontend (T042-T043)

### T042: React 컴포넌트 구현
**파일**: `frontend/src/components/`, `frontend/src/pages/`
**설명**: 로그인, 대시보드, 근태 관리 등 주요 컴포넌트를 구현합니다.

### T043: API 클라이언트 구현
**파일**: `frontend/src/services/api.js`
**설명**: Axios를 사용한 API 클라이언트를 구현합니다.

---

## Phase 8: Integration & E2E Tests (T044-T045)

### T044: 통합 테스트 작성
**파일**: `backend/tests/integration/`
**설명**: 전체 플로우에 대한 통합 테스트를 작성합니다.
```javascript
describe('Owner Workflow Integration', () => {
  let ownerToken, workerId, businessId;

  beforeAll(async () => {
    // 실제 DB 초기화
    await db.migrate.latest();
    await db.seed.run();

    // Owner 로그인
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@test.com', password: 'Test123!' });

    ownerToken = loginResponse.body.accessToken;
    businessId = loginResponse.body.roles[0].businessId;
  });

  test('Owner가 근로자를 추가하고 스케줄을 생성할 수 있다', async () => {
    // 1. 근로자 추가
    const workerResponse = await request(app)
      .post('/api/v1/workers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'newworker@test.com',
        name: '새근로자',
        phone: '010-9999-8888'
      });

    workerId = workerResponse.body.id;

    // 2. 스케줄 생성
    const scheduleResponse = await request(app)
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        businessId,
        startDate: '2025-09-16',
        endDate: '2025-09-22',
        assignments: [{
          userId: workerId,
          date: '2025-09-16',
          shiftStart: '09:00',
          shiftEnd: '18:00'
        }]
      });

    expect(scheduleResponse.status).toBe(201);

    // 3. 실제 DB 확인
    const schedule = await db('schedules').where({ business_id: businessId }).first();
    expect(schedule).toBeDefined();

    const assignment = await db('schedule_assignments').where({ user_role_id: workerId }).first();
    expect(assignment).toBeDefined();
  });
});
```

### T045: E2E 테스트 작성
**파일**: `frontend/tests/e2e/`
**설명**: Playwright를 사용한 E2E 테스트를 작성합니다.
```javascript
const { test, expect } = require('@playwright/test');

test.describe('근태 관리 E2E', () => {
  test('근로자가 QR 코드로 출퇴근을 기록할 수 있다', async ({ page }) => {
    // 로그인
    await page.goto('http://localhost:3001/login');
    await page.fill('[data-testid=email]', 'worker@test.com');
    await page.fill('[data-testid=password]', 'Test123!');
    await page.click('[data-testid=login-button]');

    // 대시보드 이동
    await expect(page).toHaveURL('http://localhost:3001/dashboard');

    // QR 스캔 버튼 클릭
    await page.click('[data-testid=scan-qr]');

    // QR 코드 시뮬레이션 (실제로는 카메라 사용)
    await page.evaluate(() => {
      window.postMessage({
        type: 'qr-scan',
        data: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
      });
    });

    // 출근 확인 메시지
    await expect(page.locator('[data-testid=status-message]')).toHaveText('출근이 완료되었습니다');

    // 실제 서버에 기록되었는지 확인
    const response = await page.request.get('/api/v1/attendance/today', {
      headers: {
        Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}`
      }
    });

    const attendance = await response.json();
    expect(attendance.status).toBe('checked_in');
  });
});
```

---

## Execution Guide

### 병렬 실행 가능한 작업 그룹

**Group 1 (Setup)**: T001-T006 순차 실행
```bash
# 각 작업을 순서대로 실행
npm run task:T001
npm run task:T002
# ...
```

**Group 2 (Infrastructure)**: T007-T010 순차 실행

**Group 3 (Contract Tests)**: T011-T014 병렬 실행 [P]
```bash
# Task agent로 병렬 실행
Task --parallel "contract-tests" \
  --task "T011: auth contract test" \
  --task "T012: attendance contract test" \
  --task "T013: schedule contract test" \
  --task "T014: payroll contract test"
```

**Group 4 (Libraries)**: T015-T020 병렬 실행 [P]
```bash
Task --parallel "core-libraries" \
  --task "T015: auth-lib" \
  --task "T016: attendance-lib" \
  --task "T017: schedule-lib" \
  --task "T018: payroll-lib" \
  --task "T019: document-lib" \
  --task "T020: notification-lib"
```

**Group 5 (Models)**: T021-T030 병렬 실행 [P]
```bash
Task --parallel "database-models" \
  --task "T021: User model" \
  --task "T022: Business model" \
  --task "T023: UserRole model" \
  # ... 나머지 모델들
```

**Group 6 (Services)**: T031-T036 순차 실행 (의존성 있음)

**Group 7 (API)**: T037-T041 순차 실행

**Group 8 (Frontend)**: T042-T043 순차 실행

**Group 9 (Tests)**: T044-T045 병렬 실행 [P]

### 예상 실행 시간
- Setup & Infrastructure: 2시간
- Contract Tests & Libraries: 4시간 (병렬 실행 시 2시간)
- Models: 3시간 (병렬 실행 시 30분)
- Services & API: 4시간
- Frontend: 3시간
- Integration Tests: 2시간
- **총 예상 시간**: 약 14시간 (병렬 실행 활용 시)

---

## Success Criteria

각 작업 완료 기준:
1. ✅ 코드가 작성되고 저장됨
2. ✅ 테스트가 작성되고 통과함 (TDD)
3. ✅ 실제 데이터베이스/서비스와 연동됨 (No mocks)
4. ✅ 라이브러리는 CLI 인터페이스 포함
5. ✅ 한글 주석 및 에러 메시지 포함

## Notes

- 모든 테스트는 실제 PostgreSQL과 Redis를 사용합니다
- Mock 객체나 스텁을 사용하지 않습니다
- 각 라이브러리는 독립적으로 실행 가능한 CLI를 제공합니다
- 데이터는 3년간 보존되며 자동 정리 스크립트가 포함됩니다
- GPS 위치는 50m 반경 내에서 검증됩니다
- 파일 업로드는 10MB로 제한됩니다

---
**생성일**: 2025-09-16
**작성자**: /tasks 명령
**검증**: 모든 작업은 TDD 원칙과 실제 구현 요구사항을 준수합니다