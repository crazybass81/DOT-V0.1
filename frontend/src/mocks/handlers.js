/**
 * MSW(Mock Service Worker) 핸들러
 * API 모킹을 통한 프론트엔드 독립 개발 지원
 */

import { rest } from 'msw';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Mock 데이터
const mockUsers = [
  {
    id: 'user_001',
    email: 'owner@test.com',
    password: 'password123', // 실제로는 해시되어 저장
    name: '김사장',
    role: 'owner',
    phone: '010-1234-5678',
    restaurantId: 'restaurant_001',
    createdAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'user_002',
    email: 'worker@test.com',
    password: 'password123',
    name: '이직원',
    role: 'worker',
    phone: '010-8765-4321',
    restaurantId: 'restaurant_001',
    createdAt: '2025-01-01T00:00:00Z'
  }
];

let currentUser = null;
let authToken = null;

export const handlers = [
  // 로그인
  rest.post(`${API_BASE_URL}/v1/auth/login`, async (req, res, ctx) => {
    const { email, password } = await req.json();

    // Mock 사용자 찾기
    const user = mockUsers.find(u => u.email === email && u.password === password);

    if (!user) {
      return res(
        ctx.status(401),
        ctx.json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: '이메일 또는 비밀번호가 올바르지 않습니다'
          }
        })
      );
    }

    // 토큰 생성 (실제로는 JWT)
    const token = `mock-jwt-token-${Date.now()}`;
    const refreshToken = `mock-refresh-token-${Date.now()}`;

    currentUser = { ...user };
    delete currentUser.password;
    authToken = token;

    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        data: {
          token,
          refreshToken,
          user: currentUser
        },
        message: '로그인 성공'
      })
    );
  }),

  // 회원가입
  rest.post(`${API_BASE_URL}/v1/auth/register`, async (req, res, ctx) => {
    const userData = await req.json();

    // 이메일 중복 체크
    if (mockUsers.find(u => u.email === userData.email)) {
      return res(
        ctx.status(409),
        ctx.json({
          success: false,
          error: {
            code: 'EMAIL_EXISTS',
            message: '이미 등록된 이메일입니다'
          }
        })
      );
    }

    // 새 사용자 생성
    const newUser = {
      id: `user_${Date.now()}`,
      ...userData,
      createdAt: new Date().toISOString()
    };

    mockUsers.push(newUser);

    const userResponse = { ...newUser };
    delete userResponse.password;

    return res(
      ctx.status(201),
      ctx.json({
        success: true,
        data: {
          user: userResponse
        },
        message: '회원가입이 완료되었습니다'
      })
    );
  }),

  // 토큰 갱신
  rest.post(`${API_BASE_URL}/v1/auth/refresh`, async (req, res, ctx) => {
    const { refreshToken } = await req.json();

    if (!refreshToken || !refreshToken.startsWith('mock-refresh-token')) {
      return res(
        ctx.status(401),
        ctx.json({
          success: false,
          error: {
            code: 'INVALID_REFRESH_TOKEN',
            message: '유효하지 않은 리프레시 토큰입니다'
          }
        })
      );
    }

    const newToken = `mock-jwt-token-${Date.now()}`;

    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        data: {
          token: newToken
        }
      })
    );
  }),

  // 로그아웃
  rest.post(`${API_BASE_URL}/v1/auth/logout`, (req, res, ctx) => {
    currentUser = null;
    authToken = null;

    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        message: '로그아웃되었습니다'
      })
    );
  }),

  // 현재 사용자 정보
  rest.get(`${API_BASE_URL}/v1/auth/me`, (req, res, ctx) => {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res(
        ctx.status(401),
        ctx.json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '인증이 필요합니다'
          }
        })
      );
    }

    if (!currentUser) {
      return res(
        ctx.status(401),
        ctx.json({
          success: false,
          error: {
            code: 'SESSION_EXPIRED',
            message: '세션이 만료되었습니다'
          }
        })
      );
    }

    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        data: {
          user: currentUser
        }
      })
    );
  }),

  // 역할 전환
  rest.post(`${API_BASE_URL}/v1/auth/switch-role`, async (req, res, ctx) => {
    const { role } = await req.json();
    const authHeader = req.headers.get('Authorization');

    if (!authHeader || !currentUser) {
      return res(
        ctx.status(401),
        ctx.json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '인증이 필요합니다'
          }
        })
      );
    }

    // Owner만 역할 전환 가능
    if (currentUser.role !== 'owner' && role === 'owner') {
      return res(
        ctx.status(403),
        ctx.json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '해당 역할로 전환할 권한이 없습니다'
          }
        })
      );
    }

    currentUser.role = role;

    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        data: {
          user: currentUser
        }
      })
    );
  }),

  // 비밀번호 재설정 요청
  rest.post(`${API_BASE_URL}/v1/auth/reset-password-request`, async (req, res, ctx) => {
    const { email } = await req.json();

    const user = mockUsers.find(u => u.email === email);

    // 보안상 이메일 존재 여부와 관계없이 같은 응답
    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        message: '비밀번호 재설정 이메일을 전송했습니다'
      })
    );
  }),

  // 비밀번호 재설정
  rest.post(`${API_BASE_URL}/v1/auth/reset-password`, async (req, res, ctx) => {
    const { token, newPassword } = await req.json();

    if (!token || !token.startsWith('reset-token')) {
      return res(
        ctx.status(400),
        ctx.json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: '유효하지 않은 토큰입니다'
          }
        })
      );
    }

    // 실제로는 토큰으로 사용자를 찾아 비밀번호 업데이트
    return res(
      ctx.status(200),
      ctx.json({
        success: true,
        message: '비밀번호가 변경되었습니다'
      })
    );
  })
];

// Mock 데이터 초기화 함수 (테스트용)
export const resetMockData = () => {
  currentUser = null;
  authToken = null;
  mockUsers.length = 2; // 초기 사용자만 유지
};

// 현재 상태 확인 함수 (테스트용)
export const getMockState = () => ({
  currentUser,
  authToken,
  users: mockUsers
});