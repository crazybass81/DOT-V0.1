/**
 * DOT Platform Frontend - 근태 관리 페이지
 * 출퇴근, 휴게시간 등 근태를 관리하는 페이지
 */

import React from 'react';
import { Box, Typography, Alert } from '@mui/material';

const AttendancePage = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        근태 관리
      </Typography>
      
      <Alert severity="info">
        근태 관리 기능은 추후 구현될 예정입니다.
        <br />
        GPS 기반 출퇴근 체크, QR 코드 스캔, 휴게시간 관리 등의 기능이 포함될 예정입니다.
      </Alert>
    </Box>
  );
};

export default AttendancePage;