// Vercel Edge Function - Backend Proxy
// Mixed Content 해결을 위한 HTTPS → HTTP 프록시

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Accept-Language');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // OPTIONS 처리 (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // API 경로 구성
    const path = req.query.path || '';
    const queryParams = new URLSearchParams();

    // 쿼리 파라미터 처리
    Object.keys(req.query).forEach(key => {
      if (key !== 'path') {
        queryParams.append(key, req.query[key]);
      }
    });

    const queryString = queryParams.toString();
    const url = `http://100.25.70.173:3001/api/v1/${path}${queryString ? `?${queryString}` : ''}`;

    console.log('🔄 Proxying:', req.method, url);

    // 헤더 정리 (Vercel에서 추가되는 헤더 제거)
    const cleanHeaders = {};
    Object.keys(req.headers).forEach(key => {
      // Vercel 내부 헤더 제외
      if (!key.startsWith('x-vercel-') &&
          !key.startsWith('x-forwarded-') &&
          key !== 'host' &&
          key !== 'connection') {
        cleanHeaders[key] = req.headers[key];
      }
    });

    // 백엔드로 요청
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DOT-Platform-Vercel-Proxy/1.0',
        ...cleanHeaders
      }
    };

    // Body가 있는 요청 처리
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);

    // 응답 헤더 복사
    const contentType = response.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);

    // 응답 상태 설정
    res.status(response.status);

    // 응답 데이터 처리
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.json(data);
    } else {
      const data = await response.text();
      return res.send(data);
    }

  } catch (error) {
    console.error('❌ Proxy error:', error);

    // 네트워크 오류 처리
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'Backend Unavailable',
        message: '백엔드 서버에 연결할 수 없습니다.',
        code: 'BACKEND_DOWN'
      });
    }

    // 타임아웃 오류 처리
    if (error.name === 'AbortError') {
      return res.status(504).json({
        error: 'Gateway Timeout',
        message: '백엔드 요청 시간이 초과되었습니다.',
        code: 'TIMEOUT'
      });
    }

    // 일반 오류 처리
    return res.status(500).json({
      error: 'Proxy Error',
      message: error.message,
      code: 'PROXY_FAILED'
    });
  }
}

// Vercel Runtime 설정
export const config = {
  runtime: 'edge',
};