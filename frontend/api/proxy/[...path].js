// Vercel Serverless Function - API Proxy
// HTTPS → HTTP 프록시 (Mixed Content 해결)

export default async function handler(req, res) {
  // CORS 헤더 설정
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept-Language',
    'Access-Control-Allow-Credentials': 'true'
  };

  // 모든 응답에 CORS 헤더 추가
  Object.keys(corsHeaders).forEach(key => {
    res.setHeader(key, corsHeaders[key]);
  });

  // OPTIONS 프리플라이트 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 백엔드 정보
  const BACKEND_BASE = 'http://100.25.70.173:3001';

  try {
    // URL 경로 구성
    const pathParts = req.query.path;
    if (!pathParts || !Array.isArray(pathParts)) {
      console.error('Invalid path:', req.query);
      return res.status(400).json({
        error: 'Invalid path parameter',
        received: req.query
      });
    }

    const apiPath = pathParts.join('/');
    const backendUrl = `${BACKEND_BASE}/api/v1/${apiPath}`;

    // 요청 로깅
    console.log('=== Proxy Request ===');
    console.log('Method:', req.method);
    console.log('Original URL:', req.url);
    console.log('Path Parts:', pathParts);
    console.log('Backend URL:', backendUrl);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));

    // 전달할 헤더 구성
    const forwardHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Vercel-Proxy/1.0'
    };

    // 인증 헤더 전달
    if (req.headers.authorization) {
      forwardHeaders['Authorization'] = req.headers.authorization;
    }

    // 언어 헤더 전달
    if (req.headers['accept-language']) {
      forwardHeaders['Accept-Language'] = req.headers['accept-language'];
    }

    // 요청 옵션 구성
    const fetchOptions = {
      method: req.method,
      headers: forwardHeaders
    };

    // POST, PUT 등에 body 추가
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
      console.log('Body String:', fetchOptions.body);
    }

    console.log('Fetch Options:', JSON.stringify(fetchOptions, null, 2));

    // 백엔드로 요청 전달
    const backendResponse = await fetch(backendUrl, fetchOptions);

    console.log('=== Backend Response ===');
    console.log('Status:', backendResponse.status);
    console.log('Status Text:', backendResponse.statusText);
    console.log('Headers:', Object.fromEntries(backendResponse.headers.entries()));

    // 응답 본문 읽기
    const responseText = await backendResponse.text();
    console.log('Response Body Length:', responseText.length);
    console.log('Response Body Preview:', responseText.substring(0, 200));

    // Content-Type 헤더 전달
    const contentType = backendResponse.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // 응답 반환
    res.status(backendResponse.status).send(responseText);

  } catch (error) {
    console.error('=== Proxy Error ===');
    console.error('Error Type:', error.constructor.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);

    // 에러 응답
    res.status(500).json({
      error: 'Proxy Error',
      message: error.message,
      type: error.constructor.name,
      timestamp: new Date().toISOString()
    });
  }
}