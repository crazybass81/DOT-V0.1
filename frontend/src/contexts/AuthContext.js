/**
 * DOT Platform Frontend - 인증 컨텍스트
 * React Context API를 사용한 인증 상태 관리 (Redux와 함께 사용)
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

// Redux 액션과 셀렉터
import {
  login,
  logout,
  loginWithToken,
  switchRole,
  refreshToken,
  updateLastActivity,
  selectAuth,
  selectIsAuthenticated,
  selectUser,
  selectCurrentBusiness,
  selectCurrentRole,
  selectPermissions,
} from '../store/slices/authSlice';

// 인증 컨텍스트 생성
const AuthContext = createContext(null);

// 인증 컨텍스트 훅
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// 세션 관리 설정
const SESSION_CHECK_INTERVAL = 60000; // 1분마다 체크
const SESSION_WARNING_TIME = 5 * 60 * 1000; // 5분 전 경고
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30분 무활동시 자동 로그아웃

// 인증 프로바이더 컴포넌트
export const AuthProvider = ({ children }) => {
  const dispatch = useDispatch();

  // Redux 상태 구독
  const auth = useSelector(selectAuth);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);
  const currentBusiness = useSelector(selectCurrentBusiness);
  const currentRole = useSelector(selectCurrentRole);
  const permissions = useSelector(selectPermissions);

  // 로컬 상태
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);

  // 로그인 함수
  const handleLogin = async (credentials) => {
    try {
      const result = await dispatch(login(credentials)).unwrap();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // 로그아웃 함수
  const handleLogout = async () => {
    try {
      await dispatch(logout()).unwrap();
      setSessionWarning(false);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // 역할 전환 함수
  const handleSwitchRole = async (businessId, role) => {
    try {
      const result = await dispatch(switchRole({ businessId, role })).unwrap();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // 토큰 갱신 함수
  const handleRefreshToken = async () => {
    try {
      const result = await dispatch(refreshToken()).unwrap();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // 권한 체크 함수
  const hasPermission = (permission) => {
    if (!permissions || !Array.isArray(permissions)) {
      return false;
    }
    return permissions.includes(permission);
  };

  // 역할 체크 함수
  const hasRole = (role) => {
    if (Array.isArray(role)) {
      return role.includes(currentRole);
    }
    return currentRole === role;
  };

  // 사업장 체크 함수
  const isInBusiness = (businessId) => {
    return currentBusiness === businessId;
  };

  // 세션 유효성 체크
  const checkSessionValidity = () => {
    if (!isAuthenticated || !auth.lastActivity) {
      return true; // 로그인하지 않았으면 체크하지 않음
    }

    const now = Date.now();
    const timeSinceLastActivity = now - auth.lastActivity;

    // 세션 타임아웃 체크
    if (timeSinceLastActivity > SESSION_TIMEOUT) {
      handleLogout();
      return false;
    }

    // 세션 경고 체크
    if (timeSinceLastActivity > SESSION_TIMEOUT - SESSION_WARNING_TIME) {
      setSessionWarning(true);
    } else {
      setSessionWarning(false);
    }

    return true;
  };

  // 세션 연장 함수
  const extendSession = () => {
    dispatch(updateLastActivity());
    setSessionWarning(false);
  };

  // 앱 초기화
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = localStorage.getItem('dot_token');
        if (token) {
          await dispatch(loginWithToken()).unwrap();
        }
      } catch (error) {
        console.warn('자동 로그인 실패:', error.message);
        localStorage.removeItem('dot_token');
        localStorage.removeItem('dot_refresh_token');
      } finally {
        setIsInitialized(true);
      }
    };

    initializeAuth();
  }, [dispatch]);

  // 세션 체크 인터벌 설정
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const interval = setInterval(() => {
      checkSessionValidity();
    }, SESSION_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [isAuthenticated, auth.lastActivity]);

  // 토큰 자동 갱신
  useEffect(() => {
    if (!isAuthenticated || !auth.sessionExpiresAt) {
      return;
    }

    const timeUntilExpiry = auth.sessionExpiresAt - Date.now();
    const refreshTime = timeUntilExpiry - (10 * 60 * 1000); // 만료 10분 전

    if (refreshTime > 0) {
      const timeout = setTimeout(() => {
        handleRefreshToken();
      }, refreshTime);

      return () => clearTimeout(timeout);
    }
  }, [isAuthenticated, auth.sessionExpiresAt]);

  // 컨텍스트 값 정의
  const contextValue = {
    // 상태
    isAuthenticated,
    isInitialized,
    user,
    currentBusiness,
    currentRole,
    permissions,
    sessionWarning,
    isLoading: auth.isLoading,
    error: auth.error,

    // 액션
    login: handleLogin,
    logout: handleLogout,
    switchRole: handleSwitchRole,
    refreshToken: handleRefreshToken,
    extendSession,

    // 유틸리티
    hasPermission,
    hasRole,
    isInBusiness,
    checkSessionValidity,

    // 전체 인증 상태 (디버깅용)
    authState: auth,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// 세션 경고 모달 컴포넌트 (선택적으로 사용)
export const SessionWarningModal = () => {
  const { sessionWarning, extendSession, logout } = useAuth();

  if (!sessionWarning) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '8px',
          maxWidth: '400px',
          textAlign: 'center',
        }}
      >
        <h3>세션 만료 경고</h3>
        <p>세션이 곧 만료됩니다. 계속 사용하시겠습니까?</p>
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={extendSession}
            style={{
              marginRight: '8px',
              padding: '8px 16px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            세션 연장
          </button>
          <button
            onClick={logout}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthContext;