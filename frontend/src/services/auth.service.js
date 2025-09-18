/**
 * DOT Platform Frontend - 인증 서비스
 * 백엔드 인증 API와 통신하는 서비스 모듈
 */

import api, { API_ENDPOINTS } from './api';

// 인증 서비스
const authService = {
  /**
   * 로그인
   * @param {Object} credentials - 로그인 정보
   * @param {string} credentials.email - 이메일
   * @param {string} credentials.password - 비밀번호
   * @param {boolean} credentials.rememberMe - 자동 로그인 여부
   * @returns {Promise} 로그인 응답
   */
  login: async (credentials) => {
    const response = await api.post(API_ENDPOINTS.AUTH.LOGIN, credentials);
    return response.data;
  },

  /**
   * 회원가입
   * @param {Object} userData - 사용자 정보
   * @returns {Promise} 회원가입 응답
   */
  register: async (userData) => {
    const response = await api.post(API_ENDPOINTS.AUTH.REGISTER, userData);
    return response.data;
  },

  /**
   * 토큰 검증
   * @param {string} token - JWT 토큰
   * @returns {Promise} 토큰 검증 응답
   */
  verifyToken: async (token) => {
    const response = await api.get(API_ENDPOINTS.AUTH.VERIFY);
    return response.data;
  },

  /**
   * 역할 전환
   * @param {string} businessId - 사업장 ID
   * @param {string} role - 역할 (owner, manager, worker, seeker)
   * @returns {Promise} 역할 전환 응답
   */
  switchRole: async (businessId, role) => {
    const response = await api.post(API_ENDPOINTS.AUTH.SWITCH_ROLE, {
      businessId,
      role
    });
    return response.data;
  },

  /**
   * 로그아웃
   * @returns {Promise} 로그아웃 응답
   */
  logout: async () => {
    const response = await api.post(API_ENDPOINTS.AUTH.LOGOUT);
    return response.data;
  },

  /**
   * 토큰 갱신
   * @param {string} refreshToken - 리프레시 토큰
   * @returns {Promise} 새로운 토큰
   */
  refreshToken: async (refreshToken) => {
    const response = await api.post(API_ENDPOINTS.AUTH.REFRESH, {
      refreshToken
    });
    return response.data;
  },

  /**
   * 비밀번호 찾기
   * @param {string} email - 이메일
   * @returns {Promise} 비밀번호 재설정 이메일 발송 응답
   */
  forgotPassword: async (email) => {
    const response = await api.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
      email
    });
    return response.data;
  },

  /**
   * 비밀번호 재설정
   * @param {string} token - 재설정 토큰
   * @param {string} newPassword - 새 비밀번호
   * @returns {Promise} 비밀번호 재설정 응답
   */
  resetPassword: async (token, newPassword) => {
    const response = await api.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, {
      token,
      newPassword
    });
    return response.data;
  }
};

export default authService;