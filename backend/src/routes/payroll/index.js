/**
 * 급여 관리 라우트 인덱스
 * T196-T200 통합 라우트 관리
 */

const express = require('express');
const router = express.Router();

// 급여 계산 라우트
const calculateRoutes = require('./calculate');

// 급여명세서 조회 라우트
const statementRoutes = require('./statement');

// PDF 생성 라우트
const pdfRoutes = require('./pdf');

// 라우트 마운트
router.use('/calculate', calculateRoutes);
router.use('/statements', statementRoutes);
router.use('/pdf', pdfRoutes);

// 헬스체크
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'payroll-api',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;