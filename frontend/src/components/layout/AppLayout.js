/**
 * DOT Platform Frontend - 메인 애플리케이션 레이아웃
 * 사이드바, 헤더, 메인 콘텐츠 영역을 관리하는 레이아웃 컴포넌트
 */

import React from 'react';
import { Box } from '@mui/material';

// 임시 기본 레이아웃 (향후 확장 예정)
const AppLayout = ({ children }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: '#fafafa',
      }}
    >
      {/* 임시 헤더 */}
      <Box
        sx={{
          height: '64px',
          backgroundColor: 'primary.main',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 500 }}>
          DOT Platform
        </h1>
      </Box>

      {/* 메인 콘텐츠 영역 */}
      <Box
        component="main"
        sx={{
          flex: 1,
          padding: 3,
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        {children}
      </Box>

      {/* 임시 푸터 */}
      <Box
        sx={{
          height: '48px',
          backgroundColor: 'grey.100',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderTop: '1px solid',
          borderColor: 'grey.300',
        }}
      >
        <small style={{ color: '#666' }}>
          © 2025 DOT Platform. All rights reserved.
        </small>
      </Box>
    </Box>
  );
};

export default AppLayout;