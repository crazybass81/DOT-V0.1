/**
 * T124: 에러 핸들링 미들웨어 테스트
 * 실제 Express 앱으로 테스트 (Mock 없음)
 */

const express = require('express');
const request = require('supertest');
const {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  setupErrorHandling,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
} = require('../../src/middleware/errorHandler');
const { pool } = require('../../src/config/database');

describe('에러 핸들링 미들웨어', () => {
  let app;
  let server;

  beforeEach(async () => {
    // 테스트용 Express 앱 생성
    app = express();
    app.use(express.json());

    // 테스트 라우트들 설정
    app.get('/test/success', (req, res) => {
      res.json({ success: true });
    });

    app.get('/test/validation-error', (req, res, next) => {
      next(new ValidationError('Invalid input', {
        email: 'Email is required',
        password: 'Password must be at least 8 characters'
      }));
    });

    app.get('/test/unauthorized', (req, res, next) => {
      next(new UnauthorizedError('Authentication required'));
    });

    app.get('/test/forbidden', (req, res, next) => {
      next(new ForbiddenError('Access denied'));
    });

    app.get('/test/not-found', (req, res, next) => {
      next(new NotFoundError('User not found'));
    });

    app.get('/test/conflict', (req, res, next) => {
      next(new ConflictError('Email already exists'));
    });

    app.get('/test/generic-error', (req, res, next) => {
      next(new Error('Something went wrong'));
    });

    app.get('/test/async-error', asyncHandler(async (req, res, next) => {
      throw new Error('Async operation failed');
    }));

    app.get('/test/syntax-error', (req, res, next) => {
      const error = new SyntaxError('Invalid JSON');
      next(error);
    });

    // 에러 핸들링 설정
    setupErrorHandling(app);

    // 에러 로그 테이블 생성
    await pool.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        stack TEXT,
        status_code INTEGER DEFAULT 500,
        method VARCHAR(10),
        url TEXT,
        ip_address INET,
        user_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {}); // 테이블이 이미 있으면 무시
  });

  afterEach(async () => {
    // 테스트 데이터 정리
    await pool.query('DELETE FROM error_logs').catch(() => {});
  });

  afterAll(async () => {
    // 데이터베이스 연결 종료
    await pool.end();
  });

  describe('커스텀 에러 처리', () => {
    test('ValidationError - 400 응답', async () => {
      const response = await request(app)
        .get('/test/validation-error');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Invalid input',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          fields: {
            email: 'Email is required',
            password: 'Password must be at least 8 characters'
          }
        }
      });
    });

    test('UnauthorizedError - 401 응답', async () => {
      const response = await request(app)
        .get('/test/unauthorized');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'UNAUTHORIZED',
          statusCode: 401
        }
      });
    });

    test('ForbiddenError - 403 응답', async () => {
      const response = await request(app)
        .get('/test/forbidden');

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Access denied',
          code: 'FORBIDDEN',
          statusCode: 403
        }
      });
    });

    test('NotFoundError - 404 응답', async () => {
      const response = await request(app)
        .get('/test/not-found');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'User not found',
          code: 'NOT_FOUND',
          statusCode: 404
        }
      });
    });

    test('ConflictError - 409 응답', async () => {
      const response = await request(app)
        .get('/test/conflict');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Email already exists',
          code: 'CONFLICT',
          statusCode: 409
        }
      });
    });
  });

  describe('일반 에러 처리', () => {
    test('일반 Error - 500 응답', async () => {
      const response = await request(app)
        .get('/test/generic-error');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Something went wrong');
      expect(response.body.error.statusCode).toBe(500);
    });

    test('비동기 에러 - asyncHandler로 처리', async () => {
      const response = await request(app)
        .get('/test/async-error');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Async operation failed');
    });

    test('SyntaxError - 400 응답', async () => {
      const response = await request(app)
        .get('/test/syntax-error');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Invalid JSON');
    });
  });

  describe('404 처리', () => {
    test('존재하지 않는 라우트 - 404 응답', async () => {
      const response = await request(app)
        .get('/non-existent-route');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Cannot GET /non-existent-route',
          code: 'ROUTE_NOT_FOUND',
          statusCode: 404
        }
      });
    });

    test('POST 메서드 404', async () => {
      const response = await request(app)
        .post('/non-existent-route')
        .send({ test: 'data' });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Cannot POST /non-existent-route');
    });
  });

  describe('에러 로깅', () => {
    test('에러가 데이터베이스에 로깅됨', async () => {
      // 에러 발생
      await request(app)
        .get('/test/validation-error');

      // 로그 확인 (약간의 지연 허용)
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await pool.query(
        'SELECT * FROM error_logs WHERE message = $1',
        ['Invalid input']
      );

      expect(result.rows.length).toBeGreaterThan(0);
      const log = result.rows[0];
      expect(log.message).toBe('Invalid input');
      expect(log.status_code).toBe(400);
      expect(log.method).toBe('GET');
      expect(log.url).toBe('/test/validation-error');
    });
  });

  describe('개발/프로덕션 모드', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('개발 모드 - 스택 트레이스 포함', async () => {
      process.env.NODE_ENV = 'development';

      const response = await request(app)
        .get('/test/generic-error');

      expect(response.status).toBe(500);
      expect(response.body.error.stack).toBeDefined();
      expect(response.body.error.stack).toContain('Error: Something went wrong');
    });

    test('프로덕션 모드 - 스택 트레이스 제외', async () => {
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .get('/test/generic-error');

      expect(response.status).toBe(500);
      expect(response.body.error.stack).toBeUndefined();
    });
  });
});

describe('asyncHandler 유틸리티', () => {
  test('비동기 함수의 에러를 자동으로 처리', async () => {
    const app = express();

    app.get('/async-test', asyncHandler(async (req, res) => {
      await new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Async error')), 10);
      });
    }));

    app.use(errorHandler);

    const response = await request(app)
      .get('/async-test');

    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe('Async error');
  });

  test('정상 비동기 응답 처리', async () => {
    const app = express();

    app.get('/async-success', asyncHandler(async (req, res) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      res.json({ success: true, data: 'async result' });
    }));

    app.use(errorHandler);

    const response = await request(app)
      .get('/async-success');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: 'async result'
    });
  });
});