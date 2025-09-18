/**
 * DOT Platform Frontend - 근태 서비스
 * 출퇴근, 휴게시간 관리 API와 통신하는 서비스 모듈
 */

import api, { API_ENDPOINTS } from './api';

// 근태 서비스
const attendanceService = {
  /**
   * GPS 기반 출근 체크
   * @param {Object} data - 출근 정보
   * @param {number} data.latitude - 위도
   * @param {number} data.longitude - 경도
   * @param {number} data.accuracy - GPS 정확도
   * @returns {Promise} 출근 응답
   */
  checkInWithGPS: async (data) => {
    const response = await api.post(API_ENDPOINTS.ATTENDANCE.CHECK_IN, {
      type: 'gps',
      ...data
    });
    return response.data;
  },

  /**
   * QR 코드 기반 출근 체크
   * @param {Object} data - QR 정보
   * @param {string} data.qrData - QR 코드 데이터
   * @returns {Promise} 출근 응답
   */
  checkInWithQR: async (data) => {
    const response = await api.post(API_ENDPOINTS.ATTENDANCE.CHECK_IN, {
      type: 'qr',
      ...data
    });
    return response.data;
  },

  /**
   * 퇴근 체크
   * @param {Object} data - 퇴근 정보
   * @returns {Promise} 퇴근 응답
   */
  checkOut: async (data = {}) => {
    const response = await api.post(API_ENDPOINTS.ATTENDANCE.CHECK_OUT, data);
    return response.data;
  },

  /**
   * 휴게 시작
   * @returns {Promise} 휴게 시작 응답
   */
  startBreak: async () => {
    const response = await api.post(API_ENDPOINTS.ATTENDANCE.BREAK_START);
    return response.data;
  },

  /**
   * 휴게 종료
   * @returns {Promise} 휴게 종료 응답
   */
  endBreak: async () => {
    const response = await api.post(API_ENDPOINTS.ATTENDANCE.BREAK_END);
    return response.data;
  },

  /**
   * 오늘의 근태 기록 조회
   * @returns {Promise} 오늘의 근태 기록
   */
  getTodayAttendance: async () => {
    const response = await api.get(API_ENDPOINTS.ATTENDANCE.TODAY);
    return response.data;
  },

  /**
   * 근태 기록 이력 조회
   * @param {Object} params - 조회 조건
   * @param {string} params.startDate - 시작일
   * @param {string} params.endDate - 종료일
   * @param {number} params.page - 페이지 번호
   * @param {number} params.limit - 페이지당 항목 수
   * @returns {Promise} 근태 기록 목록
   */
  getHistory: async (params = {}) => {
    const response = await api.get(API_ENDPOINTS.ATTENDANCE.HISTORY, params);
    return response.data;
  },

  /**
   * 근태 보고서 생성
   * @param {Object} params - 보고서 생성 조건
   * @param {string} params.month - 대상 월 (YYYY-MM)
   * @param {string} params.format - 보고서 형식 (pdf, excel)
   * @returns {Promise} 보고서 데이터
   */
  generateReport: async (params) => {
    const response = await api.post(API_ENDPOINTS.ATTENDANCE.REPORT, params);
    return response.data;
  },

  /**
   * 근태 통계 조회
   * @param {Object} params - 통계 조회 조건
   * @param {string} params.period - 기간 (week, month, year)
   * @param {string} params.businessId - 사업장 ID
   * @returns {Promise} 근태 통계 데이터
   */
  getStatistics: async (params) => {
    const response = await api.get('/attendance/statistics', params);
    return response.data;
  },

  /**
   * 근무 시간 계산
   * @param {Date} checkIn - 출근 시간
   * @param {Date} checkOut - 퇴근 시간
   * @param {Array} breaks - 휴게 시간 목록
   * @returns {Object} 계산된 근무 시간
   */
  calculateWorkTime: (checkIn, checkOut, breaks = []) => {
    if (!checkIn || !checkOut) {
      return {
        totalMinutes: 0,
        workMinutes: 0,
        breakMinutes: 0,
        overtimeMinutes: 0,
        formatted: '00:00'
      };
    }

    const checkInTime = new Date(checkIn);
    const checkOutTime = new Date(checkOut);
    const totalMinutes = Math.floor((checkOutTime - checkInTime) / 1000 / 60);

    // 휴게 시간 계산
    const breakMinutes = breaks.reduce((total, breakRecord) => {
      if (breakRecord.startTime && breakRecord.endTime) {
        const start = new Date(breakRecord.startTime);
        const end = new Date(breakRecord.endTime);
        return total + Math.floor((end - start) / 1000 / 60);
      }
      return total;
    }, 0);

    const workMinutes = totalMinutes - breakMinutes;

    // 초과 근무 계산 (8시간 = 480분 초과)
    const regularWorkMinutes = 480;
    const overtimeMinutes = Math.max(0, workMinutes - regularWorkMinutes);

    // 포맷팅
    const hours = Math.floor(workMinutes / 60);
    const minutes = workMinutes % 60;
    const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    return {
      totalMinutes,
      workMinutes,
      breakMinutes,
      overtimeMinutes,
      formatted
    };
  },

  /**
   * 지각 여부 확인
   * @param {Date} checkInTime - 출근 시간
   * @param {Date} scheduledTime - 예정 출근 시간
   * @returns {Object} 지각 정보
   */
  checkLateStatus: (checkInTime, scheduledTime) => {
    if (!checkInTime || !scheduledTime) {
      return {
        isLate: false,
        lateMinutes: 0
      };
    }

    const actualTime = new Date(checkInTime);
    const expectedTime = new Date(scheduledTime);
    const diffMinutes = Math.floor((actualTime - expectedTime) / 1000 / 60);

    return {
      isLate: diffMinutes > 0,
      lateMinutes: Math.max(0, diffMinutes)
    };
  },

  /**
   * 근태 상태 문자열 변환
   * @param {string} status - 근태 상태 코드
   * @returns {string} 한글 근태 상태
   */
  getStatusText: (status) => {
    const statusMap = {
      'checked-in': '출근',
      'on-break': '휴게',
      'checked-out': '퇴근',
      'off-duty': '근무 외',
      'absent': '결근',
      'late': '지각',
      'early-leave': '조퇴',
      'overtime': '초과근무'
    };

    return statusMap[status] || status;
  }
};

export default attendanceService;