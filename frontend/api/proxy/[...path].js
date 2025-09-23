// Vercel Serverless Function - API Proxy
// HTTPS → HTTP 프록시 (Mixed Content 해결)

export const config = {
  runtime: 'nodejs18.x',
  regions: ['iad1'],
  maxDuration: 30
};

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

  console.log('=== Function Called ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Query:', req.query);

  // OPTIONS 프리플라이트 요청 처리
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS request handled');
    return res.status(200).end();
  }

  // 백엔드 정보
  const BACKEND_BASE = 'http://100.25.70.173:3001';

  try {
    // URL 경로 구성
    const pathParts = req.query.path;
    if (!pathParts) {
      console.error('No path in query:', req.query);
      return res.status(400).json({
        error: 'No path parameter',
        query: req.query,
        url: req.url
      });
    }

    if (!Array.isArray(pathParts)) {
      console.error('Path is not array:', pathParts, typeof pathParts);
      return res.status(400).json({
        error: 'Path parameter is not array',
        path: pathParts,
        type: typeof pathParts
      });
    }

    const apiPath = pathParts.join('/');
    const backendUrl = `${BACKEND_BASE}/api/v1/${apiPath}`;

    // 요청 로깅
    console.log('=== Proxy Request ===');
    console.log('Method:', req.method);
    console.log('Original URL:', req.url);
    console.log('Path Parts:', pathParts);
    console.log('API Path:', apiPath);
    console.log('Backend URL:', backendUrl);

    // Body 로깅 (중요한 정보는 마스킹)
    if (req.body) {
      const logBody = { ...req.body };
      if (logBody.password) logBody.password = '[MASKED]';
      console.log('Request Body:', JSON.stringify(logBody, null, 2));
    }

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
      console.log('Body added to request, length:', fetchOptions.body.length);
    }

    console.log('Fetch Options:', JSON.stringify({
      ...fetchOptions,
      body: fetchOptions.body ? '[BODY_PRESENT]' : undefined
    }, null, 2));

    // 백엔드로 요청 전달
    console.log('Sending request to:', backendUrl);
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
    console.log('Returning response with status:', backendResponse.status);
    return res.status(backendResponse.status).send(responseText);

  } catch (error) {
    console.error('=== Proxy Error ===');
    console.error('Error Type:', error.constructor.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);

    // 에러 응답
    return res.status(500).json({
      error: 'Proxy Error',
      message: error.message,
      type: error.constructor.name,
      timestamp: new Date().toISOString()
    });
  }
}