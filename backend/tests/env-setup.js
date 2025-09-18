/**
 * 환경변수 테스트 설정
 * 테스트 실행 전 필요한 환경변수 설정
 */

// 테스트 환경 설정
process.env.NODE_ENV = 'test';

// 데이터베이스 설정 (테스트용)
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'dot_platform_test';
process.env.DB_USER = process.env.DB_USER || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'password';

// Redis 설정 (테스트용)
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.REDIS_DB = process.env.REDIS_DB || '1'; // 테스트용 DB

// JWT 설정
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// 기타 설정
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '10';
process.env.PORT = process.env.PORT || '3001'; // 테스트용 포트

console.log('🔧 테스트 환경변수 설정 완료');
console.log(`- NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`- DB_NAME: ${process.env.DB_NAME}`);
console.log(`- REDIS_DB: ${process.env.REDIS_DB}`);
console.log(`- PORT: ${process.env.PORT}`);