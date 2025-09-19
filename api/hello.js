// 간단한 API 테스트 엔드포인트
export default function handler(req, res) {
  const { name = 'Guest' } = req.query;

  res.status(200).json({
    message: `안녕하세요, ${name}님!`,
    method: req.method,
    timestamp: new Date().toISOString(),
    platform: 'DOT Platform - Vercel Deployment'
  });
}