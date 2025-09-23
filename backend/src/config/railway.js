/**
 * Railway 환경 변수 자동 설정
 * Railway는 PostgreSQL과 Redis를 자동으로 연결합니다
 */

// PostgreSQL 연결 정보 (Railway 자동 제공)
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  process.env.POSTGRES_HOST = url.hostname;
  process.env.POSTGRES_PORT = url.port;
  process.env.POSTGRES_DB = url.pathname.slice(1);
  process.env.POSTGRES_USER = url.username;
  process.env.POSTGRES_PASSWORD = url.password;
}

// Redis 연결 정보 (Railway 자동 제공)
if (process.env.REDIS_URL) {
  const url = new URL(process.env.REDIS_URL);
  process.env.REDIS_HOST = url.hostname;
  process.env.REDIS_PORT = url.port;
  process.env.REDIS_PASSWORD = url.password;
}

// CORS 설정
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN;
} else {
  process.env.CORS_ORIGIN = 'https://dot-platform.vercel.app';
}

console.log('🚂 Railway 환경 설정 완료');
console.log('📦 Database:', process.env.DATABASE_URL ? '연결됨' : '로컬');
console.log('📡 Redis:', process.env.REDIS_URL ? '연결됨' : '로컬');
console.log('🌐 CORS Origin:', process.env.CORS_ORIGIN);