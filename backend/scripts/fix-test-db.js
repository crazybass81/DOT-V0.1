#!/usr/bin/env node

/**
 * 테스트 데이터베이스 외래 키 문제 해결
 */

const { Pool } = require('pg');

const testPool = new Pool({
  host: 'localhost',
  port: 5435,
  database: 'dot_platform_test',
  user: 'postgres',
  password: 'postgres123',
});

async function fixDatabase() {
  const client = await testPool.connect();

  try {
    console.log('🔧 테스트 데이터베이스 수정 중...');

    // 기존 테이블 삭제 (CASCADE로 종속 테이블도 함께 삭제)
    await client.query('DROP TABLE IF EXISTS businesses CASCADE');
    await client.query('DROP TABLE IF EXISTS user_roles CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');
    await client.query('DROP TABLE IF EXISTS user_verifications CASCADE');
    await client.query('DROP TABLE IF EXISTS email_verification_requests CASCADE');

    console.log('✅ 기존 테이블 삭제 완료');

    // users 테이블 재생성
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        profile_image_url VARCHAR(500),
        status VARCHAR(20) DEFAULT 'active',
        email_verified BOOLEAN DEFAULT false,
        phone_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login_at TIMESTAMP
      )
    `);
    console.log('✅ users 테이블 생성');

    // businesses 테이블 생성 (외래 키 제약 없이)
    await client.query(`
      CREATE TABLE businesses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        registration_number VARCHAR(20),
        owner_id INTEGER,
        address TEXT,
        location POINT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ businesses 테이블 생성');

    // user_roles 테이블 생성
    await client.query(`
      CREATE TABLE user_roles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
        role_type VARCHAR(20) NOT NULL,
        permissions JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        wage_type VARCHAR(20),
        wage_amount DECIMAL(10,2),
        start_date DATE DEFAULT CURRENT_DATE,
        end_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ user_roles 테이블 생성');

    // user_verifications 테이블 생성
    await client.query(`
      CREATE TABLE user_verifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        verification_type VARCHAR(20) NOT NULL,
        verified_at TIMESTAMP,
        token_hash VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, verification_type)
      )
    `);
    console.log('✅ user_verifications 테이블 생성');

    // email_verification_requests 테이블 생성
    await client.query(`
      CREATE TABLE email_verification_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        requested_at TIMESTAMP DEFAULT NOW(),
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ email_verification_requests 테이블 생성');

    // 인덱스 생성
    await client.query(`
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_phone ON users(phone);
      CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
      CREATE INDEX idx_user_roles_business_id ON user_roles(business_id);
    `);
    console.log('✅ 인덱스 생성');

    console.log('✨ 테스트 데이터베이스 수정 완료!');

  } catch (error) {
    console.error('❌ 데이터베이스 수정 실패:', error);
    process.exit(1);
  } finally {
    client.release();
    await testPool.end();
  }
}

// 실행
fixDatabase();