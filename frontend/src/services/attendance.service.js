/**
 * DOT Platform Frontend - 근태 서비스
 * 출퇴근, 휴게시간 관리 API와 통신하는 서비스 모듈
 */

import api, { API_ENDPOINTS } from './api-client';

// 근태 서비스
const attendanceService = {
  /**
   * 출근하기
   * @param {Object} checkInData - 출근 정보
   * @param {number} checkInData.latitude - 위도
   * @param {number} checkInData.longitude - 경도
   * @param {string} checkInData.qrCodeToken - QR 코드 토큰 (선택)
   * @returns {Promise} 출근 응답
   */
  checkIn: async (checkInData) => {
    const response = await api.post(API_ENDPOINTS.ATTENDANCE.CHECK_IN, checkInData);
    return response.data;
  },

  /**
   * 퇴근하기
   * @param {Object} checkOutData - 퇴근 정보
   * @param {number} checkOutData.latitude - 위도
   * @param {number} checkOutData.longitude - 경도
   * @returns {Promise} 퇴근 응답
   */
  checkOut: async (checkOutData) => {
    const response = await api.post(API_ENDPOINTS.ATTENDANCE.CHECK_OUT, checkOutData);
    return response.data;
  },

  /**
   * 휴게시간 시작
   * @returns {Promise} 휴게시간 시작 응답
   */
  startBreak: async () => {
    const response = await api.post(API_ENDPOINTS.ATTENDANCE.BREAK_START);
    return response.data;
  },

  /**
   * 휴게시간 종료
   * @returns {Promise} 휴게시간 종료 응답
   */
  endBreak: async () => {
    const response = await api.post(API_ENDPOINTS.ATTENDANCE.BREAK_END);
    return response.data;
  },

  /**
   * 오늘 근태 정보 조회
   * @returns {Promise} 오늘 근태 정보
   */
  getTodayAttendance: async () => {
    const response = await api.get(API_ENDPOINTS.ATTENDANCE.TODAY);
    return response.data;
  },

  /**
   * 근태 이력 조회
   * @param {Object} params - 조회 조건
   * @param {string} params.startDate - 시작일 (YYYY-MM-DD)
   * @param {string} params.endDate - 종료일 (YYYY-MM-DD)
   * @param {number} params.page - 페이지 번호
   * @param {number} params.limit - 페이지 크기
   * @returns {Promise} 근태 이력
   */
  getAttendanceHistory: async (params = {}) => {
    const response = await api.get(API_ENDPOINTS.ATTENDANCE.HISTORY, params);
    return response.data;
  },

  /**
   * 근태 리포트 조회
   * @param {Object} params - 리포트 조건
   * @param {string} params.month - 월 (YYYY-MM)
   * @param {string} params.userId - 사용자 ID (관리자용)
   * @returns {Promise} 근태 리포트
   */
  getAttendanceReport: async (params = {}) => {
    const response = await api.get(API_ENDPOINTS.ATTENDANCE.REPORT, params);
    return response.data;
  },

  /**
   * 현재 근태 상태 조회
   * @returns {Promise} 현재 근태 상태
   */
  getCurrentStatus: async () => {
    const response = await api.get(API_ENDPOINTS.ATTENDANCE.TODAY);
    return response.data;
  },

  /**
   * 근태 정정 요청
   * @param {Object} correctionData - 정정 요청 정보
   * @param {string} correctionData.date - 정정할 날짜
   * @param {string} correctionData.type - 정정 타입 (checkin/checkout/break)
   * @param {string} correctionData.time - 정정할 시간
   * @param {string} correctionData.reason - 정정 사유
   * @returns {Promise} 정정 요청 응답
   */
  requestCorrection: async (correctionData) => {
    const response = await api.post('/attendance/correction', correctionData);
    return response.data;
  },

  /**
   * QR 코드 생성 (관리자용)
   * @param {Object} qrData - QR 코드 생성 정보
   * @param {string} qrData.businessId - 사업장 ID
   * @param {number} qrData.validMinutes - 유효 시간 (분)
   * @returns {Promise} QR 코드 응답
   */
  generateQRCode: async (qrData) => {
    const response = await api.post('/attendance/qr-code/generate', qrData);
    return response.data;
  },

  /**
   * 위치 기반 출퇴근 검증
   * @param {Object} locationData - 위치 정보
   * @param {number} locationData.latitude - 위도
   * @param {number} locationData.longitude - 경도
   * @returns {Promise} 위치 검증 응답
   */
  validateLocation: async (locationData) => {
    const response = await api.post('/attendance/validate-location', locationData);
    return response.data;
  },
};

export default attendanceService;