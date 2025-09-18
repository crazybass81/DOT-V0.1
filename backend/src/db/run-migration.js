/**
 * 마이그레이션 실행 스크립트
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function runMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5434,
    database: process.env.DB_NAME || 'dot_platform_dev',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres123'
  });

  try {
    // 먼저 employees 테이블 생성
    const employeesFile = path.join(__dirname, 'migrations/003_create_employees_table.sql');
    const employeesSql = fs.readFileSync(employeesFile, 'utf8');

    console.log('마이그레이션 실행 중: 003_create_employees_table.sql');
    await pool.query(employeesSql);
    console.log('✅ Employees 테이블 생성 성공!');

    // 스케줄 테이블 생성
    const migrationFile = path.join(__dirname, 'migrations/007_create_schedules_tables.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('마이그레이션 실행 중: 007_create_schedules_tables.sql');
    await pool.query(sql);
    console.log('✅ Schedule 테이블 생성 성공!');

    // 생성된 테이블 확인
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE 'schedule%' OR table_name = 'employees')
      ORDER BY table_name
    `);

    console.log('\n생성된 테이블:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();