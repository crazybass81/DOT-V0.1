/**
 * T127: 테스트 환경 구성 - 글로벌 설정
 * Playwright E2E 테스트 전역 초기화
 * 데이터베이스 시드, 서버 준비 상태 확인
 */

const { Pool } = require('pg');
const { createClient } = require('redis');

/**
 * 글로벌 설정 함수
 * 모든 테스트 시작 전 한 번 실행
 */
async function globalSetup(config) {
  console.log('🚀 E2E 테스트 환경 초기화 시작...');

  // 환경 변수 설정
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/dot_platform_test';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    // 데이터베이스 연결 확인
    await checkDatabaseConnection();

    // Redis 연결 확인
    await checkRedisConnection();

    // 테스트 데이터베이스 초기화
    await initializeTestDatabase();

    // 테스트 데이터 시드
    await seedTestData();

    console.log('✅ E2E 테스트 환경 초기화 완료');

  } catch (error) {
    console.error('❌ E2E 테스트 환경 초기화 실패:', error);
    throw error;
  }
}

/**
 * 데이터베이스 연결 확인
 */
async function checkDatabaseConnection() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('📊 PostgreSQL 연결 확인:', result.rows[0].now);
    client.release();
  } catch (error) {
    console.error('❌ PostgreSQL 연결 실패:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Redis 연결 확인
 */
async function checkRedisConnection() {
  const redis = createClient({
    url: process.env.REDIS_URL
  });

  try {
    await redis.connect();
    await redis.ping();
    console.log('🔑 Redis 연결 확인 완료');
  } catch (error) {
    console.error('❌ Redis 연결 실패:', error);
    throw error;
  } finally {
    await redis.disconnect();
  }
}

/**
 * 테스트 데이터베이스 초기화
 * 깨끗한 상태로 만들고 스키마 적용
 */
async function initializeTestDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    const client = await pool.connect();

    // 기존 데이터 정리 (테스트 계정만)
    await client.query(`
      DELETE FROM documents WHERE owner_id >= 9000;
      DELETE FROM attendance WHERE user_id >= 9000;
      DELETE FROM user_roles WHERE user_id >= 9000;
      DELETE FROM businesses WHERE owner_id >= 9000;
      DELETE FROM users WHERE id >= 9000;
    `);

    // RLS 정책 활성화 확인
    await client.query('SET row_security = on');

    console.log('🧹 테스트 데이터베이스 초기화 완료');
    client.release();

  } catch (error) {
    console.error('❌ 테스트 데이터베이스 초기화 실패:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * 테스트 데이터 시드
 * E2E 테스트에 필요한 기본 데이터 생성
 */
async function seedTestData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    const client = await pool.connect();

    // 1. 테스트 사용자 생성
    await client.query(`
      INSERT INTO users (id, name, email, phone, password_hash, status)
      VALUES
        (9001, 'E2E 사업주', 'owner@e2e.test', '010-0001-0001', '$2b$10$dummy.hash.for.e2e.testing', 'active'),
        (9002, 'E2E 관리자', 'admin@e2e.test', '010-0002-0002', '$2b$10$dummy.hash.for.e2e.testing', 'active'),
        (9003, 'E2E 직원', 'worker@e2e.test', '010-0003-0003', '$2b$10$dummy.hash.for.e2e.testing', 'active'),
        (9004, 'E2E 구직자', 'seeker@e2e.test', '010-0004-0004', '$2b$10$dummy.hash.for.e2e.testing', 'active')
      ON CONFLICT (id) DO NOTHING
    `);

    // 2. 테스트 사업장 생성
    await client.query(`
      INSERT INTO businesses (id, owner_id, name, registration_number, business_type, industry_type, address, phone, email, status, location, gps_radius_meters)
      VALUES (
        9001, 9001, 'E2E 테스트 카페', '123-45-67890', 'corporation', 'food_service',
        '서울시 강남구 테스트로 123', '02-0001-0001', 'test@cafe.e2e', 'active',
        ST_SetSRID(ST_MakePoint(127.0276, 37.4979), 4326), 50
      )
      ON CONFLICT (id) DO NOTHING
    `);

    // 3. 테스트 사용자 역할 생성
    await client.query(`
      INSERT INTO user_roles (user_id, business_id, role, permissions, is_active)
      VALUES
        (9001, 9001, 'owner', '{"all": true}', true),
        (9002, 9001, 'admin', '{"manage_staff": true, "view_reports": true}', true),
        (9003, 9001, 'worker', '{"clock_in": true, "view_schedule": true}', true)
      ON CONFLICT (user_id, business_id) DO NOTHING
    `);

    // 4. 테스트 스케줄 생성 (오늘)
    const today = new Date().toISOString().split('T')[0];
    await client.query(`
      INSERT INTO schedules (id, business_id, title, start_date, end_date, start_time, end_time, description, created_by)
      VALUES (
        9001, 9001, 'E2E 테스트 근무', $1, $1, '09:00:00', '18:00:00',
        'E2E 테스트용 스케줄', 9001
      )
      ON CONFLICT (id) DO NOTHING
    `, [today]);

    // 5. 스케줄 할당
    await client.query(`
      INSERT INTO schedule_assignments (schedule_id, user_id, status)
      VALUES (9001, 9003, 'approved')
      ON CONFLICT (schedule_id, user_id) DO NOTHING
    `);

    console.log('🌱 테스트 데이터 시드 완료');
    client.release();

  } catch (error) {
    console.error('❌ 테스트 데이터 시드 실패:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * 서버 준비 상태 확인
 * 백엔드와 프론트엔드 서버가 응답하는지 확인
 */
async function waitForServers() {
  const backendUrl = 'http://localhost:3001/health';
  const frontendUrl = 'http://localhost:3000';

  console.log('⏳ 서버 준비 상태 확인 중...');

  // 백엔드 서버 확인
  await waitForUrl(backendUrl, '백엔드');

  // 프론트엔드 서버 확인
  await waitForUrl(frontendUrl, '프론트엔드');

  console.log('🚀 모든 서버 준비 완료');
}

/**
 * URL 응답 대기 함수
 */
async function waitForUrl(url, name, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const fetch = require('node-fetch');
      const response = await fetch(url);
      if (response.ok) {
        console.log(`✅ ${name} 서버 준비 완료: ${url}`);
        return;
      }
    } catch (error) {
      // 연결 실패는 예상됨, 재시도
    }

    console.log(`⏳ ${name} 서버 대기 중... (${i + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(`${name} 서버가 준비되지 않았습니다: ${url}`);
}

module.exports = globalSetup;