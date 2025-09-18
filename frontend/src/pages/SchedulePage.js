/**
 * DOT Platform Frontend - 스케줄 관리 페이지
 * 근무 스케줄과 교대 요청을 관리하는 페이지
 */

import React from 'react';
import { Box, Typography, Alert } from '@mui/material';

const SchedulePage = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        스케줄 관리
      </Typography>
      
      <Alert severity="info">
        스케줄 관리 기능은 추후 구현될 예정입니다.
        <br />
        캘린더 뷰, 근무 할당, 교대 요청 등의 기능이 포함될 예정입니다.
      </Alert>
    </Box>
  );
};

export default SchedulePage;