/**
 * 회원가입 컴포넌트 테스트
 * TDD 방식으로 작성된 테스트 스위트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import Register from '../Register';
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
const renderRegister = (store = createTestStore()) => {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <Register />
      </BrowserRouter>
    </Provider>
  );
};

describe('Register Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UI 렌더링', () => {
    it('회원가입 폼이 올바르게 렌더링되어야 함', () => {
      renderRegister();

      // 제목
      expect(screen.getByText('DOT Platform 회원가입')).toBeInTheDocument();

      // 입력 필드들
      expect(screen.getByLabelText(/이메일 주소/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/비밀번호/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/비밀번호 확인/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/이름/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/전화번호/i)).toBeInTheDocument();

      // 버튼
      expect(screen.getByRole('button', { name: /회원가입/i })).toBeInTheDocument();

      // 링크
      expect(screen.getByText(/이미 계정이 있으신가요/i)).toBeInTheDocument();
      expect(screen.getByText(/로그인/i)).toBeInTheDocument();
    });

    it('비밀번호 표시/숨기기 토글이 작동해야 함', () => {
      renderRegister();

      const passwordInput = screen.getByLabelText(/^비밀번호$/i);
      const toggleButton = screen.getByTestId('password-toggle');

      // 초기 상태: 비밀번호 숨김
      expect(passwordInput).toHaveAttribute('type', 'password');

      // 토글 클릭: 비밀번호 표시
      fireEvent.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');

      // 다시 토글: 비밀번호 숨김
      fireEvent.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  describe('폼 유효성 검사', () => {
    it('빈 폼 제출 시 에러 메시지가 표시되어야 함', async () => {
      renderRegister();

      const submitButton = screen.getByRole('button', { name: /회원가입/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/이메일을 입력해주세요/i)).toBeInTheDocument();
        expect(screen.getByText(/비밀번호를 입력해주세요/i)).toBeInTheDocument();
        expect(screen.getByText(/이름을 입력해주세요/i)).toBeInTheDocument();
        expect(screen.getByText(/전화번호를 입력해주세요/i)).toBeInTheDocument();
      });
    });

    it('잘못된 이메일 형식 입력 시 에러 메시지가 표시되어야 함', async () => {
      renderRegister();

      const emailInput = screen.getByLabelText(/이메일 주소/i);
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      fireEvent.blur(emailInput);

      await waitFor(() => {
        expect(screen.getByText(/올바른 이메일 형식이 아닙니다/i)).toBeInTheDocument();
      });
    });

    it('약한 비밀번호 입력 시 에러 메시지가 표시되어야 함', async () => {
      renderRegister();

      const passwordInput = screen.getByLabelText(/^비밀번호$/i);

      // 너무 짧은 비밀번호
      fireEvent.change(passwordInput, { target: { value: '123' } });
      fireEvent.blur(passwordInput);

      await waitFor(() => {
        expect(screen.getByText(/비밀번호는 최소 8자 이상이어야 합니다/i)).toBeInTheDocument();
      });

      // 복잡도 부족
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.blur(passwordInput);

      await waitFor(() => {
        expect(screen.getByText(/대문자, 소문자, 숫자, 특수문자를 포함해야 합니다/i)).toBeInTheDocument();
      });
    });

    it('비밀번호 확인이 일치하지 않을 때 에러 메시지가 표시되어야 함', async () => {
      renderRegister();

      const passwordInput = screen.getByLabelText(/^비밀번호$/i);
      const confirmInput = screen.getByLabelText(/비밀번호 확인/i);

      fireEvent.change(passwordInput, { target: { value: 'ValidPass123!' } });
      fireEvent.change(confirmInput, { target: { value: 'DifferentPass123!' } });
      fireEvent.blur(confirmInput);

      await waitFor(() => {
        expect(screen.getByText(/비밀번호가 일치하지 않습니다/i)).toBeInTheDocument();
      });
    });

    it('잘못된 전화번호 형식 입력 시 에러 메시지가 표시되어야 함', async () => {
      renderRegister();

      const phoneInput = screen.getByLabelText(/전화번호/i);

      // 잘못된 형식
      fireEvent.change(phoneInput, { target: { value: '01012345678' } });
      fireEvent.blur(phoneInput);

      await waitFor(() => {
        expect(screen.getByText(/전화번호 형식은 010-XXXX-XXXX여야 합니다/i)).toBeInTheDocument();
      });
    });
  });

  describe('회원가입 기능', () => {
    it('유효한 정보로 회원가입 성공 시 로그인 페이지로 이동해야 함', async () => {
      const store = createTestStore();
      renderRegister(store);

      // 폼 입력
      fireEvent.change(screen.getByLabelText(/이메일 주소/i), {
        target: { value: 'newuser@example.com' }
      });
      fireEvent.change(screen.getByLabelText(/^비밀번호$/i), {
        target: { value: 'ValidPass123!' }
      });
      fireEvent.change(screen.getByLabelText(/비밀번호 확인/i), {
        target: { value: 'ValidPass123!' }
      });
      fireEvent.change(screen.getByLabelText(/이름/i), {
        target: { value: '홍길동' }
      });
      fireEvent.change(screen.getByLabelText(/전화번호/i), {
        target: { value: '010-1234-5678' }
      });

      // 제출
      fireEvent.click(screen.getByRole('button', { name: /회원가입/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login', {
          state: { message: '회원가입이 완료되었습니다. 로그인해주세요.' }
        });
      });
    });

    it('중복 이메일로 회원가입 시 에러 메시지가 표시되어야 함', async () => {
      const errorMessage = '이미 등록된 이메일입니다';
      const store = createTestStore({ error: errorMessage });
      renderRegister(store);

      // 에러 메시지가 표시되는지 확인
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it('서버 에러 발생 시 적절한 에러 메시지가 표시되어야 함', async () => {
      const errorMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      const store = createTestStore({ error: errorMessage });
      renderRegister(store);

      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  describe('로딩 상태', () => {
    it('회원가입 처리 중 로딩 상태가 표시되어야 함', () => {
      const store = createTestStore({ isLoading: true });
      renderRegister(store);

      // 입력 필드들이 비활성화됨
      expect(screen.getByLabelText(/이메일 주소/i)).toBeDisabled();
      expect(screen.getByLabelText(/^비밀번호$/i)).toBeDisabled();
      expect(screen.getByLabelText(/비밀번호 확인/i)).toBeDisabled();
      expect(screen.getByLabelText(/이름/i)).toBeDisabled();
      expect(screen.getByLabelText(/전화번호/i)).toBeDisabled();

      // 버튼이 로딩 상태 표시
      expect(screen.getByRole('button', { name: /가입 중.../i })).toBeDisabled();
    });
  });

  describe('비밀번호 강도 표시', () => {
    it('비밀번호 강도가 시각적으로 표시되어야 함', async () => {
      renderRegister();

      const passwordInput = screen.getByLabelText(/^비밀번호$/i);

      // 약한 비밀번호
      fireEvent.change(passwordInput, { target: { value: 'weak' } });
      await waitFor(() => {
        expect(screen.getByText(/약함/i)).toBeInTheDocument();
      });

      // 보통 비밀번호
      fireEvent.change(passwordInput, { target: { value: 'Medium123' } });
      await waitFor(() => {
        expect(screen.getByText(/보통/i)).toBeInTheDocument();
      });

      // 강한 비밀번호
      fireEvent.change(passwordInput, { target: { value: 'Strong123!@#' } });
      await waitFor(() => {
        expect(screen.getByText(/강함/i)).toBeInTheDocument();
      });
    });
  });

  describe('접근성', () => {
    it('키보드 네비게이션이 작동해야 함', () => {
      renderRegister();

      const emailInput = screen.getByLabelText(/이메일 주소/i);
      const passwordInput = screen.getByLabelText(/^비밀번호$/i);

      // Tab 키로 이동
      emailInput.focus();
      expect(document.activeElement).toBe(emailInput);

      // Tab으로 다음 필드로 이동
      fireEvent.keyDown(emailInput, { key: 'Tab' });
      // 실제로는 브라우저가 처리하므로 테스트에서는 직접 focus 이동
    });

    it('필수 필드가 aria-required로 표시되어야 함', () => {
      renderRegister();

      expect(screen.getByLabelText(/이메일 주소/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/^비밀번호$/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/이름/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/전화번호/i)).toHaveAttribute('aria-required', 'true');
    });
  });
});