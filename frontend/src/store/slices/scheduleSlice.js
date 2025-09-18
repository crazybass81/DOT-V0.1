/**
 * DOT Platform Frontend - 스케줄 상태 관리
 * 근무 스케줄, 교대 요청 등을 관리하는 Redux slice
 */

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // 현재 스케줄
  currentSchedule: null,
  
  // 주간 스케줄
  weeklySchedule: [],
  
  // 월간 스케줄
  monthlySchedule: [],
  
  // 교대 요청
  shiftRequests: [],
  
  // 로딩 상태
  isLoading: false,
  error: null,
};

const scheduleSlice = createSlice({
  name: 'schedule',
  initialState,
  reducers: {
    setCurrentSchedule: (state, action) => {
      state.currentSchedule = action.payload;
    },
    
    setWeeklySchedule: (state, action) => {
      state.weeklySchedule = action.payload;
    },
    
    setMonthlySchedule: (state, action) => {
      state.monthlySchedule = action.payload;
    },
    
    setShiftRequests: (state, action) => {
      state.shiftRequests = action.payload;
    },
    
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setCurrentSchedule,
  setWeeklySchedule,
  setMonthlySchedule,
  setShiftRequests,
  clearError,
} = scheduleSlice.actions;

export default scheduleSlice.reducer;