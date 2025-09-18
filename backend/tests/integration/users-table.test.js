/**
 * T016: Users 테이블 생성 마이그레이션 테스트 (실패 테스트 - RED)
 * T019: Users 테이블 RLS 정책 테스트
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

describe('Users Table Migration Tests', () => {
  let pool;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5434,
      database: process.env.TEST_DB_NAME || 'dot_platform_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres123',
    });

    // 마이그레이션 실행
    const migrationPath = path.join(__dirname, '../../src/db/migrations/001_create_users_table.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(migration);
  });

  afterAll(async () => {
    // 테스트 후 정리
    await pool.query('DROP TABLE IF EXISTS users CASCADE');
    await pool.end();
  });

  describe('Table Structure', () => {
    test('should create users table with all required columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map(row => row.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('email');
      expect(columns).toContain('password_hash');
      expect(columns).toContain('name');
      expect(columns).toContain('phone');
      expect(columns).toContain('profile_image_url');
      expect(columns).toContain('status');
      expect(columns).toContain('email_verified');
      expect(columns).toContain('phone_verified');
      expect(columns).toContain('last_login_at');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });

    test('should have unique constraints on email and phone', async () => {
      const result = await pool.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'users'
        AND constraint_type = 'UNIQUE'
      `);

      const constraints = result.rows.map(row => row.constraint_name);
      expect(constraints).toContain('users_email_key');
      expect(constraints).toContain('users_phone_key');
    });

    test('should have indexes on email, phone, status, and created_at', async () => {
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'users'
      `);

      const indexes = result.rows.map(row => row.indexname);
      expect(indexes).toContain('idx_users_email');
      expect(indexes).toContain('idx_users_phone');
      expect(indexes).toContain('idx_users_status');
      expect(indexes).toContain('idx_users_created_at');
    });
  });

  describe('CRUD Operations', () => {
    test('should insert a new user', async () => {
      const user = {
        email: `test_${Date.now()}@example.com`,
        password_hash: 'hashed_password',
        name: '테스트 사용자',
        phone: `010-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`
      };

      const result = await pool.query(
        `INSERT INTO users (email, password_hash, name, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [user.email, user.password_hash, user.name, user.phone]
      );

      expect(result.rows[0].id).toBeDefined();
      expect(result.rows[0].email).toBe(user.email);
      expect(result.rows[0].status).toBe('active');
      expect(result.rows[0].email_verified).toBe(false);
      expect(result.rows[0].created_at).toBeDefined();
    });

    test('should update user information', async () => {
      // 먼저 사용자 생성
      const user = {
        email: `update_test_${Date.now()}@example.com`,
        password_hash: 'hashed_password',
        name: '업데이트 테스트',
        phone: `010-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`
      };

      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, name, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [user.email, user.password_hash, user.name, user.phone]
      );

      const userId = insertResult.rows[0].id;
      const createdAt = insertResult.rows[0].created_at;

      // 1초 대기 (updated_at 변경 확인용)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 업데이트 실행
      const updateResult = await pool.query(
        `UPDATE users
         SET name = $1, email_verified = true
         WHERE id = $2
         RETURNING *`,
        ['업데이트된 이름', userId]
      );

      expect(updateResult.rows[0].name).toBe('업데이트된 이름');
      expect(updateResult.rows[0].email_verified).toBe(true);
      expect(new Date(updateResult.rows[0].updated_at)).toBeInstanceOf(Date);
      expect(updateResult.rows[0].updated_at).not.toEqual(createdAt);
    });
  });

  describe('Row Level Security', () => {
    test('should have RLS enabled on users table', async () => {
      const result = await pool.query(`
        SELECT relrowsecurity
        FROM pg_class
        WHERE relname = 'users'
      `);

      expect(result.rows[0].relrowsecurity).toBe(true);
    });

    test('should have RLS policies defined', async () => {
      const result = await pool.query(`
        SELECT policyname, cmd
        FROM pg_policies
        WHERE tablename = 'users'
        ORDER BY policyname
      `);

      const policies = result.rows.map(row => row.policyname);
      expect(policies).toContain('users_select_policy');
      expect(policies).toContain('users_update_policy');
      expect(policies).toContain('users_insert_policy');
      expect(policies).toContain('users_delete_policy');
    });
  });

  describe('Trigger Functions', () => {
    test('should automatically update updated_at on modification', async () => {
      const user = {
        email: `trigger_test_${Date.now()}@example.com`,
        password_hash: 'hashed_password',
        name: '트리거 테스트',
        phone: `010-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`
      };

      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, name, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id, updated_at`,
        [user.email, user.password_hash, user.name, user.phone]
      );

      const originalUpdatedAt = insertResult.rows[0].updated_at;

      // 짧은 대기 후 업데이트
      await new Promise(resolve => setTimeout(resolve, 100));

      const updateResult = await pool.query(
        `UPDATE users SET name = $1 WHERE id = $2 RETURNING updated_at`,
        ['변경된 이름', insertResult.rows[0].id]
      );

      const newUpdatedAt = updateResult.rows[0].updated_at;

      expect(new Date(newUpdatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });
  });
});