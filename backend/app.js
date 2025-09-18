/**
 * Express 애플리케이션 설정
 * TDD RED 단계: 모든 라우트는 404를 반환하도록 설정
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// 보안 미들웨어
app.use(helmet());

// CORS 설정
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://dot-platform.com']
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

// JSON 파싱 미들웨어
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 기본 라우트 (Health Check)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// TDD RED 단계: 모든 API 라우트는 404 반환 (구현 전)
app.use('/api/v1/auth/*', (req, res) => {
  res.status(404).json({
    code: 'ROUTE_NOT_IMPLEMENTED',
    message: 'This route is not implemented yet. This is expected in TDD RED phase.',
    path: req.path,
    method: req.method
  });
});

// 기본 404 핸들러
app.use('*', (req, res) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// 에러 핸들러
app.use((error, req, res, next) => {
  console.error('Error:', error);

  res.status(error.status || 500).json({
    code: error.code || 'INTERNAL_SERVER_ERROR',
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

module.exports = app;