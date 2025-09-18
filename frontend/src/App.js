/**
 * DOT Platform Frontend - 메인 애플리케이션 컴포넌트
 * 인증, 라우팅, 레이아웃을 관리하는 최상위 컴포넌트
 */

import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, CssBaseline, useMediaQuery, useTheme } from '@mui/material';

// Redux 액션과 셀렉터
import {
  loginWithToken,
  selectIsAuthenticated,
  selectAuthLoading,
  updateLastActivity
} from './store/slices/authSlice';
import {
  updateScreenSize,
  selectIsMobile,
  selectGlobalLoading
} from './store/slices/uiSlice';

// 컴포넌트 import
import AppLayout from './components/layout/AppLayout';
import LoadingScreen from './components/common/LoadingScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import SocketManager from './components/socket/SocketManager';

// 페이지 컴포넌트
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import AttendancePage from './pages/AttendancePage';
import SchedulePage from './pages/SchedulePage';

// 보호된 라우트 컴포넌트
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    // 현재 경로를 저장하여 로그인 후 되돌아갈 수 있도록 함
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

// 공개 라우트 컴포넌트 (로그인한 사용자는 대시보드로 리다이렉트)
const PublicRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function App() {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useSelector(selectIsMobile);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const authLoading = useSelector(selectAuthLoading);
  const globalLoading = useSelector(selectGlobalLoading);

  // 화면 크기 감지
  const isMobileBreakpoint = useMediaQuery(theme.breakpoints.down('md'));

  // 앱 초기화 상태
  const [isInitialized, setIsInitialized] = useState(false);

  // 앱 초기화
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 저장된 토큰으로 자동 로그인 시도
        const token = localStorage.getItem('dot_token');
        if (token) {
          await dispatch(loginWithToken()).unwrap();
        }
      } catch (error) {
        console.warn('자동 로그인 실패:', error.message);
        // 실패해도 앱은 계속 진행
      } finally {
        setIsInitialized(true);
      }
    };

    initializeApp();
  }, [dispatch]);

  // 화면 크기 변화 감지
  useEffect(() => {
    const handleResize = () => {
      dispatch(updateScreenSize(window.innerWidth));
    };

    // 초기 크기 설정
    handleResize();

    // 리사이즈 이벤트 리스너 등록
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [dispatch]);

  // 사용자 활동 추적 (마우스 움직임, 키보드 입력 등)
  useEffect(() => {
    if (!isAuthenticated) return;

    const updateActivity = () => {
      dispatch(updateLastActivity());
    };

    // 활동 감지 이벤트들
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
    };
  }, [isAuthenticated, dispatch]);

  // 앱이 초기화되지 않았거나 인증 중이면 로딩 화면 표시
  if (!isInitialized || authLoading) {
    return <LoadingScreen message="DOT Platform 초기화 중..." />;
  }

  // 전역 로딩 상태면 로딩 오버레이 표시
  if (globalLoading) {
    return <LoadingScreen message="처리 중..." />;
  }

  return (
    <ErrorBoundary>
      <CssBaseline />

      {/* 인증된 사용자에게만 소켓 연결 제공 */}
      {isAuthenticated && <SocketManager />}

      <Routes>
        {/* 공개 라우트 */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />

        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />

        {/* 보호된 라우트 */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  {/* 대시보드 */}
                  <Route path="/dashboard" element={<DashboardPage />} />

                  {/* 근태 관리 */}
                  <Route path="/attendance" element={<AttendancePage />} />

                  {/* 스케줄 관리 */}
                  <Route path="/schedule" element={<SchedulePage />} />

                  {/* 기본 경로는 대시보드로 리다이렉트 */}
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />

                  {/* 404 페이지 */}
                  <Route
                    path="*"
                    element={
                      <Box
                        display="flex"
                        flexDirection="column"
                        alignItems="center"
                        justifyContent="center"
                        minHeight="400px"
                        textAlign="center"
                      >
                        <h2>페이지를 찾을 수 없습니다</h2>
                        <p>요청하신 페이지가 존재하지 않습니다.</p>
                        <button
                          onClick={() => window.history.back()}
                          style={{
                            marginTop: '16px',
                            padding: '8px 16px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            background: '#f5f5f5',
                            cursor: 'pointer'
                          }}
                        >
                          이전 페이지로 돌아가기
                        </button>
                      </Box>
                    }
                  />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;