/**
 * DOT Platform Frontend - 근태 상태 관리
 * 출퇴근, 휴게시간 등 근태 관련 상태를 관리하는 Redux slice
 */

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // 현재 근무 상태
  currentStatus: 'off-duty', // 'checked-in', 'on-break', 'checked-out', 'off-duty'
  currentAttendance: null,
  
  // 오늘의 근태 기록
  todayRecords: [],
  
  // 실시간 근무 시간
  workingTime: 0,
  breakTime: 0,
  
  // 로딩 상태
  isLoading: false,
  error: null,
};

const attendanceSlice = createSlice({
  name: 'attendance',
  initialState,
  reducers: {
    setCurrentStatus: (state, action) => {
      state.currentStatus = action.payload;
    },
    
    setTodayRecords: (state, action) => {
      state.todayRecords = action.payload;
    },
    
    updateWorkingTime: (state, action) => {
      state.workingTime = action.payload;
    },
    
    updateBreakTime: (state, action) => {
      state.breakTime = action.payload;
    },
    
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setCurrentStatus,
  setTodayRecords,
  updateWorkingTime,
  updateBreakTime,
  clearError,
} = attendanceSlice.actions;

export default attendanceSlice.reducer;