/**
 * 스케줄 라우터 메인 엔트리
 * /api/v1/schedules/* 엔드포인트 통합
 */

const express = require('express');
const router = express.Router();

// 개별 라우터 임포트
const createRouter = require('./create');
const listRouter = require('./list');
const assignRouter = require('./assign');
const swapRouter = require('./swap');
const approveRouter = require('./approve');

// 라우터 마운트
// POST /api/v1/schedules - 스케줄 생성
router.use('/', createRouter);

// GET /api/v1/schedules - 스케줄 목록 조회
router.use('/', listRouter);

// POST /api/v1/schedules/:id/assign - 직원 할당
router.use('/', assignRouter);

// POST /api/v1/schedules/swap - 교대 요청
// PATCH /api/v1/schedules/swap/:id/* - 교대 응답
router.use('/', swapRouter);

// POST /api/v1/schedules/:id/approve - 스케줄 승인
// POST /api/v1/schedules/bulk-approve - 일괄 승인
// POST /api/v1/schedules/:id/reject - 스케줄 거부
router.use('/', approveRouter);

module.exports = router;