/**
 * PostgreSQL 데이터베이스 연결 및 설정
 * PostGIS 확장과 연결 풀 관리를 포함한 데이터베이스 클라이언트
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// 환경별 데이터베이스 설정
const isTestEnv = process.env.NODE_ENV === 'test';
const dbName = isTestEnv ? process.env.TEST_DB_NAME : process.env.DB_NAME;

// 연결 풀 설정
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5434,
  database: dbName || 'dot_platform_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,

  // 연결 풀 크기 설정
  max: parseInt(process.env.DB_POOL_MAX) || 20, // 최대 연결 수
  min: parseInt(process.env.DB_POOL_MIN) || 5,  // 최소 연결 수

  // 타임아웃 설정
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000, // 유휴 연결 타임아웃
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000, // 연결 시도 타임아웃

  // 쿼리 타임아웃 설정
  query_timeout: 30000, // 30초
  statement_timeout: 60000, // 1분

  // 연결 재시도 설정
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,

  // 애플리케이션 이름 (로그에서 식별용)
  application_name: `dot-platform-${process.env.NODE_ENV || 'development'}`
};

// PostgreSQL 연결 풀 생성
const pool = new Pool(poolConfig);

// 연결 풀 상태 추적
let isConnected = false;
let connectionRetries = 0;
const maxRetries = 5;

/**
 * 데이터베이스 연결 초기화 및 확인
 */
async function initializeDatabase() {
  try {
    logger.info('데이터베이스 연결 초기화 중...');

    // 연결 테스트
    const client = await pool.connect();

    // PostGIS 확장 확인
    const result = await client.query(`
      SELECT EXISTS(
        SELECT 1 FROM pg_extension WHERE extname = 'postgis'
      ) as postgis_installed
    `);

    if (!result.rows[0].postgis_installed) {
      logger.warn('PostGIS 확장이 설치되지 않았습니다. 위치 기능에 영향이 있을 수 있습니다.');
    } else {
      logger.info('PostGIS 확장이 정상적으로 설치되어 있습니다.');
    }

    // 데이터베이스 버전 확인
    const versionResult = await client.query('SELECT version()');
    logger.info(`PostgreSQL 버전: ${versionResult.rows[0].version.split(' ')[1]}`);

    client.release();
    isConnected = true;
    connectionRetries = 0;

    logger.info(`데이터베이스 연결 성공: ${dbName}@${poolConfig.host}:${poolConfig.port}`);

  } catch (error) {
    isConnected = false;
    connectionRetries++;

    logger.error('데이터베이스 연결 실패:', {
      error: error.message,
      host: poolConfig.host,
      port: poolConfig.port,
      database: dbName,
      retries: connectionRetries
    });

    // 재연결 시도
    if (connectionRetries < maxRetries) {
      const delay = Math.min(connectionRetries * 2000, 10000); // 최대 10초
      logger.info(`${delay}ms 후 데이터베이스 재연결 시도...`);

      setTimeout(async () => {
        await initializeDatabase();
      }, delay);
    } else {
      logger.error('데이터베이스 연결 재시도 횟수 초과. 애플리케이션이 종료됩니다.');
      process.exit(1);
    }

    throw error;
  }
}

/**
 * 쿼리 실행 헬퍼 (로깅 및 에러 처리 포함)
 */
async function query(text, params = []) {
  const start = Date.now();
  const client = await pool.connect();

  try {
    // SQL 디버깅이 활성화된 경우 쿼리 로깅
    if (process.env.DEBUG_SQL === 'true') {
      logger.debug('SQL 쿼리 실행:', {
        query: text,
        params: params
      });
    }

    const result = await client.query(text, params);
    const duration = Date.now() - start;

    // 성능 모니터링이 활성화된 경우 실행 시간 로깅
    if (process.env.DEBUG_API_TIMING === 'true' && duration > 1000) {
      logger.warn('느린 쿼리 감지:', {
        query: text.substring(0, 100) + '...',
        duration: `${duration}ms`,
        rows: result.rowCount
      });
    }

    return result;

  } catch (error) {
    const duration = Date.now() - start;
    logger.error('SQL 쿼리 에러:', {
      query: text.substring(0, 100) + '...',
      params: params,
      duration: `${duration}ms`,
      error: error.message
    });

    throw error;
  } finally {
    client.release();
  }
}

/**
 * 트랜잭션 실행 헬퍼
 */
async function transaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await callback(client);

    await client.query('COMMIT');
    return result;

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('트랜잭션 롤백:', {
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 배치 삽입 헬퍼 (성능 최적화)
 */
async function batchInsert(tableName, columns, values) {
  if (!values.length) return { rowCount: 0 };

  const columnNames = columns.join(', ');
  const placeholders = values
    .map((_, rowIndex) =>
      `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`
    )
    .join(', ');

  const flatValues = values.flat();
  const queryText = `INSERT INTO ${tableName} (${columnNames}) VALUES ${placeholders}`;

  return await query(queryText, flatValues);
}

/**
 * 데이터베이스 연결 상태 확인
 */
function isDbConnected() {
  return isConnected && pool.totalCount > 0;
}

/**
 * 연결 풀 통계 정보
 */
function getPoolStats() {
  return {
    totalCount: pool.totalCount,      // 총 연결 수
    idleCount: pool.idleCount,        // 유휴 연결 수
    waitingCount: pool.waitingCount,  // 대기 중인 요청 수
    isConnected: isConnected
  };
}

/**
 * 데이터베이스 건강 체크
 */
async function healthCheck() {
  try {
    const result = await query('SELECT 1 as health_check');
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbName,
      response_time: 'normal',
      pool_stats: getPoolStats()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: dbName,
      error: error.message,
      pool_stats: getPoolStats()
    };
  }
}

/**
 * 우아한 종료 처리
 */
async function gracefulShutdown() {
  logger.info('데이터베이스 연결 종료 중...');

  try {
    await pool.end();
    logger.info('모든 데이터베이스 연결이 종료되었습니다.');
  } catch (error) {
    logger.error('데이터베이스 연결 종료 중 오류:', error);
  }
}

// 연결 풀 이벤트 핸들러
pool.on('connect', (client) => {
  logger.debug('새 데이터베이스 클라이언트 연결됨');
});

pool.on('remove', (client) => {
  logger.debug('데이터베이스 클라이언트 제거됨');
});

pool.on('error', (err, client) => {
  logger.error('예상치 못한 데이터베이스 클라이언트 에러:', err);
  isConnected = false;
});

// 프로세스 종료 시 우아한 종료
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// 애플리케이션 시작 시 데이터베이스 초기화
if (process.env.NODE_ENV !== 'test') {
  initializeDatabase().catch(() => {
    logger.error('데이터베이스 초기화 실패');
  });
}

module.exports = {
  pool,
  query,
  transaction,
  batchInsert,
  initializeDatabase,
  isConnected: isDbConnected,
  getPoolStats,
  healthCheck,
  gracefulShutdown
};