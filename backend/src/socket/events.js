/**
 * T294: 이벤트 핸들러 정의
 * WebSocket 이벤트 라우팅 및 처리
 *
 * 이벤트 카테고리:
 * - attendance: 출퇴근 관련 이벤트
 * - schedule: 스케줄 관련 이벤트
 * - notification: 알림 관련 이벤트
 * - chat: 채팅 메시지 이벤트
 * - presence: 온라인 상태 이벤트
 * - system: 시스템 이벤트
 */

const logger = require('../utils/logger');
const attendanceBroadcast = require('./attendance-broadcast');
const scheduleUpdates = require('./schedule-updates');
const notificationPush = require('./notification-push');

/**
 * 이벤트 핸들러 설정
 * @param {Socket} socket - Socket.io 소켓
 * @param {Server} io - Socket.io 서버
 */
function setupEventHandlers(socket, io) {
  const userId = socket.user?.id;
  const businessId = socket.user?.currentBusinessId;

  // 이벤트 핸들러 등록
  registerAttendanceEvents(socket, io);
  registerScheduleEvents(socket, io);
  registerNotificationEvents(socket, io);
  registerChatEvents(socket, io);
  registerPresenceEvents(socket, io);
  registerSystemEvents(socket, io);

  // 전역 에러 핸들러
  socket.on('error', (error) => {
    handleSocketError(socket, error);
  });

  logger.info(`이벤트 핸들러 설정 완료: userId=${userId}, businessId=${businessId}`);
}

/**
 * 출퇴근 이벤트 등록
 * @param {Socket} socket - Socket.io 소켓
 * @param {Server} io - Socket.io 서버
 */
