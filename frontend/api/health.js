// Vercel Function - Health Check
// 프록시 연결 상태 확인용

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 백엔드 헬스체크
    const backendUrl = 'http://100.25.70.173:3001/api/v1/health';
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000
    });

    if (response.ok) {
      const data = await response.json();
      return res.status(200).json({
        status: 'healthy',
        proxy: 'working',
        backend: data,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(response.status).json({
        status: 'unhealthy',
        proxy: 'working',
        backend: 'error',
        backendStatus: response.status,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Health check failed:', error);
    return res.status(503).json({
      status: 'unhealthy',
      proxy: 'working',
      backend: 'unreachable',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}