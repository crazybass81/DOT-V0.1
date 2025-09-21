/**
 * DOT Platform Frontend - 인증 서비스
 * 백엔드 인증 API와 통신하는 서비스 모듈
 * 순환 종속성 해결을 위해 독립적인 API 클라이언트 사용
 */

import api, { API_ENDPOINTS } from './api-client';

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
   * 로그아웃
   * @returns {Promise} 로그아웃 응답
   */
  logout: async () => {
    try {
      const response = await api.post(API_ENDPOINTS.AUTH.LOGOUT);
      return response.data;
    } catch (error) {
      // 로그아웃은 실패해도 클라이언트에서는 성공으로 처리
      console.warn('Logout API failed, clearing local state:', error);
      return { success: true };
    }
  },

  /**
   * 토큰으로 사용자 정보 조회
   * @param {string} token - JWT 토큰
   * @returns {Promise} 사용자 정보 응답
   */
  verifyToken: async (token) => {
    const response = await api.get(API_ENDPOINTS.AUTH.VERIFY, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  },

  /**
   * 토큰 갱신
   * @param {string} refreshToken - 리프레시 토큰
   * @returns {Promise} 새 토큰 응답
   */
  refreshToken: async (refreshToken) => {
    const response = await api.post(API_ENDPOINTS.AUTH.REFRESH, {
      refreshToken,
    });
    return response.data;
  },

  /**
   * 역할 전환
   * @param {string} businessId - 사업장 ID
   * @param {string} role - 전환할 역할
   * @returns {Promise} 역할 전환 응답
   */
  switchRole: async (businessId, role) => {
    const response = await api.post(API_ENDPOINTS.AUTH.SWITCH_ROLE, {
      businessId,
      role,
    });
    return response.data;
  },

  /**
   * 비밀번호 찾기
   * @param {string} email - 이메일
   * @returns {Promise} 비밀번호 찾기 응답
   */
  forgotPassword: async (email) => {
    const response = await api.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
      email,
    });
    return response.data;
  },

  /**
   * 비밀번호 재설정
   * @param {string} token - 재설정 토큰
   * @param {string} password - 새 비밀번호
   * @returns {Promise} 비밀번호 재설정 응답
   */
  resetPassword: async (token, password) => {
    const response = await api.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, {
      token,
      password,
    });
    return response.data;
  },

  /**
   * 비밀번호 변경
   * @param {string} currentPassword - 현재 비밀번호
   * @param {string} newPassword - 새 비밀번호
   * @returns {Promise} 비밀번호 변경 응답
   */
  changePassword: async (currentPassword, newPassword) => {
    const response = await api.post(API_ENDPOINTS.USER.CHANGE_PASSWORD, {
      currentPassword,
      newPassword,
    });
    return response.data;
  },
};

export default authService;