/**
 * DOT Platform Frontend - 대시보드 페이지
 * 메인 대시보드와 통계 정보를 표시하는 페이지
 */

import React from 'react';
import { Box, Typography, Grid, Card, CardContent } from '@mui/material';

const DashboardPage = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        대시보드
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                오늘의 근태
              </Typography>
              <Typography variant="body2" color="textSecondary">
                근태 관리 기능은 추후 구현될 예정입니다.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                이번 주 스케줄
              </Typography>
              <Typography variant="body2" color="textSecondary">
                스케줄 관리 기능은 추후 구현될 예정입니다.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;