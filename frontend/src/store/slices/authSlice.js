/**
 * DOT Platform Frontend - 인증 상태 관리
 * 사용자 로그인, 역할 전환, 토큰 관리를 담당하는 Redux slice
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import authService from '../../services/auth.service';

// 초기 상태 정의
const initialState = {
  // 사용자 정보
  user: null,
  token: null,
  refreshToken: null,

  // 현재 선택된 사업장 및 역할
  currentBusiness: null,
  currentRole: null,
  availableBusinesses: [],

  // 로딩 상태
  isLoading: false,
  isAuthenticating: false,

  // 에러 상태
  error: null,

  // 인증 상태
  isAuthenticated: false,
  lastActivity: null,
  sessionExpiresAt: null,

  // 권한 정보
  permissions: [],

  // UI 상태
  showRoleSwitcher: false,
};

// 비동기 액션 정의

// 로그인 액션
export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password, rememberMe = false }, { rejectWithValue }) => {
    try {
      const response = await authService.login({
        email,
        password,
        rememberMe
      });

      // 로그인 성공 시 토큰을 로컬스토리지에 저장
      if (response.token) {
        localStorage.setItem('dot_token', response.token);
        if (response.refreshToken) {
          localStorage.setItem('dot_refresh_token', response.refreshToken);
        }
      }

      return response;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: '로그인에 실패했습니다.' });
    }
  }
);

// 토큰으로 자동 로그인 액션
export const loginWithToken = createAsyncThunk(
  'auth/loginWithToken',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('dot_token');
      if (!token) {
        throw new Error('토큰이 없습니다.');
      }

      const response = await authService.verifyToken(token);
      return response;
    } catch (error) {
      // 토큰이 유효하지 않으면 로컬스토리지에서 제거
      localStorage.removeItem('dot_token');
      localStorage.removeItem('dot_refresh_token');
      return rejectWithValue(error.response?.data || { message: '인증에 실패했습니다.' });
    }
  }
);

// 역할 전환 액션
export const switchRole = createAsyncThunk(
  'auth/switchRole',
  async ({ businessId, role }, { rejectWithValue }) => {
    try {
      const response = await authService.switchRole(businessId, role);
      return {
        businessId,
        role,
        permissions: response.permissions
      };
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: '역할 전환에 실패했습니다.' });
    }
  }
);

// 로그아웃 액션
export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      await authService.logout();

      // 로컬스토리지 정리
      localStorage.removeItem('dot_token');
      localStorage.removeItem('dot_refresh_token');

      return null;
    } catch (error) {
      // 로그아웃은 실패해도 로컬 상태는 정리
      localStorage.removeItem('dot_token');
      localStorage.removeItem('dot_refresh_token');
      return null;
    }
  }
);

// 토큰 갱신 액션
export const refreshToken = createAsyncThunk(
  'auth/refreshToken',
  async (_, { rejectWithValue, getState }) => {
    try {
      const { auth } = getState();
      const refreshToken = auth.refreshToken || localStorage.getItem('dot_refresh_token');

      if (!refreshToken) {
        throw new Error('리프레시 토큰이 없습니다.');
      }

      const response = await authService.refreshToken(refreshToken);

      // 새로운 토큰 저장
      localStorage.setItem('dot_token', response.token);
      if (response.refreshToken) {
        localStorage.setItem('dot_refresh_token', response.refreshToken);
      }

      return response;
    } catch (error) {
      // 토큰 갱신 실패 시 로그아웃 처리
      localStorage.removeItem('dot_token');
      localStorage.removeItem('dot_refresh_token');
      return rejectWithValue(error.response?.data || { message: '토큰 갱신에 실패했습니다.' });
    }
  }
);

// Auth slice 생성
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // 에러 상태 초기화
    clearError: (state) => {
      state.error = null;
    },

    // 마지막 활동 시간 업데이트
    updateLastActivity: (state) => {
      state.lastActivity = Date.now();
    },

    // 역할 전환 UI 토글
    toggleRoleSwitcher: (state) => {
      state.showRoleSwitcher = !state.showRoleSwitcher;
    },

    // 세션 만료 시간 설정
    setSessionExpiry: (state, action) => {
      state.sessionExpiresAt = action.payload;
    },

    // 권한 업데이트
    updatePermissions: (state, action) => {
      state.permissions = action.payload;
    },

    // 수동 로그아웃 (에러 없이)
    forceLogout: (state) => {
      Object.assign(state, {
        ...initialState,
        error: '세션이 만료되었습니다. 다시 로그인해주세요.',
      });
    },
  },
  extraReducers: (builder) => {
    // 로그인 처리
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.isAuthenticating = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        const { user, token, refreshToken, businesses, currentBusiness, currentRole, permissions } = action.payload;

        state.isLoading = false;
        state.isAuthenticating = false;
        state.isAuthenticated = true;
        state.user = user;
        state.token = token;
        state.refreshToken = refreshToken;
        state.availableBusinesses = businesses || [];
        state.currentBusiness = currentBusiness;
        state.currentRole = currentRole;
        state.permissions = permissions || [];
        state.lastActivity = Date.now();
        state.error = null;

        // 세션 만료 시간 계산 (기본 8시간)
        state.sessionExpiresAt = Date.now() + (8 * 60 * 60 * 1000);
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticating = false;
        state.isAuthenticated = false;
        state.error = action.payload?.message || '로그인에 실패했습니다.';
      });

    // 토큰 로그인 처리
    builder
      .addCase(loginWithToken.pending, (state) => {
        state.isLoading = true;
        state.isAuthenticating = true;
      })
      .addCase(loginWithToken.fulfilled, (state, action) => {
        const { user, businesses, currentBusiness, currentRole, permissions } = action.payload;

        state.isLoading = false;
        state.isAuthenticating = false;
        state.isAuthenticated = true;
        state.user = user;
        state.availableBusinesses = businesses || [];
        state.currentBusiness = currentBusiness;
        state.currentRole = currentRole;
        state.permissions = permissions || [];
        state.lastActivity = Date.now();
        state.error = null;
      })
      .addCase(loginWithToken.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticating = false;
        state.isAuthenticated = false;
        state.error = action.payload?.message;

        // 토큰이 유효하지 않으면 로그아웃 상태로 설정
        Object.assign(state, initialState);
      });

    // 역할 전환 처리
    builder
      .addCase(switchRole.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(switchRole.fulfilled, (state, action) => {
        const { businessId, role, permissions } = action.payload;

        state.isLoading = false;
        state.currentBusiness = businessId;
        state.currentRole = role;
        state.permissions = permissions;
        state.showRoleSwitcher = false;
        state.lastActivity = Date.now();
      })
      .addCase(switchRole.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload?.message || '역할 전환에 실패했습니다.';
      });

    // 로그아웃 처리
    builder
      .addCase(logout.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logout.fulfilled, (state) => {
        // 상태를 초기 상태로 리셋
        Object.assign(state, initialState);
      })
      .addCase(logout.rejected, (state) => {
        // 로그아웃 실패해도 상태는 리셋
        Object.assign(state, initialState);
      });

    // 토큰 갱신 처리
    builder
      .addCase(refreshToken.fulfilled, (state, action) => {
        const { token, refreshToken: newRefreshToken } = action.payload;

        state.token = token;
        if (newRefreshToken) {
          state.refreshToken = newRefreshToken;
        }
        state.lastActivity = Date.now();
        state.sessionExpiresAt = Date.now() + (8 * 60 * 60 * 1000);
      })
      .addCase(refreshToken.rejected, (state) => {
        // 토큰 갱신 실패 시 로그아웃 처리
        Object.assign(state, initialState);
      });
  },
});

// 액션 내보내기
export const {
  clearError,
  updateLastActivity,
  toggleRoleSwitcher,
  setSessionExpiry,
  updatePermissions,
  forceLogout,
} = authSlice.actions;

// 셀렉터 함수들
export const selectAuth = (state) => state.auth;
export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectCurrentBusiness = (state) => state.auth.currentBusiness;
export const selectCurrentRole = (state) => state.auth.currentRole;
export const selectPermissions = (state) => state.auth.permissions;
export const selectAvailableBusinesses = (state) => state.auth.availableBusinesses;
export const selectAuthLoading = (state) => state.auth.isLoading;
export const selectAuthError = (state) => state.auth.error;

// 권한 체크 셀렉터
export const selectHasPermission = (permission) => (state) => {
  return state.auth.permissions.includes(permission);
};

// 역할 체크 셀렉터
export const selectIsRole = (role) => (state) => {
  return state.auth.currentRole === role;
};

// 사업장 체크 셀렉터
export const selectIsInBusiness = (businessId) => (state) => {
  return state.auth.currentBusiness === businessId;
};

export default authSlice.reducer;