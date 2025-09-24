/**
 * Vercel Functions 백엔드 엔트리 포인트
 * Express 앱을 Serverless Function으로 래핑
 */

// Express 앱 가져오기
const app = require('../backend/src/app');

// Vercel Functions 핸들러로 export
module.exports = app;

// 로컬 개발 환경에서만 서버 실행
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`✅ 백엔드 서버가 포트 ${PORT}에서 실행 중입니다`);
  });
}