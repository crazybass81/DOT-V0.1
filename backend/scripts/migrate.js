#!/usr/bin/env node

/**
 * 데이터베이스 마이그레이션 실행 스크립트
 * 모든 SQL 마이그레이션 파일을 순서대로 실행
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 데이터베이스 연결 설정
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5434,
  database: process.env.DB_NAME || 'dot_platform_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
});

// 테스트 DB 풀
const testPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: 5435,
  database: 'dot_platform_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
});

async function runMigrations(targetPool, dbName) {
  const client = await targetPool.connect();

  try {
    console.log(`\n🔧 ${dbName} 마이그레이션 시작...`);

    // PostGIS 확장 설치
    console.log('📍 PostGIS 확장 설치 중...');
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // 마이그레이션 폴더 읽기
    const migrationsDir = path.join(__dirname, '../src/db/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📁 ${files.length}개의 마이그레이션 파일 발견`);

    // 마이그레이션 추적 테이블 생성
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 각 마이그레이션 실행
    for (const file of files) {
      // 이미 실행된 마이그레이션 체크
      const result = await client.query(
        'SELECT 1 FROM migrations WHERE filename = $1',
        [file]
      );

      if (result.rows.length > 0) {
        console.log(`⏭️  ${file} - 이미 실행됨`);
        continue;
      }

      // SQL 파일 읽기 및 실행
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✅ ${file} - 성공`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ ${file} - 실패:`, error.message);
        throw error;
      }
    }

    console.log(`\n✨ ${dbName} 마이그레이션 완료!\n`);

  } catch (error) {
    console.error('마이그레이션 오류:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function main() {
  console.log('🚀 데이터베이스 마이그레이션 시작\n');

  try {
    // 개발 DB 마이그레이션
    await runMigrations(pool, 'dot_platform_dev');

    // 테스트 DB 마이그레이션
    if (process.argv.includes('--with-test')) {
      await runMigrations(testPool, 'dot_platform_test');
    }

    console.log('🎉 모든 마이그레이션 완료!');

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    process.exit(1);
  } finally {
    await pool.end();
    await testPool.end();
  }
}

// 스크립트 실행
main();