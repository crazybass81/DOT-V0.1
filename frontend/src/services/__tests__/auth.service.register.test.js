/**
 * 인증 서비스 - 회원가입 기능 테스트
 * TDD 방식으로 작성된 통합 테스트
 */

import authService from '../auth.service';
import api from '../api-client';

// Mock API client
jest.mock('../api-client');

describe('Auth Service - 회원가입', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register 메서드', () => {
    it('유효한 사용자 정보로 회원가입을 성공해야 함', async () => {
      // Given
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: '테스트사용자',
        phone: '010-1234-5678'
      };

      const mockResponse = {
        data: {
          success: true,
          message: '회원가입이 완료되었습니다',
          user: {
            id: 'user-uuid',
            email: userData.email,
            name: userData.name,
            role: 'seeker'
          }
        }
      };

      api.post.mockResolvedValue(mockResponse);

      // When
      const result = await authService.register(userData);

      // Then
      expect(api.post).toHaveBeenCalledWith('/auth/register', userData);
      expect(result).toEqual(mockResponse.data);
      expect(result.success).toBe(true);
      expect(result.user.email).toBe(userData.email);
    });

    it('중복 이메일 에러를 적절히 처리해야 함', async () => {
      // Given
      const userData = {
        email: 'duplicate@example.com',
        password: 'SecurePass123!',
        name: '중복사용자',
        phone: '010-5555-5555'
      };

      const mockError = {
        response: {
          status: 409,
          data: {
            success: false,
            message: '이미 등록된 이메일입니다',
            error: {
              code: 'EMAIL_ALREADY_EXISTS'
            }
          }
        }
      };

      api.post.mockRejectedValue(mockError);

      // When & Then
      await expect(authService.register(userData))
        .rejects
        .toThrow('이미 등록된 이메일입니다');

      expect(api.post).toHaveBeenCalledWith('/auth/register', userData);
    });

    it('유효성 검사 실패 에러를 적절히 처리해야 함', async () => {
      // Given
      const invalidData = {
        email: 'invalid-email',
        password: 'weak',
        name: 'A', // 너무 짧음
        phone: '123456789' // 잘못된 형식
      };

      const mockError = {
        response: {
          status: 400,
          data: {
            success: false,
            message: '올바른 이메일 형식이 아닙니다',
            errors: [
              { field: 'email', message: '올바른 이메일 형식이 아닙니다' },
              { field: 'password', message: '비밀번호는 최소 8자 이상이어야 합니다' },
              { field: 'name', message: '이름은 최소 2자 이상이어야 합니다' },
              { field: 'phone', message: '전화번호 형식은 010-XXXX-XXXX여야 합니다' }
            ]
          }
        }
      };

      api.post.mockRejectedValue(mockError);

      // When & Then
      await expect(authService.register(invalidData))
        .rejects
        .toThrow('올바른 이메일 형식이 아닙니다');
    });

    it('네트워크 에러를 적절히 처리해야 함', async () => {
      // Given
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: '테스트',
        phone: '010-9999-9999'
      };

      const networkError = {
        request: {},
        message: 'Network Error'
      };

      api.post.mockRejectedValue(networkError);

      // When & Then
      await expect(authService.register(userData))
        .rejects
        .toThrow('네트워크 오류가 발생했습니다');
    });

    it('서버 에러를 적절히 처리해야 함', async () => {
      // Given
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: '테스트',
        phone: '010-8888-8888'
      };

      const serverError = {
        response: {
          status: 500,
          data: {
            success: false,
            message: '서버 오류가 발생했습니다'
          }
        }
      };

      api.post.mockRejectedValue(serverError);

      // When & Then
      await expect(authService.register(userData))
        .rejects
        .toThrow('서버 오류가 발생했습니다');
    });
  });

  describe('입력 데이터 변환', () => {
    it('이메일을 소문자로 변환해야 함', async () => {
      // Given
      const userData = {
        email: 'TEST@EXAMPLE.COM',
        password: 'SecurePass123!',
        name: '테스트',
        phone: '010-7777-7777'
      };

      const mockResponse = {
        data: {
          success: true,
          user: {
            email: 'test@example.com' // 소문자로 변환됨
          }
        }
      };

      api.post.mockResolvedValue(mockResponse);

      // When
      await authService.register(userData);

      // Then
      expect(api.post).toHaveBeenCalledWith('/auth/register', {
        ...userData,
        email: 'test@example.com' // 소문자로 변환되어 전송
      });
    });

    it('이름과 전화번호의 공백을 제거해야 함', async () => {
      // Given
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: '  테스트  사용자  ',
        phone: '  010-6666-6666  '
      };

      api.post.mockResolvedValue({ data: { success: true } });

      // When
      await authService.register(userData);

      // Then
      expect(api.post).toHaveBeenCalledWith('/auth/register', {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: '테스트 사용자', // 앞뒤 공백 제거, 중간 공백은 하나로
        phone: '010-6666-6666' // 공백 제거
      });
    });
  });

  describe('응답 처리', () => {
    it('회원가입 성공 시 적절한 응답을 반환해야 함', async () => {
      // Given
      const userData = {
        email: 'success@example.com',
        password: 'SecurePass123!',
        name: '성공사용자',
        phone: '010-4444-4444'
      };

      const expectedResponse = {
        success: true,
        message: '회원가입이 완료되었습니다',
        user: {
          id: 'new-user-id',
          email: userData.email,
          name: userData.name,
          role: 'seeker',
          createdAt: '2025-09-22T10:00:00Z'
        }
      };

      api.post.mockResolvedValue({ data: expectedResponse });

      // When
      const result = await authService.register(userData);

      // Then
      expect(result).toEqual(expectedResponse);
      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('createdAt');
    });

    it('회원가입 후 토큰을 반환하지 않아야 함', async () => {
      // 회원가입 후 바로 로그인하지 않고, 별도로 로그인하도록 유도
      const userData = {
        email: 'notoken@example.com',
        password: 'SecurePass123!',
        name: '노토큰',
        phone: '010-3333-3333'
      };

      const response = {
        success: true,
        user: { id: '123' }
        // token이 없음
      };

      api.post.mockResolvedValue({ data: response });

      // When
      const result = await authService.register(userData);

      // Then
      expect(result).not.toHaveProperty('token');
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  describe('에러 메시지 한글화', () => {
    it('영문 에러 메시지를 한글로 변환해야 함', async () => {
      const errorMappings = [
        {
          english: 'Email already exists',
          korean: '이미 등록된 이메일입니다'
        },
        {
          english: 'Invalid email format',
          korean: '올바른 이메일 형식이 아닙니다'
        },
        {
          english: 'Password too weak',
          korean: '비밀번호가 너무 약합니다'
        }
      ];

      for (const mapping of errorMappings) {
        api.post.mockRejectedValue({
          response: {
            status: 400,
            data: { message: mapping.english }
          }
        });

        await expect(authService.register({}))
          .rejects
          .toThrow(mapping.korean);
      }
    });
  });
});