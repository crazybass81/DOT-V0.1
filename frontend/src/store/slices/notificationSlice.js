/**
 * DOT Platform Frontend - 알림 상태 관리
 * 실시간 알림, 알림 내역 등을 관리하는 Redux slice
 */

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // 알림 목록
  notifications: [],
  
  // 읽지 않은 알림 개수
  unreadCount: 0,
  
  // 실시간 알림 설정
  realTimeEnabled: true,
  soundEnabled: true,
  
  // 로딩 상태
  isLoading: false,
  error: null,
};

const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {
    setNotifications: (state, action) => {
      state.notifications = action.payload;
    },
    
    addNotification: (state, action) => {
      state.notifications.unshift(action.payload);
      if (!action.payload.isRead) {
        state.unreadCount += 1;
      }
    },
    
    markAsRead: (state, action) => {
      const notificationId = action.payload;
      const notification = state.notifications.find(n => n.id === notificationId);
      if (notification && !notification.isRead) {
        notification.isRead = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    
    markAllAsRead: (state) => {
      state.notifications.forEach(notification => {
        notification.isRead = true;
      });
      state.unreadCount = 0;
    },
    
    setUnreadCount: (state, action) => {
      state.unreadCount = action.payload;
    },
    
    toggleRealTime: (state) => {
      state.realTimeEnabled = !state.realTimeEnabled;
    },
    
    toggleSound: (state) => {
      state.soundEnabled = !state.soundEnabled;
    },
    
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setNotifications,
  addNotification,
  markAsRead,
  markAllAsRead,
  setUnreadCount,
  toggleRealTime,
  toggleSound,
  clearError,
} = notificationSlice.actions;

export default notificationSlice.reducer;