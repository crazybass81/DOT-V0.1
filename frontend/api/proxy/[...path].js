// Vercel Serverless Function - API Proxy
// Mixed Content 문제 해결을 위한 HTTPS → HTTP 프록시

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // path 파라미터 확인
    const pathParts = req.query.path;
    if (!pathParts || !Array.isArray(pathParts)) {
      return res.status(400).json({ error: 'Invalid path parameter' });
    }

    // 백엔드 URL 구성
    const backendUrl = `http://100.25.70.173:3001/api/v1/${pathParts.join('/')}`;

    // 디버깅 로그
    console.log('=== Proxy Debug Info ===');
    console.log('Request Method:', req.method);
    console.log('Request URL:', req.url);
    console.log('Request Query:', req.query);
    console.log('Path Parts:', pathParts);
    console.log('Backend URL:', backendUrl);
    console.log('Request Body:', req.body);

    // 요청 전달을 위한 headers 준비
    const forwardHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Vercel-Proxy/1.0',
    };

    // Authorization 헤더가 있으면 전달
    if (req.headers.authorization) {
      forwardHeaders.authorization = req.headers.authorization;
    }

    // Accept-Language 헤더 전달
    if (req.headers['accept-language']) {
      forwardHeaders['accept-language'] = req.headers['accept-language'];
    }

    console.log('Forward Headers:', forwardHeaders);

    // body 데이터 준비
    let bodyData = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      bodyData = JSON.stringify(req.body);
      console.log('Request Body String:', bodyData);
    }

    // 요청 전달
    const response = await fetch(backendUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: bodyData,
    });

    console.log('Backend Response Status:', response.status);

    // 응답 데이터 처리
    const data = await response.text();
    console.log('Backend Response Data:', data.substring(0, 200));

    // Content-Type 헤더 복사
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // 응답 전달
    return res.status(response.status).send(data);

  } catch (error) {
    console.error('=== Proxy Error ===');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);

    return res.status(500).json({
      error: 'Proxy server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}