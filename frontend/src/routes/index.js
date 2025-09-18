/**
 * DOT Platform Frontend - 라우팅 설정
 * 애플리케이션의 모든 라우트를 정의하고 관리하는 모듈
 */

import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Box, CircularProgress } from '@mui/material';

// Redux 셀렉터
import { selectIsAuthenticated } from '../store/slices/authSlice';

// 레이아웃 컴포넌트
import AppLayout from '../components/layout/AppLayout';

// 로딩 컴포넌트
const PageLoader = () => (
  <Box
    display="flex"
    justifyContent="center"
    alignItems="center"
    minHeight="400px"
  >
    <CircularProgress />
  </Box>
);

// Lazy-loaded 페이지 컴포넌트들
const LoginPage = lazy(() => import('../pages/LoginPage'));
const RegisterPage = lazy(() => import('../pages/RegisterPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const AttendancePage = lazy(() => import('../pages/AttendancePage'));
const SchedulePage = lazy(() => import('../pages/SchedulePage'));

// 보호된 라우트 컴포넌트
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppLayout>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </AppLayout>
  );
};

// 공개 라우트 컴포넌트 (로그인한 사용자는 대시보드로 리다이렉트)
const PublicRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  );
};

// 404 페이지 컴포넌트
const NotFoundPage = () => (
  <Box
    display="flex"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    minHeight="400px"
    textAlign="center"
    padding={3}
  >
    <h2>페이지를 찾을 수 없습니다</h2>
    <p style={{ color: '#666', marginBottom: '24px' }}>
      요청하신 페이지가 존재하지 않습니다.
    </p>
    <button
      onClick={() => window.history.back()}
      style={{
        padding: '8px 16px',
        border: '1px solid #1976d2',
        borderRadius: '4px',
        background: '#1976d2',
        color: 'white',
        cursor: 'pointer',
        fontSize: '14px',
      }}
    >
      이전 페이지로 돌아가기
    </button>
  </Box>
);

// 라우트 정의
const AppRoutes = () => {
  return (
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
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <AttendancePage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <SchedulePage />
          </ProtectedRoute>
        }
      />

      {/* 기본 경로 리다이렉트 */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* 404 페이지 */}
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <NotFoundPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

// 라우트 정보 상수 (네비게이션 등에서 사용)
export const ROUTES = {
  // 공개 라우트
  LOGIN: '/login',
  REGISTER: '/register',

  // 보호된 라우트
  DASHBOARD: '/dashboard',
  ATTENDANCE: '/attendance',
  SCHEDULE: '/schedule',

  // 관리자 전용 라우트 (향후 추가)
  ADMIN_USERS: '/admin/users',
  ADMIN_BUSINESSES: '/admin/businesses',
  ADMIN_REPORTS: '/admin/reports',

  // 설정 라우트 (향후 추가)
  PROFILE: '/profile',
  SETTINGS: '/settings',
  HELP: '/help',
};

// 네비게이션 메뉴 구성 (사이드바 등에서 사용)
export const NAVIGATION_ITEMS = [
  {
    id: 'dashboard',
    label: '대시보드',
    path: ROUTES.DASHBOARD,
    icon: 'Dashboard',
    roles: ['owner', 'manager', 'worker'],
  },
  {
    id: 'attendance',
    label: '근태 관리',
    path: ROUTES.ATTENDANCE,
    icon: 'Schedule',
    roles: ['owner', 'manager', 'worker'],
  },
  {
    id: 'schedule',
    label: '스케줄 관리',
    path: ROUTES.SCHEDULE,
    icon: 'CalendarToday',
    roles: ['owner', 'manager', 'worker'],
  },
];

// 권한별 접근 가능한 라우트
export const ROLE_PERMISSIONS = {
  owner: [
    ROUTES.DASHBOARD,
    ROUTES.ATTENDANCE,
    ROUTES.SCHEDULE,
    ROUTES.ADMIN_USERS,
    ROUTES.ADMIN_BUSINESSES,
    ROUTES.ADMIN_REPORTS,
  ],
  manager: [
    ROUTES.DASHBOARD,
    ROUTES.ATTENDANCE,
    ROUTES.SCHEDULE,
  ],
  worker: [
    ROUTES.DASHBOARD,
    ROUTES.ATTENDANCE,
    ROUTES.SCHEDULE,
  ],
  seeker: [
    ROUTES.DASHBOARD,
  ],
};

export default AppRoutes;