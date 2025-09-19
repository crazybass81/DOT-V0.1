// 간단한 헬스체크 엔드포인트
export default function handler(req, res) {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'DOT Platform API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    message: 'DOT Platform이 정상적으로 작동 중입니다!'
  });
}