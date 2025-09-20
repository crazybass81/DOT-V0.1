// Vercel 서버리스 함수 - 백엔드 통합
const express = require('express');
const cors = require('cors');

// Express 앱 초기화
const app = express();

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 백엔드 라우트 임포트
const authRoutes = require('../backend/src/routes/auth');
const attendanceRoutes = require('../backend/src/routes/attendance');
const scheduleRoutes = require('../backend/src/routes/schedule');
const payrollRoutes = require('../backend/src/routes/payroll');

// 라우트 등록
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/payroll', payrollRoutes);

// 헬스체크 엔드포인트
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'DOT Platform API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 루트 엔드포인트
app.get('/api', (req, res) => {
  res.json({
    message: 'DOT Platform API - Vercel Deployment',
    endpoints: [
      '/api/health',
      '/api/auth/*',
      '/api/attendance/*',
      '/api/schedule/*',
      '/api/payroll/*'
    ]
  });
});

// Vercel 서버리스 함수로 내보내기
module.exports = app;