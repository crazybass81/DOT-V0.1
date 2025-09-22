/**
 * 인증 서비스 통합 테스트
 * TDD 방식: 테스트 작성 → 실패 → 구현 → 성공
 */

import authService from '../auth.service';
import apiClient from '../api-client';
import { store } from '../../store';
import { setUser, clearUser } from '../../store/slices/authSlice';

// Mock 설정
jest.mock('../api-client');
jest.mock('../../store');

describe('AuthService - API 통합 테스트', () => {
  beforeEach(() => {
    // 각 테스트 전 초기화
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('로그인 기능', () => {
    it('유효한 자격증명으로 로그인 성공해야 함', async () => {
      // Given: 로그인 응답 모의
      const mockResponse = {
        data: {
          success: true,
          data: {
            token: 'mock-jwt-token',
            refreshToken: 'mock-refresh-token',
            user: {
              id: 'user_123',
              email: 'test@example.com',
              name: '테스트 사용자',
              role: 'worker',
              restaurantId: 'restaurant_123'
            }
          }
        }
      };

      apiClient.post.mockResolvedValue(mockResponse);
      store.dispatch = jest.fn();

      // When: 로그인 실행
      const result = await authService.login('test@example.com', 'password123');

      // Then: 검증
      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123'
      });

      expect(localStorage.getItem('token')).toBe('mock-jwt-token');
      expect(localStorage.getItem('refreshToken')).toBe('mock-refresh-token');

      expect(store.dispatch).toHaveBeenCalledWith(
        setUser(mockResponse.data.data.user)
      );

      expect(result).toEqual(mockResponse.data.data);
    });

    it('잘못된 자격증명으로 로그인 실패해야 함', async () => {
      // Given: 에러 응답 모의
      const mockError = {
        response: {
          status: 401,
          data: {
            success: false,
            message: '이메일 또는 비밀번호가 올바르지 않습니다'
          }
        }
      };

      apiClient.post.mockRejectedValue(mockError);

      // When & Then: 에러 발생 검증
      await expect(
        authService.login('wrong@example.com', 'wrongpassword')
      ).rejects.toThrow('이메일 또는 비밀번호가 올바르지 않습니다');

      expect(localStorage.getItem('token')).toBeNull();
      expect(store.dispatch).not.toHaveBeenCalled();
    });

    it('네트워크 오류 시 적절한 에러 메시지 반환해야 함', async () => {
      // Given: 네트워크 에러
      apiClient.post.mockRejectedValue(new Error('Network Error'));

      // When & Then
      await expect(
        authService.login('test@example.com', 'password')
      ).rejects.toThrow('네트워크 오류가 발생했습니다');
    });
  });

  describe('토큰 갱신 기능', () => {
    it('리프레시 토큰으로 새 토큰 발급받아야 함', async () => {
      // Given
      localStorage.setItem('refreshToken', 'old-refresh-token');

      const mockResponse = {
        data: {
          success: true,
          data: {
            token: 'new-jwt-token'
          }
        }
      };

      apiClient.post.mockResolvedValue(mockResponse);

      // When
      const newToken = await authService.refreshToken();

      // Then
      expect(apiClient.post).toHaveBeenCalledWith('/auth/refresh', {
        refreshToken: 'old-refresh-token'
      });

      expect(localStorage.getItem('token')).toBe('new-jwt-token');
      expect(apiClient.defaults.headers.common['Authorization']).toBe('Bearer new-jwt-token');
      expect(newToken).toBe('new-jwt-token');
    });

    it('리프레시 토큰 없을 때 에러 발생해야 함', async () => {
      // Given: 리프레시 토큰 없음
      localStorage.clear();

      // When & Then
      await expect(authService.refreshToken()).rejects.toThrow(
        'No refresh token available'
      );
    });
  });

  describe('로그아웃 기능', () => {
    it('로그아웃 시 모든 인증 정보 제거해야 함', async () => {
      // Given
      localStorage.setItem('token', 'jwt-token');
      localStorage.setItem('refreshToken', 'refresh-token');
      apiClient.defaults.headers.common['Authorization'] = 'Bearer jwt-token';

      apiClient.post.mockResolvedValue({ data: { success: true } });
      store.dispatch = jest.fn();

      // When
      await authService.logout();

      // Then
      expect(apiClient.post).toHaveBeenCalledWith('/auth/logout');
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(apiClient.defaults.headers.common['Authorization']).toBeUndefined();
      expect(store.dispatch).toHaveBeenCalledWith(clearUser());
    });

    it('로그아웃 API 실패해도 로컬 정보는 제거해야 함', async () => {
      // Given
      localStorage.setItem('token', 'jwt-token');
      localStorage.setItem('refreshToken', 'refresh-token');

      apiClient.post.mockRejectedValue(new Error('Server Error'));
      store.dispatch = jest.fn();

      // When
      await authService.logout();

      // Then: API 실패해도 로컬 정리는 수행
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(store.dispatch).toHaveBeenCalledWith(clearUser());
    });
  });

  describe('역할 전환 기능', () => {
    it('사장님↔직원 역할 전환 성공해야 함', async () => {
      // Given
      const mockResponse = {
        data: {
          success: true,
          data: {
            user: {
              id: 'user_123',
              email: 'test@example.com',
              role: 'owner',
              permissions: ['manage_workers', 'view_reports']
            }
          }
        }
      };

      apiClient.post.mockResolvedValue(mockResponse);
      store.dispatch = jest.fn();

      // When
      const result = await authService.switchRole('owner');

      // Then
      expect(apiClient.post).toHaveBeenCalledWith('/auth/switch-role', {
        role: 'owner'
      });

      expect(store.dispatch).toHaveBeenCalledWith(
        setUser(mockResponse.data.data.user)
      );

      expect(result).toEqual(mockResponse.data.data);
    });

    it('권한 없는 역할 전환 시 에러 발생해야 함', async () => {
      // Given
      const mockError = {
        response: {
          status: 403,
          data: {
            success: false,
            message: '해당 역할로 전환할 권한이 없습니다'
          }
        }
      };

      apiClient.post.mockRejectedValue(mockError);

      // When & Then
      await expect(
        authService.switchRole('admin')
      ).rejects.toThrow('해당 역할로 전환할 권한이 없습니다');
    });
  });

  describe('회원가입 기능', () => {
    it('신규 사용자 등록 성공해야 함', async () => {
      // Given
      const userData = {
        email: 'new@example.com',
        password: 'password123',
        name: '신규 사용자',
        phone: '010-1234-5678',
        role: 'worker'
      };

      const mockResponse = {
        data: {
          success: true,
          data: {
            user: {
              id: 'user_new',
              ...userData,
              createdAt: '2025-09-22T10:00:00Z'
            },
            message: '회원가입이 완료되었습니다'
          }
        }
      };

      apiClient.post.mockResolvedValue(mockResponse);

      // When
      const result = await authService.register(userData);

      // Then
      expect(apiClient.post).toHaveBeenCalledWith('/auth/register', userData);
      expect(result).toEqual(mockResponse.data.data);
    });

    it('중복 이메일로 가입 시 에러 발생해야 함', async () => {
      // Given
      const mockError = {
        response: {
          status: 409,
          data: {
            success: false,
            message: '이미 등록된 이메일입니다'
          }
        }
      };

      apiClient.post.mockRejectedValue(mockError);

      // When & Then
      await expect(
        authService.register({
          email: 'existing@example.com',
          password: 'password123'
        })
      ).rejects.toThrow('이미 등록된 이메일입니다');
    });
  });

  describe('비밀번호 재설정', () => {
    it('비밀번호 재설정 요청 성공해야 함', async () => {
      // Given
      const mockResponse = {
        data: {
          success: true,
          message: '비밀번호 재설정 이메일을 전송했습니다'
        }
      };

      apiClient.post.mockResolvedValue(mockResponse);

      // When
      const result = await authService.requestPasswordReset('test@example.com');

      // Then
      expect(apiClient.post).toHaveBeenCalledWith('/auth/reset-password-request', {
        email: 'test@example.com'
      });

      expect(result.message).toBe('비밀번호 재설정 이메일을 전송했습니다');
    });

    it('새 비밀번호 설정 성공해야 함', async () => {
      // Given
      const mockResponse = {
        data: {
          success: true,
          message: '비밀번호가 변경되었습니다'
        }
      };

      apiClient.post.mockResolvedValue(mockResponse);

      // When
      const result = await authService.resetPassword('reset-token-123', 'newPassword123');

      // Then
      expect(apiClient.post).toHaveBeenCalledWith('/auth/reset-password', {
        token: 'reset-token-123',
        newPassword: 'newPassword123'
      });

      expect(result.message).toBe('비밀번호가 변경되었습니다');
    });
  });

  describe('세션 관리', () => {
    it('현재 사용자 정보 가져오기', async () => {
      // Given
      const mockResponse = {
        data: {
          success: true,
          data: {
            user: {
              id: 'user_123',
              email: 'test@example.com',
              role: 'worker',
              restaurant: {
                id: 'restaurant_123',
                name: '테스트 식당'
              }
            }
          }
        }
      };

      apiClient.get.mockResolvedValue(mockResponse);

      // When
      const user = await authService.getCurrentUser();

      // Then
      expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
      expect(user).toEqual(mockResponse.data.data.user);
    });

    it('인증되지 않은 상태에서 사용자 정보 요청 시 에러', async () => {
      // Given
      const mockError = {
        response: {
          status: 401,
          data: {
            success: false,
            message: '인증이 필요합니다'
          }
        }
      };

      apiClient.get.mockRejectedValue(mockError);

      // When & Then
      await expect(authService.getCurrentUser()).rejects.toThrow('인증이 필요합니다');
    });
  });
});

/**
 * 통합 테스트 헬퍼 함수
 */
export const authTestHelpers = {
  // 테스트용 사용자 생성
  createTestUser: () => ({
    email: `test_${Date.now()}@example.com`,
    password: 'Test123!@#',
    name: '테스트 사용자',
    phone: '010-0000-0000',
    role: 'worker'
  }),

  // 테스트용 토큰 생성
  createTestToken: () => `test_jwt_${Date.now()}`,

  // 로그인 상태 시뮬레이션
  simulateLoggedIn: () => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('refreshToken', 'test-refresh-token');
    apiClient.defaults.headers.common['Authorization'] = 'Bearer test-token';
  },

  // 로그아웃 상태 시뮬레이션
  simulateLoggedOut: () => {
    localStorage.clear();
    delete apiClient.defaults.headers.common['Authorization'];
  }
};