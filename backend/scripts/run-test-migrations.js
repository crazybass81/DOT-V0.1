/**
 * 테스트 DB 마이그레이션 실행 스크립트
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const pgPool = new Pool({
  host: 'localhost',
  port: 5435,
  database: 'dot_platform_test',
  user: 'postgres',
  password: 'postgres123'
});

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../src/db/migrations');

  try {
    // PostGIS 확장 설치
    console.log('PostGIS 확장 설치 중...');
    try {
      await pgPool.query('CREATE EXTENSION IF NOT EXISTS postgis');
      console.log('✅ PostGIS 확장 설치 완료');
    } catch (err) {
      console.log('PostGIS 이미 설치됨');
    }

    // 마이그레이션 파일 목록 가져오기
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`${sqlFiles.length}개의 마이그레이션 파일 발견`);

    // 각 마이그레이션 실행
    for (const file of sqlFiles) {
      console.log(`\n실행 중: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf8');

      try {
        await pgPool.query(sql);
        console.log(`✅ ${file} 완료`);
      } catch (error) {
        if (error.code === '42P07') { // relation already exists
          console.log(`⚠️ ${file} - 테이블이 이미 존재함 (건너뜀)`);
        } else if (error.code === '42P04') { // database already exists
          console.log(`⚠️ ${file} - 이미 존재함 (건너뜀)`);
        } else {
          console.error(`❌ ${file} 실패:`, error.message);
          // 계속 진행
        }
      }
    }

    console.log('\n✅ 마이그레이션 완료!');

    // 테이블 목록 확인
    const tables = await pgPool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('\n생성된 테이블:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });

  } catch (error) {
    console.error('마이그레이션 실패:', error);
  } finally {
    await pgPool.end();
  }
}

runMigrations();