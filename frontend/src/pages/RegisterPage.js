/**
 * DOT Platform Frontend - 회원가입 페이지
 * 사용자 등록을 처리하는 회원가입 페이지 컴포넌트
 */

import React from 'react';
import { Box } from '@mui/material';
import Register from '../components/auth/Register';

const RegisterPage = () => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fafafa',
        padding: 2,
      }}
    >
      <Register />
    </Box>
  );
};

export default RegisterPage;