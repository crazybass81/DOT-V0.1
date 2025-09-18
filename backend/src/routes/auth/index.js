/**
 * 인증 라우트 인덱스
 * 모든 인증 관련 라우트를 통합
 */

const express = require('express');
const router = express.Router();

// 회원가입 라우트
router.use('/', require('./register'));

// 로그인 라우트
router.use('/', require('./login'));      // T062

// 토큰 갱신 라우트
router.use('/', require('./refresh'));    // T067

// 로그아웃 라우트
router.use('/', require('./logout'));     // T068

// 사용자 정보 및 역할 관리
router.use('/', require('./me'));         // T069
router.use('/', require('./switch-role'));// T070

// 이메일 인증 라우트
router.use('/', require('./verify-email'));// T244

module.exports = router;