/**
 * T150: RLS 정책 마이그레이션 실행 스크립트
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function runRLSMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5434,
    database: process.env.DB_NAME || 'dot_platform_dev',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres123'
  });

  try {
    const migrationFile = path.join(__dirname, 'migrations/008_add_schedule_rls_policies.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('RLS 정책 마이그레이션 실행 중...');
    await pool.query(sql);
    console.log('✅ RLS 정책 적용 성공!');

    // RLS 정책 확인
    const result = await pool.query(`
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual IS NOT NULL as has_using,
        with_check IS NOT NULL as has_with_check
      FROM pg_policies
      WHERE tablename LIKE 'schedule%'
      ORDER BY tablename, policyname
    `);

    console.log('\n적용된 RLS 정책:');
    console.log('테이블명 | 정책명 | 명령 | USING | WITH CHECK');
    console.log('---------|--------|-------|-------|------------');
    result.rows.forEach(row => {
      console.log(`${row.tablename} | ${row.policyname} | ${row.cmd} | ${row.has_using ? '✓' : '✗'} | ${row.has_with_check ? '✓' : '✗'}`);
    });

    // RLS 활성화 상태 확인
    const rlsStatus = await pool.query(`
      SELECT
        tablename,
        rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename LIKE 'schedule%'
      ORDER BY tablename
    `);

    console.log('\nRLS 활성화 상태:');
    rlsStatus.rows.forEach(row => {
      console.log(`  ${row.tablename}: ${row.rowsecurity ? '✅ 활성화' : '❌ 비활성화'}`);
    });

  } catch (error) {
    console.error('❌ RLS 마이그레이션 실패:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runRLSMigration();