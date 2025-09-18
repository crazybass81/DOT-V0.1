/**
 * T181-T185: 급여 테이블 마이그레이션 실행
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function runPayrollMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5434,
    database: process.env.DB_NAME || 'dot_platform_dev',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres123'
  });

  try {
    // pay_statements 테이블 생성
    const createTableFile = path.join(__dirname, 'migrations/009_create_pay_statements_table.sql');
    const createTableSql = fs.readFileSync(createTableFile, 'utf8');

    console.log('급여 테이블 마이그레이션 실행 중...');
    await pool.query(createTableSql);
    console.log('✅ 급여 테이블 생성 성공!');

    // RLS 정책 적용
    const rlsFile = path.join(__dirname, 'migrations/010_add_pay_statements_rls.sql');
    const rlsSql = fs.readFileSync(rlsFile, 'utf8');

    console.log('RLS 정책 적용 중...');
    await pool.query(rlsSql);
    console.log('✅ RLS 정책 적용 성공!');

    // 생성된 테이블 확인
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'pay_%'
      ORDER BY table_name
    `);

    console.log('\n생성된 테이블:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // RLS 상태 확인
    const rlsResult = await pool.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename LIKE 'pay_%'
    `);

    console.log('\nRLS 활성화 상태:');
    rlsResult.rows.forEach(row => {
      console.log(`  ${row.tablename}: ${row.rowsecurity ? '✅ 활성화' : '❌ 비활성화'}`);
    });

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runPayrollMigration();