/**
 * T052: PostgreSQL 데이터베이스 연결 설정
 * 연결 풀을 사용한 효율적인 DB 연결 관리
 */

const { Pool } = require('pg');

// 데이터베이스 연결 풀 인스턴스
let pool = null;

/**
 * PostgreSQL 연결 풀 생성 및 초기화
 */
async function initDatabase() {
  if (pool) {
    return pool; // 이미 초기화된 경우 재사용
  }

  // 연결 설정
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5434, // Docker 컨테이너 포트
    database: process.env.DB_NAME || 'dot_platform_dev',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres123',

    // 연결 풀 설정
    max: 20, // 최대 연결 수
    idleTimeoutMillis: 30000, // 유휴 연결 타임아웃
    connectionTimeoutMillis: 2000, // 연결 타임아웃
  };

  // 테스트 환경에서는 별도 데이터베이스 사용
  if (process.env.NODE_ENV === 'test') {
    config.database = process.env.DB_TEST_NAME || 'dot_platform_test';
  }

  try {
    pool = new Pool(config);

    // 연결 테스트
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    // 연결 풀 이벤트 핸들러
    pool.on('error', (err) => {
      console.error('❌ PostgreSQL 풀 에러:', err);
      process.exit(-1);
    });

    pool.on('connect', () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔗 새 PostgreSQL 연결 생성됨');
      }
    });

    pool.on('remove', () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔌 PostgreSQL 연결 제거됨');
      }
    });

    return pool;
  } catch (error) {
    console.error('❌ PostgreSQL 연결 실패:', error);
    throw error;
  }
}

/**
 * 데이터베이스 쿼리 실행 헬퍼
 * @param {string} text - SQL 쿼리
 * @param {Array} params - 쿼리 파라미터
 * @returns {Promise<Object>} 쿼리 결과
 */
async function query(text, params) {
  if (!pool) {
    await initDatabase();
  }

  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 쿼리 실행:', {
      text: text.substring(0, 100),
      duration: `${duration}ms`,
      rows: res.rowCount
    });
  }

  return res;
}

/**
 * 트랜잭션용 클라이언트 가져오기
 * T132: 체크인 컨트롤러를 위한 추가
 */
query.getClient = async function() {
  if (!pool) {
    await initDatabase();
  }
  return pool.connect();
};

/**
 * 트랜잭션 실행 헬퍼
 * @param {Function} callback - 트랜잭션 내에서 실행할 함수
 * @returns {Promise<any>} 트랜잭션 결과
 */
async function transaction(callback) {
  if (!pool) {
    await initDatabase();
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 연결 풀 종료
 */
async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ PostgreSQL 연결 풀 종료됨');
  }
}

/**
 * 데이터베이스 헬스 체크
 */
async function checkDatabaseHealth() {
  try {
    const result = await query('SELECT 1 as health');
    return { healthy: true, timestamp: new Date().toISOString() };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  initDatabase,
  query,
  transaction,
  closeDatabase,
  checkDatabaseHealth,
  getPool: () => pool,
  get pool() {
    if (!pool) {
      // 동기적으로 연결 풀을 초기화해야 하는 경우를 위해
      throw new Error('Database pool not initialized. Call initDatabase() first.');
    }
    return pool;
  }
};