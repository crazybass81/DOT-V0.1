/**
 * T051: Express 애플리케이션 설정
 * DOT Platform 백엔드 메인 애플리케이션
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const { Pool } = require('pg');
const redis = require('redis');
const UserService = require('./services/user.service');

// 환경 변수 로드
require('dotenv').config();

// Express 앱 생성
const app = express();

// PostgreSQL 연결 풀 설정
const pgPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || (process.env.NODE_ENV === 'test' ? 5435 : 5434),
  database: process.env.DB_NAME || (process.env.NODE_ENV === 'test' ? 'dot_platform_test' : 'dot_platform_dev'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  max: 20, // 최대 연결 수
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis 클라이언트 설정
const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) => {
      if (retries > 10) return false;
      return Math.min(retries * 100, 3000);
    }
  }
});

// Redis 연결
redisClient.connect().catch(console.error);

// Redis 에러 핸들링
redisClient.on('error', (err) => {
  console.error('Redis 클라이언트 에러:', err);
});

// 앱 레벨에서 DB 연결과 서비스 저장
app.set('pgPool', pgPool);
app.set('redisClient', redisClient);

// UserService 초기화
const userService = new UserService(pgPool, redisClient);
app.set('userService', userService);

/**
 * 보안 미들웨어
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

/**
 * CORS 설정
 */
const corsOptions = {
  origin: function (origin, callback) {
    // 개발 환경에서는 모든 origin 허용
    if (process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      // 프로덕션에서는 허용된 도메인만
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

/**
 * 요청 파싱 미들웨어
 */
app.use(express.json({ limit: '10mb' })); // 문서 업로드를 위한 10MB 제한
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * 압축 미들웨어
 */
app.use(compression());

/**
 * 로깅 미들웨어
 */
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

/**
 * 신뢰할 프록시 설정 (로드밸런서 뒤에서 실행 시)
 */
app.set('trust proxy', 1);

/**
 * 헬스체크 엔드포인트
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * API 라우트 등록
 */
app.use('/api', require('./routes'));

// 개별 라우트 (추후 routes/index.js로 이동 예정)
// app.use('/api/v1/auth', require('./routes/auth'));

/**
 * 에러 핸들링 설정 (404 포함)
 */
const { setupErrorHandling } = require('./middleware/errorHandler');
setupErrorHandling(app);

/**
 * 정상 종료 처리
 */
process.on('SIGTERM', async () => {
  console.log('SIGTERM 신호 수신, 정상 종료 시작...');

  // Redis 연결 종료
  if (redisClient) {
    await redisClient.quit();
    console.log('Redis 연결 종료');
  }

  // PostgreSQL 연결 풀 종료
  if (pgPool) {
    await pgPool.end();
    console.log('PostgreSQL 연결 풀 종료');
  }

  process.exit(0);
});

// 테스트 환경을 위한 export
if (process.env.NODE_ENV === 'test') {
  app.pgPool = pgPool;
  app.redisClient = redisClient;
}

module.exports = app;