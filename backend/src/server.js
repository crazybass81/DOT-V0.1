/**
 * T051: 서버 시작 파일
 * DOT Platform 백엔드 서버
 */

// Railway 환경 설정 (있으면 적용)
if (process.env.RAILWAY_ENVIRONMENT) {
  require('./config/railway');
}

const app = require('./app');
const { initDatabase } = require('./config/database');
const redisClient = require('./config/redis');

const PORT = process.env.PORT || 3000;

/**
 * 서버 시작 함수
 */
async function startServer() {
  try {
    // 데이터베이스 연결 초기화
    console.log('🔄 데이터베이스 연결 중...');
    await initDatabase();
    console.log('✅ PostgreSQL 연결 성공');

    // Redis 연결 초기화 (이미 연결되어 있지 않은 경우만)
    console.log('🔄 Redis 연결 확인 중...');
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
    console.log('✅ Redis 연결 성공');

    // 서버 시작
    const server = app.listen(PORT, () => {
      console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다`);
      console.log(`📍 환경: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 헬스체크: http://localhost:${PORT}/health`);
      console.log(`🔄 버전: v1.0.17 - EC2 Auto Deploy 🐳`);
      console.log(`📅 시작 시간: ${new Date().toLocaleString('ko-KR')}`);
    });

    // Graceful shutdown 처리
    process.on('SIGTERM', () => {
      console.log('⚠️  SIGTERM 신호 수신, 서버 종료 중...');
      server.close(() => {
        console.log('✅ HTTP 서버 종료됨');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('⚠️  SIGINT 신호 수신, 서버 종료 중...');
      server.close(() => {
        console.log('✅ HTTP 서버 종료됨');
        process.exit(0);
      });
    });

    return server;
  } catch (error) {
    console.error('❌ 서버 시작 실패:', error);
    process.exit(1);
  }
}

// 직접 실행 시에만 서버 시작
if (require.main === module) {
  startServer();
}

module.exports = startServer;