function registerAttendanceEvents(socket, io) {
  // 체크인
  socket.on('attendance:checkin', async (data, callback) => {
    try {
      const result = await attendanceBroadcast.handleCheckIn(socket, data);

      if (result.success) {
        // 사업장 전체에 브로드캐스트
        const businessRoom = `business:${socket.user.currentBusinessId}`;
        socket.to(businessRoom).emit('attendance:user-checked-in', {
          userId: socket.user.id,
          userName: socket.user.name,
          checkInTime: result.checkInTime,
          location: data.location
        });
      }

      callback(result);
    } catch (error) {
      logger.error('체크인 이벤트 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 체크아웃
  socket.on('attendance:checkout', async (data, callback) => {
    try {
      const result = await attendanceBroadcast.handleCheckOut(socket, data);

      if (result.success) {
        // 사업장 전체에 브로드캐스트
        const businessRoom = `business:${socket.user.currentBusinessId}`;
        socket.to(businessRoom).emit('attendance:user-checked-out', {
          userId: socket.user.id,
          userName: socket.user.name,
          checkOutTime: result.checkOutTime,
          totalHours: result.totalHours
        });
      }

      callback(result);
    } catch (error) {
      logger.error('체크아웃 이벤트 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // QR 스캔
  socket.on('attendance:qr-scan', async (data, callback) => {
    try {
      const result = await attendanceBroadcast.handleQRScan(socket, data);
      callback(result);
    } catch (error) {
      logger.error('QR 스캔 이벤트 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 휴게 시작/종료
  socket.on('attendance:break', async (data, callback) => {
    try {
      const result = await attendanceBroadcast.handleBreak(socket, data);

      if (result.success) {
        // 관리자에게 알림
        const managerRoom = `business:${socket.user.currentBusinessId}:managers`;
        io.to(managerRoom).emit('attendance:break-status', {
          userId: socket.user.id,
          userName: socket.user.name,
          breakStatus: data.type,
          time: result.time
        });
      }

      callback(result);
    } catch (error) {
      logger.error('휴게 이벤트 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 실시간 출근 현황 요청
  socket.on('attendance:live-status', async (callback) => {
    try {
      const status = await attendanceBroadcast.getLiveStatus(
        socket.user.currentBusinessId
      );
      callback({ success: true, status });
    } catch (error) {
      logger.error('실시간 현황 조회 오류:', error);
      callback({ success: false, error: error.message });
    }
  });
}

/**
 * 스케줄 이벤트 등록
 * @param {Socket} socket - Socket.io 소켓
 * @param {Server} io - Socket.io 서버
 */
function registerScheduleEvents(socket, io) {
  // 스케줄 생성
  socket.on('schedule:create', async (data, callback) => {
    try {
      const result = await scheduleUpdates.handleScheduleCreate(socket, data);

      if (result.success) {
        // 해당 사용자에게 알림
        io.to(`user:${data.userId}`).emit('schedule:new', {
          scheduleId: result.scheduleId,
          startTime: data.startTime,
          endTime: data.endTime,
          createdBy: socket.user.name
        });
      }

      callback(result);
    } catch (error) {
      logger.error('스케줄 생성 이벤트 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 스케줄 수정
  socket.on('schedule:update', async (data, callback) => {
    try {
      const result = await scheduleUpdates.handleScheduleUpdate(socket, data);

      if (result.success && result.affectedUsers) {
        // 영향받는 사용자들에게 알림
        result.affectedUsers.forEach(userId => {
          io.to(`user:${userId}`).emit('schedule:updated', {
            scheduleId: data.scheduleId,
            changes: result.changes,
            updatedBy: socket.user.name
          });
        });
      }

      callback(result);
    } catch (error) {
      logger.error('스케줄 수정 이벤트 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 교대 요청
  socket.on('schedule:shift-request', async (data, callback) => {
    try {
      const result = await scheduleUpdates.handleShiftRequest(socket, data);

      if (result.success) {
        // 대상 사용자에게 알림
        io.to(`user:${data.targetUserId}`).emit('schedule:shift-requested', {
          requestId: result.requestId,
          fromUser: socket.user.name,
          date: data.date,
          shift: data.shift
        });

        // 관리자에게도 알림
        const managerRoom = `business:${socket.user.currentBusinessId}:managers`;
        io.to(managerRoom).emit('schedule:shift-request-pending', {
          requestId: result.requestId,
          fromUser: socket.user.name,
          toUser: data.targetUserName
        });
      }

      callback(result);
    } catch (error) {
      logger.error('교대 요청 이벤트 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 스케줄 승인/거부
  socket.on('schedule:approve', async (data, callback) => {
    try {
      const result = await scheduleUpdates.handleApproval(socket, data);

      if (result.success) {
        // 요청자에게 결과 알림
        io.to(`user:${result.requesterId}`).emit('schedule:approval-result', {
          requestId: data.requestId,
          approved: data.approved,
          approvedBy: socket.user.name,
          reason: data.reason
        });
      }

      callback(result);
    } catch (error) {
      logger.error('스케줄 승인 이벤트 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 실시간 스케줄 동기화
  socket.on('schedule:sync', async (data, callback) => {
    try {
      const schedules = await scheduleUpdates.syncSchedules(
        socket.user.id,
        socket.user.currentBusinessId,
        data.from,
        data.to
      );
      callback({ success: true, schedules });
    } catch (error) {
      logger.error('스케줄 동기화 오류:', error);
      callback({ success: false, error: error.message });
    }
  });
}

/**
 * 알림 이벤트 등록
 * @param {Socket} socket - Socket.io 소켓
 * @param {Server} io - Socket.io 서버
 */
function registerNotificationEvents(socket, io) {
  // 알림 발송
  socket.on('notification:send', async (data, callback) => {
    try {
      const result = await notificationPush.sendNotification(socket, data);

      if (result.success) {
        // 수신자에게 실시간 푸시
        io.to(`user:${data.recipientId}`).emit('notification:new', {
          notificationId: result.notificationId,
          type: data.type,
          title: data.title,
          message: data.message,
          timestamp: new Date()
        });
      }

      callback(result);
    } catch (error) {
      logger.error('알림 발송 이벤트 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 알림 읽음 처리
  socket.on('notification:read', async (data, callback) => {
    try {
      const result = await notificationPush.markAsRead(
        socket.user.id,
        data.notificationId
      );

      // 다른 기기에도 동기화
      socket.broadcast.to(`user:${socket.user.id}`).emit('notification:read-sync', {
        notificationId: data.notificationId
      });

      callback(result);
    } catch (error) {
      logger.error('알림 읽음 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 모든 알림 읽음 처리
  socket.on('notification:read-all', async (callback) => {
    try {
      const result = await notificationPush.markAllAsRead(socket.user.id);

      // 다른 기기에도 동기화
      socket.broadcast.to(`user:${socket.user.id}`).emit('notification:read-all-sync');

      callback(result);
    } catch (error) {
      logger.error('전체 알림 읽음 처리 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 읽지 않은 알림 개수
  socket.on('notification:unread-count', async (callback) => {
    try {
      const count = await notificationPush.getUnreadCount(socket.user.id);
      callback({ success: true, count });
    } catch (error) {
      logger.error('읽지 않은 알림 개수 조회 오류:', error);
      callback({ success: false, error: error.message });
    }
  });
}

/**
 * 채팅 이벤트 등록
 * @param {Socket} socket - Socket.io 소켓
 * @param {Server} io - Socket.io 서버
 */
function registerChatEvents(socket, io) {
  // 1:1 메시지
  socket.on('chat:direct-message', async (data, callback) => {
    try {
      const message = {
        id: generateMessageId(),
        fromUserId: socket.user.id,
        fromUserName: socket.user.name,
        toUserId: data.toUserId,
        message: data.message,
        timestamp: new Date()
      };

      // 수신자에게 전송
      io.to(`user:${data.toUserId}`).emit('chat:direct-message', message);

      // 메시지 저장 (선택적)
      await saveChatMessage(message);

      callback({ success: true, messageId: message.id });
    } catch (error) {
      logger.error('다이렉트 메시지 전송 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 타이핑 상태
  socket.on('chat:typing', (data) => {
    const targetRoom = data.room || `user:${data.toUserId}`;
    socket.to(targetRoom).emit('chat:typing', {
      userId: socket.user.id,
      userName: socket.user.name,
      isTyping: data.isTyping
    });
  });

  // 메시지 삭제
  socket.on('chat:delete-message', async (data, callback) => {
    try {
      // 메시지 삭제 권한 확인
      const canDelete = await checkMessageDeletePermission(
        socket.user.id,
        data.messageId
      );

      if (!canDelete) {
        callback({ success: false, error: '메시지 삭제 권한이 없습니다.' });
        return;
      }

      // 관련 사용자들에게 알림
      const room = data.room || `user:${data.toUserId}`;
      io.to(room).emit('chat:message-deleted', {
        messageId: data.messageId,
        deletedBy: socket.user.id
      });

      callback({ success: true });
    } catch (error) {
      logger.error('메시지 삭제 오류:', error);
      callback({ success: false, error: error.message });
    }
  });
}

/**
 * 온라인 상태 이벤트 등록
 * @param {Socket} socket - Socket.io 소켓
 * @param {Server} io - Socket.io 서버
 */
function registerPresenceEvents(socket, io) {
  // 상태 변경
  socket.on('presence:status', (data) => {
    const status = data.status; // online, away, busy, offline

    // 소켓 데이터 업데이트
    socket.data.status = status;
    socket.data.statusMessage = data.message;
    socket.data.statusUpdatedAt = new Date();

    // 사업장 멤버들에게 브로드캐스트
    if (socket.user.currentBusinessId) {
      const businessRoom = `business:${socket.user.currentBusinessId}`;
      socket.to(businessRoom).emit('presence:user-status', {
        userId: socket.user.id,
        userName: socket.user.name,
        status: status,
        message: data.message,
        updatedAt: socket.data.statusUpdatedAt
      });
    }
  });

  // 온라인 사용자 목록
  socket.on('presence:online-users', async (callback) => {
    try {
      const users = await getOnlineUsers(socket.user.currentBusinessId);
      callback({ success: true, users });
    } catch (error) {
      logger.error('온라인 사용자 조회 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 사용자 활동 추적
  socket.on('presence:activity', (data) => {
    socket.data.lastActivity = new Date();
    socket.data.activityType = data.type;

    // 관리자에게 활동 로그 전송 (선택적)
    if (socket.user.currentRole === 'worker') {
      const managerRoom = `business:${socket.user.currentBusinessId}:managers`;
      io.to(managerRoom).emit('presence:user-activity', {
        userId: socket.user.id,
        userName: socket.user.name,
        activity: data.type,
        timestamp: socket.data.lastActivity
      });
    }
  });
}

/**
 * 시스템 이벤트 등록
 * @param {Socket} socket - Socket.io 소켓
 * @param {Server} io - Socket.io 서버
 */
function registerSystemEvents(socket, io) {
  // 서버 시간 동기화
  socket.on('system:time-sync', (callback) => {
    callback({
      serverTime: new Date(),
      timezone: process.env.TZ || 'Asia/Seoul'
    });
  });

  // 연결 상태 체크
  socket.on('system:heartbeat', (callback) => {
    socket.data.lastHeartbeat = new Date();
    callback({
      success: true,
      timestamp: socket.data.lastHeartbeat,
      latency: Date.now()
    });
  });

  // 서버 공지사항
  socket.on('system:broadcast', async (data, callback) => {
    try {
      // 관리자 권한 확인
      if (socket.user.currentRole !== 'owner') {
        callback({ success: false, error: '권한이 없습니다.' });
        return;
      }

      // 전체 사용자에게 브로드캐스트
      io.emit('system:announcement', {
        message: data.message,
        priority: data.priority,
        from: socket.user.name,
        timestamp: new Date()
      });

      callback({ success: true });
    } catch (error) {
      logger.error('시스템 브로드캐스트 오류:', error);
      callback({ success: false, error: error.message });
    }
  });

  // 강제 연결 해제
  socket.on('system:force-disconnect', async (data, callback) => {
    try {
      // 관리자 권한 확인
      if (socket.user.currentRole !== 'owner' && socket.user.currentRole !== 'manager') {
        callback({ success: false, error: '권한이 없습니다.' });
        return;
      }

      // 특정 사용자 연결 해제
      const targetSockets = await io.in(`user:${data.userId}`).fetchSockets();
      for (const targetSocket of targetSockets) {
        targetSocket.disconnect(true);
      }

      logger.info(`강제 연결 해제: targetUserId=${data.userId}, by=${socket.user.id}`);
      callback({ success: true, disconnected: targetSockets.length });
    } catch (error) {
      logger.error('강제 연결 해제 오류:', error);
      callback({ success: false, error: error.message });
    }
  });
}

/**
 * 소켓 에러 핸들러
 * @param {Socket} socket - Socket.io 소켓
 * @param {Error} error - 에러 객체
 */
function handleSocketError(socket, error) {
  logger.error(`소켓 에러: userId=${socket.user?.id}`, {
    error: error.message,
    stack: error.stack,
    socketId: socket.id
  });

  // 클라이언트에 에러 전송
  socket.emit('error', {
    message: '서버 오류가 발생했습니다.',
    code: error.code || 'UNKNOWN_ERROR',
    timestamp: new Date()
  });
}

/**
 * 메시지 ID 생성
 * @returns {string} 메시지 ID
 */
function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 채팅 메시지 저장 (구현 필요)
 * @param {Object} message - 메시지 객체
 */
async function saveChatMessage(message) {
  // 데이터베이스나 Redis에 메시지 저장
  logger.info(`채팅 메시지 저장: id=${message.id}, from=${message.fromUserId}, to=${message.toUserId}`);
}

/**
 * 메시지 삭제 권한 확인 (구현 필요)
 * @param {string} userId - 사용자 ID
 * @param {string} messageId - 메시지 ID
 * @returns {Promise<boolean>} 삭제 가능 여부
 */
async function checkMessageDeletePermission(userId, messageId) {
  // 메시지 작성자 또는 관리자만 삭제 가능
  return true; // 임시 구현
}

/**
 * 온라인 사용자 조회 (구현 필요)
 * @param {string} businessId - 사업장 ID
 * @returns {Promise<Array>} 온라인 사용자 목록
 */
async function getOnlineUsers(businessId) {
  // Socket.io에서 온라인 사용자 조회
  return []; // 임시 구현
}

module.exports = {
  setupEventHandlers,
  registerAttendanceEvents,
  registerScheduleEvents,
  registerNotificationEvents,
  registerChatEvents,
  registerPresenceEvents,
  registerSystemEvents,
  handleSocketError
};