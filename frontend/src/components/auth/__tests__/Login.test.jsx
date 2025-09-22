/**
 * 로그인 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import Login from '../Login';
import authReducer from '../../../store/slices/authSlice';

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// 테스트용 스토어 생성 헬퍼
const createTestStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      auth: authReducer,
    },
    preloadedState: {
      auth: {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        ...initialState,
      },
    },
  });
};

// 컴포넌트 렌더링 헬퍼
const renderLogin = (store = createTestStore()) => {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    </Provider>
  );
};

describe('Login Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UI 렌더링', () => {
    it('로그인 폼이 올바르게 렌더링되어야 함', () => {
      renderLogin();

      // 제목
      expect(screen.getByText('DOT Platform 로그인')).toBeInTheDocument();

      // 입력 필드
      expect(screen.getByLabelText(/이메일 주소/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/비밀번호/i)).toBeInTheDocument();

      // 체크박스
      expect(screen.getByLabelText(/자동 로그인/i)).toBeInTheDocument();

      // 버튼
      expect(screen.getByRole('button', { name: /로그인/i })).toBeInTheDocument();

      // 링크
      expect(screen.getByText(/비밀번호를 잊으셨나요\?/i)).toBeInTheDocument();
      expect(screen.getByText(/회원가입/i)).toBeInTheDocument();
    });

    it('개발 환경에서 테스트 계정 버튼이 표시되어야 함', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      renderLogin();

      expect(screen.getByText(/테스트 계정으로 로그인:/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /사장님/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /직원/i })).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('폼 유효성 검사', () => {
    it('빈 폼 제출 시 에러 메시지가 표시되어야 함', async () => {
      renderLogin();

      const submitButton = screen.getByRole('button', { name: /로그인/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/이메일을 입력해주세요/i)).toBeInTheDocument();
        expect(screen.getByText(/비밀번호를 입력해주세요/i)).toBeInTheDocument();
      });
    });

    it('잘못된 이메일 형식 입력 시 에러 메시지가 표시되어야 함', async () => {
      renderLogin();

      const emailInput = screen.getByLabelText(/이메일 주소/i);
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

      const submitButton = screen.getByRole('button', { name: /로그인/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/올바른 이메일 형식이 아닙니다/i)).toBeInTheDocument();
      });
    });

    it('짧은 비밀번호 입력 시 에러 메시지가 표시되어야 함', async () => {
      renderLogin();

      const passwordInput = screen.getByLabelText(/비밀번호/i);
      fireEvent.change(passwordInput, { target: { value: '123' } });

      const submitButton = screen.getByRole('button', { name: /로그인/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/비밀번호는 6자 이상이어야 합니다/i)).toBeInTheDocument();
      });
    });
  });

  describe('로그인 기능', () => {
    it('유효한 자격증명으로 로그인 성공 시 대시보드로 이동해야 함', async () => {
      const store = createTestStore();
      renderLogin(store);

      // 이메일과 비밀번호 입력
      fireEvent.change(screen.getByLabelText(/이메일 주소/i), {
        target: { value: 'test@example.com' }
      });
      fireEvent.change(screen.getByLabelText(/비밀번호/i), {
        target: { value: 'password123' }
      });

      // 로그인 버튼 클릭
      fireEvent.click(screen.getByRole('button', { name: /로그인/i }));

      // MSW가 모킹한 응답을 기다림
      await waitFor(() => {
        expect(store.getState().auth.isAuthenticated).toBe(true);
      });
    });

    it('로그인 실패 시 에러 메시지가 표시되어야 함', async () => {
      const errorMessage = '이메일 또는 비밀번호가 올바르지 않습니다';

      const store = createTestStore({ error: errorMessage });
      renderLogin(store);

      // 에러 메시지가 표시되는지 확인
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it('자동 로그인 체크박스가 정상 작동해야 함', () => {
      renderLogin();

      const rememberMeCheckbox = screen.getByLabelText(/자동 로그인/i);

      expect(rememberMeCheckbox).not.toBeChecked();

      fireEvent.click(rememberMeCheckbox);
      expect(rememberMeCheckbox).toBeChecked();

      fireEvent.click(rememberMeCheckbox);
      expect(rememberMeCheckbox).not.toBeChecked();
    });
  });

  describe('테스트 계정 기능', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('사장님 테스트 계정 버튼 클릭 시 폼이 자동 채워져야 함', () => {
      renderLogin();

      const ownerButton = screen.getByRole('button', { name: /사장님/i });
      fireEvent.click(ownerButton);

      const emailInput = screen.getByLabelText(/이메일 주소/i);
      const passwordInput = screen.getByLabelText(/비밀번호/i);

      expect(emailInput.value).toBe('owner@test.com');
      expect(passwordInput.value).toBe('password123');
    });

    it('직원 테스트 계정 버튼 클릭 시 폼이 자동 채워져야 함', () => {
      renderLogin();

      const workerButton = screen.getByRole('button', { name: /직원/i });
      fireEvent.click(workerButton);

      const emailInput = screen.getByLabelText(/이메일 주소/i);
      const passwordInput = screen.getByLabelText(/비밀번호/i);

      expect(emailInput.value).toBe('worker@test.com');
      expect(passwordInput.value).toBe('password123');
    });
  });

  describe('로딩 상태', () => {
    it('로딩 중일 때 입력 필드와 버튼이 비활성화되어야 함', () => {
      const store = createTestStore({ isLoading: true });
      renderLogin(store);

      expect(screen.getByLabelText(/이메일 주소/i)).toBeDisabled();
      expect(screen.getByLabelText(/비밀번호/i)).toBeDisabled();
      expect(screen.getByLabelText(/자동 로그인/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /로그인 중.../i })).toBeDisabled();
    });
  });

  describe('인증 상태', () => {
    it('이미 인증된 상태면 대시보드로 리다이렉트해야 함', () => {
      const store = createTestStore({ isAuthenticated: true });
      renderLogin(store);

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });
});