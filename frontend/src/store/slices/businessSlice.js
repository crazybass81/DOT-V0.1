/**
 * DOT Platform Frontend - 사업장 상태 관리
 * 사업장 정보, 직원 목록 등을 관리하는 Redux slice
 */

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // 현재 사업장 정보
  currentBusiness: null,

  // 사업장 목록
  businesses: [],

  // 직원 목록
  employees: [],

  // 사업장 통계
  statistics: {
    totalEmployees: 0,
    activeEmployees: 0,
    todayAttendance: 0,
  },

  // 로딩 상태
  isLoading: false,
  error: null,
};

const businessSlice = createSlice({
  name: 'business',
  initialState,
  reducers: {
    setCurrentBusiness: (state, action) => {
      state.currentBusiness = action.payload;
    },

    setBusinesses: (state, action) => {
      state.businesses = action.payload;
    },

    setEmployees: (state, action) => {
      state.employees = action.payload;
    },

    setStatistics: (state, action) => {
      state.statistics = action.payload;
    },

    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setCurrentBusiness,
  setBusinesses,
  setEmployees,
  setStatistics,
  clearError,
} = businessSlice.actions;

export default businessSlice.reducer;