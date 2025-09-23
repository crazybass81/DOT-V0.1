// Next.js Style API Route for Vercel
// HTTPS → HTTP 프록시

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path } = req.query;
  const backendUrl = `http://100.25.70.173:3001/api/v1/${Array.isArray(path) ? path.join('/') : path}`;

  console.log('Proxy request:', req.method, backendUrl);

  try {
    const response = await fetch(backendUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-NextJS-Proxy'
      },
      body: req.method !== 'GET' && req.body ? JSON.stringify(req.body) : undefined
    });

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy Error', message: error.message });
  }
}