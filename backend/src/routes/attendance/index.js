/**
 * 근태 관련 라우트 인덱스
 * 모든 근태 관련 라우트를 통합
 */

const express = require('express');
const router = express.Router();

// QR 관련 라우트
router.use('/', require('./qr'));           // T258: QR 기반 출퇴근

// 체크인/아웃 라우트
router.use('/', require('./check-in'));     // T111-T115
router.use('/', require('./check-out'));    // T116-T120
router.use('/', require('./break'));        // T257: 휴게시간 관리
router.use('/', require('./status'));       // T121-T125: 상태 조회
// router.use('/', require('./history'));      // T131-T135

module.exports = router;