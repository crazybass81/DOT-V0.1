/**
 * DOT Platform Frontend - 소켓 연결 관리자
 * Socket.io 클라이언트 연결과 실시간 이벤트를 관리하는 컴포넌트
 */

import { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import io from 'socket.io-client';

// Redux 액션들
import { selectAuth } from '../../store/slices/authSlice';
import { addNotification, setUnreadCount } from '../../store/slices/notificationSlice';
import { setCurrentStatus, updateWorkingTime } from '../../store/slices/attendanceSlice';

const SocketManager = () => {
  const dispatch = useDispatch();
  const auth = useSelector(selectAuth);
  const socketRef = useRef(null);

  useEffect(() => {
    // 인증된 사용자만 소켓 연결
    if (!auth.isAuthenticated || !auth.token) {
      return;
    }

    // 소켓 연결 설정
    const socketUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';

    socketRef.current = io(socketUrl, {
      auth: {
        token: auth.token,
        userId: auth.user?.id,
        businessId: auth.currentBusiness,
        role: auth.currentRole,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    const socket = socketRef.current;

    // 연결 이벤트
    socket.on('connect', () => {
      console.log('Socket 연결됨:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket 연결 해제:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket 연결 오류:', error);
    });

    // 알림 이벤트
    socket.on('notification:new', (notification) => {
      dispatch(addNotification(notification));

      // 브라우저 알림 표시 (권한이 있는 경우)
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/icons/notification.png',
          tag: notification.id,
        });
      }
    });

    socket.on('notification:unread-count', (data) => {
      dispatch(setUnreadCount(data.count));
    });

    // 근태 이벤트
    socket.on('attendance:status-change', (data) => {
      dispatch(setCurrentStatus(data.status));
    });

    socket.on('attendance:time-update', (data) => {
      dispatch(updateWorkingTime(data.workingTime));
    });

    // 시스템 이벤트
    socket.on('system:maintenance', (data) => {
      alert(`시스템 점검 안내: ${data.message}`);
    });

    // 정리 함수
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [auth.isAuthenticated, auth.token, auth.user?.id, auth.currentBusiness, auth.currentRole, dispatch]);

  // 이 컴포넌트는 UI를 렌더링하지 않음
  return null;
};

export default SocketManager;