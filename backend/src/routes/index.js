/**
 * T140: API 라우터 통합
 * 모든 API 라우트를 통합 관리
 */

const express = require('express');
const router = express.Router();

// Health Check 라우트
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API 버전 정보
router.get('/version', (req, res) => {
  res.status(200).json({
    success: true,
    version: '1.0.0',
    api: 'v1'
  });
});

// v1 API 라우트 등록
// 인증 라우트 (T056-T075)
router.use('/v1/auth', require('./auth'));

// 근태 관리 라우트 (T106-T130)
router.use('/v1/attendance', require('./attendance'));

// 근태 관리 라우트 (임시 주석 - DB 풀 초기화 문제)
// router.use('/v1/attendance', require('./attendance/status'));
// router.use('/v1/attendance', require('./attendance/checkin'));
// router.use('/v1/attendance', require('./attendance/checkout'));

// 스케줄 관리 라우트 (임시 주석 - DB 풀 초기화 문제)
// router.use('/v1/schedules', require('./schedules/create'));
// router.use('/v1/schedules', require('./schedules/query'));
// router.use('/v1/schedules', require('./schedules/update'));

// 급여 관리 라우트 (T196-T200)
router.use('/v1/payroll', require('./payroll/calculate'));

// 추후 추가될 라우트들
// router.use('/v1/documents', require('./documents'));

module.exports = router;