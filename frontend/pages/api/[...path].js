// Vercel API Route - Backend Proxy
// Mixed Content 해결을 위한 HTTPS → HTTP 프록시

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // OPTIONS 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // API 경로 구성
    const path = Array.isArray(req.query.path)
      ? req.query.path.join('/')
      : req.query.path || '';

    const url = `http://100.25.70.173:3001/api/v1/${path}`;

    console.log('Proxying:', req.method, url);

    // 백엔드로 요청
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...req.headers
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method)
        ? JSON.stringify(req.body)
        : undefined
    });

    const data = await response.text();

    // 응답 반환
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.send(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Proxy failed',
      message: error.message
    });
  }
}