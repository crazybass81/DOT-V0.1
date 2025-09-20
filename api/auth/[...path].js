// Vercel 서버리스 함수 - Auth 라우트 프록시
import authRoutes from '../../backend/src/routes/auth';

export default function handler(req, res) {
  // Express 라우터를 Vercel 함수로 래핑
  return authRoutes(req, res);
}