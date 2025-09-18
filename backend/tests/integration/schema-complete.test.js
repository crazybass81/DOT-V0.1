/**
 * Phase 1 완료 테스트: 모든 테이블과 관계 검증
 * T016-T030 통합 테스트
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

describe('Complete Schema Integration Tests', () => {
  let pool;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5434,
      database: process.env.TEST_DB_NAME || 'dot_platform_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres123',
    });

    // 기존 테이블 삭제
    await pool.query('DROP TABLE IF EXISTS user_roles CASCADE');
    await pool.query('DROP TABLE IF EXISTS businesses CASCADE');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');

    // 마이그레이션 순서대로 실행
    const migrations = [
      '001_create_users_table.sql',
      '002_create_businesses_table.sql',
      '003_create_user_roles_table.sql'
    ];

    for (const migrationFile of migrations) {
      const migrationPath = path.join(__dirname, '../../src/db/migrations', migrationFile);
      const migration = fs.readFileSync(migrationPath, 'utf8');
      await pool.query(migration);
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Complete Workflow Test', () => {
    let userId;
    let businessId;

    test('should create a user and automatically assign Seeker role', async () => {
      // 사용자 생성
      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, name, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [`owner_${Date.now()}@test.com`, 'hashed_pw', '김사장', '010-1111-2222']
      );

      userId = userResult.rows[0].id;
      expect(userId).toBeDefined();

      // Seeker 역할 자동 부여 확인
      const roleResult = await pool.query(
        `SELECT role_type, is_active FROM user_roles WHERE user_id = $1`,
        [userId]
      );

      expect(roleResult.rows[0].role_type).toBe('seeker');
      expect(roleResult.rows[0].is_active).toBe(true);
    });

    test('should create a business with PostGIS location', async () => {
      // 사업장 생성
      const businessResult = await pool.query(
        `INSERT INTO businesses (
          owner_id, name, registration_number, business_type,
          industry_type, address, location, gps_radius_meters
        ) VALUES ($1, $2, $3, $4, $5, $6, ST_MakePoint($7, $8)::geography, $9)
        RETURNING id, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat`,
        [
          userId,
          '테스트 카페',
          `123-45-${Date.now().toString().substr(-5)}`,
          '개인사업자',
          '카페',
          '서울시 강남구 테헤란로 123',
          126.9780,  // 경도
          37.5665,   // 위도
          50
        ]
      );

      businessId = businessResult.rows[0].id;
      expect(businessId).toBeDefined();
      expect(businessResult.rows[0].lng).toBeCloseTo(126.9780, 4);
      expect(businessResult.rows[0].lat).toBeCloseTo(37.5665, 4);
    });

    test('should update user role from Seeker to Owner for the business', async () => {
      // Owner 역할 추가
      await pool.query(
        `INSERT INTO user_roles (user_id, business_id, role_type, is_active)
         VALUES ($1, $2, 'owner', true)`,
        [userId, businessId]
      );

      // Seeker 역할 비활성화
      await pool.query(
        `UPDATE user_roles
         SET is_active = false
         WHERE user_id = $1 AND role_type = 'seeker'`,
        [userId]
      );

      // 활성 역할 확인
      const activeRoles = await pool.query(
        `SELECT * FROM get_user_active_roles($1)`,
        [userId]
      );

      expect(activeRoles.rows.length).toBe(1);
      expect(activeRoles.rows[0].role_type).toBe('owner');
      expect(activeRoles.rows[0].business_id).toBe(businessId);
    });

    test('should test GPS distance checking with PostGIS', async () => {
      const businessLocation = await pool.query(
        `SELECT location FROM businesses WHERE id = $1`,
        [businessId]
      );

      // 근처 위치 (30m 떨어진 곳)
      const nearbyCheck = await pool.query(
        `SELECT check_gps_distance($1, ST_MakePoint($2, $3)::geography, $4) as is_within`,
        [
          businessLocation.rows[0].location,
          126.9781,  // 약간 동쪽
          37.5666,   // 약간 북쪽
          50  // 50m 반경
        ]
      );

      expect(nearbyCheck.rows[0].is_within).toBe(true);

      // 먼 위치 (100m 이상)
      const farCheck = await pool.query(
        `SELECT check_gps_distance($1, ST_MakePoint($2, $3)::geography, $4) as is_within`,
        [
          businessLocation.rows[0].location,
          126.9800,  // 더 멀리
          37.5680,   // 더 멀리
          50  // 50m 반경
        ]
      );

      expect(farCheck.rows[0].is_within).toBe(false);
    });

    test('should find nearby businesses', async () => {
      // 사용자 위치에서 근처 사업장 찾기
      const nearbyResult = await pool.query(
        `SELECT * FROM find_nearby_businesses($1, $2, $3)`,
        [37.5665, 126.9780, 100]  // 위도, 경도, 반경 100m
      );

      expect(nearbyResult.rows.length).toBeGreaterThan(0);
      expect(nearbyResult.rows[0].business_id).toBe(businessId);
      expect(nearbyResult.rows[0].distance_meters).toBeLessThan(10);  // 매우 가까움
    });

    test('should add a worker to the business', async () => {
      // 새 worker 사용자 생성
      const workerResult = await pool.query(
        `INSERT INTO users (email, password_hash, name, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [`worker_${Date.now()}@test.com`, 'hashed_pw', '김알바', '010-3333-4444']
      );

      const workerId = workerResult.rows[0].id;

      // Worker 역할 부여
      await pool.query(
        `INSERT INTO user_roles (user_id, business_id, role_type, is_active, created_by)
         VALUES ($1, $2, 'worker', true, $3)`,
        [workerId, businessId, userId]
      );

      // Worker 역할 확인
      const workerRole = await pool.query(
        `SELECT * FROM user_roles
         WHERE user_id = $1 AND business_id = $2 AND role_type = 'worker'`,
        [workerId, businessId]
      );

      expect(workerRole.rows[0].is_active).toBe(true);
      expect(workerRole.rows[0].created_by).toBe(userId);
    });
  });

  describe('RLS Policy Tests', () => {
    test('should enforce RLS policies on all tables', async () => {
      // 모든 테이블의 RLS 활성화 확인
      const rlsCheck = await pool.query(`
        SELECT tablename, relrowsecurity
        FROM pg_tables t
        JOIN pg_class c ON c.relname = t.tablename
        WHERE schemaname = 'public'
        AND tablename IN ('users', 'businesses', 'user_roles')
      `);

      rlsCheck.rows.forEach(row => {
        expect(row.relrowsecurity).toBe(true);
      });
    });
  });

  describe('Foreign Key Constraints', () => {
    test('should enforce foreign key constraints', async () => {
      // 존재하지 않는 사용자로 사업장 생성 시도
      await expect(
        pool.query(
          `INSERT INTO businesses (owner_id, name, registration_number, business_type, industry_type, address, location)
           VALUES (99999, 'Test', '999-99-99999', '개인사업자', '카페', 'Test', ST_MakePoint(0, 0)::geography)`
        )
      ).rejects.toThrow();

      // 존재하지 않는 사업장으로 역할 생성 시도
      await expect(
        pool.query(
          `INSERT INTO user_roles (user_id, business_id, role_type)
           VALUES (1, 99999, 'worker')`
        )
      ).rejects.toThrow();
    });
  });
});