/**
 * T196-T197: 급여 계산 API 엔드포인트
 * 급여 계산, 공제 계산, 명세서 생성 API
 */

const express = require('express');
const router = express.Router();
const PayrollController = require('../../controllers/PayrollController');
const { authenticate } = require('../../middleware/auth');
const { requireJSON } = require('../../middleware/validation');
const { apiLimiter } = require('../../middleware/rateLimiter');
const { asyncHandler } = require('../../middleware/errorHandler');

/**
 * POST /api/payroll/calculate
 * 급여 계산 및 저장
 */
router.post('/calculate',
  apiLimiter,
  requireJSON,
  authenticate,
  asyncHandler(async (req, res) => {
    await PayrollController.calculate(req, res);
  })
);

/**
 * POST /api/payroll/calculate/preview
 * 급여 미리보기 (저장하지 않음)
 */
router.post('/calculate/preview',
  apiLimiter,
  requireJSON,
  authenticate,
  asyncHandler(async (req, res) => {
    await PayrollController.preview(req, res);
  })
);

/**
 * POST /api/payroll/calculate-batch
 * 일괄 급여 계산
 */
router.post('/calculate-batch',
  apiLimiter,
  requireJSON,
  authenticate,
  asyncHandler(async (req, res) => {
    // TODO: 일괄 계산 기능 구현 필요
    res.status(501).json({
      success: false,
      error: '일괄 계산 기능은 아직 구현되지 않았습니다'
    });
  })
);

/**
 * POST /api/payroll/deductions
 * 4대보험 공제 계산
 */
router.post('/deductions',
  apiLimiter,
  requireJSON,
  authenticate,
  asyncHandler(async (req, res) => {
    // 공제 계산은 preview에 포함됨
    await PayrollController.preview(req, res);
  })
);

/**
 * POST /api/payroll/statement
 * 급여명세서 생성
 */
router.post('/statement',
  apiLimiter,
  requireJSON,
  authenticate,
  asyncHandler(async (req, res) => {
    // 명세서 생성은 calculate에 포함됨
    await PayrollController.calculate(req, res);
  })
);

/**
 * GET /api/payroll/statement/:statementId
 * 급여명세서 조회
 */
router.get('/statement/:statementId',
  apiLimiter,
  authenticate,
  asyncHandler(async (req, res) => {
    // ID로 매핑
    req.params.id = req.params.statementId;
    await PayrollController.getStatement(req, res);
  })
);

/**
 * GET /api/payroll/statements
 * 급여명세서 목록 조회
 */
router.get('/statements',
  apiLimiter,
  authenticate,
  asyncHandler(async (req, res) => {
    await PayrollController.listStatements(req, res);
  })
);

/**
 * POST /api/payroll/statement/:statementId/pdf
 * 급여명세서 PDF 생성
 */
router.post('/statement/:statementId/pdf',
  apiLimiter,
  authenticate,
  asyncHandler(async (req, res) => {
    // PDF 생성은 별도 pdf.js 라우트에 구현됨
    res.redirect(307, `/api/v1/payroll/pdf/${req.params.statementId}/pdf`);
  })
);

/**
 * POST /api/payroll/approve
 * 급여 승인
 */
router.post('/approve',
  apiLimiter,
  requireJSON,
  authenticate,
  asyncHandler(async (req, res) => {
    // TODO: 급여 승인 기능 구현 필요
    res.status(501).json({
      success: false,
      error: '급여 승인 기능은 아직 구현되지 않았습니다'
    });
  })
);

/**
 * GET /api/payroll/summary
 * 급여 요약 조회
 */
router.get('/summary',
  apiLimiter,
  authenticate,
  asyncHandler(async (req, res) => {
    // 목록 조회로 대체
    await PayrollController.listStatements(req, res);
  })
);

/**
 * POST /api/payroll/validate
 * 급여 데이터 검증
 */
router.post('/validate',
  apiLimiter,
  requireJSON,
  authenticate,
  asyncHandler(async (req, res) => {
    // 검증은 preview로 대체
    await PayrollController.preview(req, res);
  })
);

module.exports = router;