/**
 * T298: 실시간 알림 푸시
 * WebSocket을 통한 개인 알림 실시간 전송
 *
 * 주요 기능:
 * - 개인 알림 즉시 전송
 * - 읽음 상태 실시간 동기화
 * - 알림 카운트 업데이트
 * - 멀티 디바이스 동기화
 * - 알림 우선순위 처리
 */

const pool = require('../db');
const logger = require('../utils/logger');
const notificationLib = require('../lib/notification-lib');
const moment = require('moment-timezone');

/**
 * 알림 발송
 * @param {Socket} socket - Socket.io 소켓
 * @param {Object} data - 알림 데이터
 * @returns {Promise<Object>} 처리 결과
 */
async function sendNotification(socket, data) {
  const client = await pool.connect();

  try {
    const senderId = socket.user.id;
    const businessId = socket.user.currentBusinessId;
    const role = socket.user.currentRole;

    const {
      recipientId,
      type,
      title,
      message,
      priority = 'normal',
      data: notificationData,
      scheduledAt
    } = data;

    // 권한 확인 (manager, owner만 전체 발송 가능)
    if (type === 'system' && role !== 'manager' && role !== 'owner') {
      return {
        success: false,
        error: 'PERMISSION_DENIED',
        message: '시스템 알림 발송 권한이 없습니다.'
      };
    }

    // 수신자 확인
    const recipientQuery = `
      SELECT u.id, u.name, u.email, u.phone
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      WHERE u.id = $1
        AND ur.business_id = $2
        AND ur.is_active = true
    `;
    const recipientResult = await client.query(recipientQuery, [recipientId, businessId]);

    if (recipientResult.rows.length === 0) {
      return {
        success: false,
        error: 'RECIPIENT_NOT_FOUND',
        message: '수신자를 찾을 수 없습니다.'
      };
    }

    const recipient = recipientResult.rows[0];

    // 알림 생성
    await client.query('BEGIN');

    const insertQuery = `
      INSERT INTO notifications (
        user_id,
        sender_id,
        business_id,
        type,
        title,
        message,
        data,
        priority,
        scheduled_at,
        is_read,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, NOW())
      RETURNING id, created_at
    `;

    const insertResult = await client.query(insertQuery, [
      recipientId,
      senderId,
      businessId,
      type,
      title,
      message,
      JSON.stringify(notificationData || {}),
      priority,
      scheduledAt,
    ]);

    const notification = insertResult.rows[0];

    await client.query('COMMIT');

    // 즉시 전송 (예약이 아닌 경우)
    if (!scheduledAt) {
      await pushToUser(recipientId, {
        id: notification.id,
        type,
        title,
        message,
        data: notificationData,
        priority,
        senderName: socket.user.name,
        timestamp: notification.created_at,
        isRead: false
      });

      // 읽지 않은 알림 수 업데이트
      await updateUnreadCount(recipientId);
    }

    // 외부 알림도 발송 (설정에 따라)
    await sendExternalNotification(recipient, {
      type,
      title,
      message,
      priority,
      data: notificationData
    });

    logger.info(`알림 발송: id=${notification.id}, to=${recipientId}, type=${type}`);

    return {
      success: true,
      notificationId: notification.id,
      recipientId,
      recipientName: recipient.name,
      scheduled: !!scheduledAt
    };

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('알림 발송 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 특정 사용자에게 알림 푸시
 * @param {string} userId - 사용자 ID
 * @param {Object} notification - 알림 데이터
 */
async function pushToUser(userId, notification) {
  try {
    const io = require('../socket').getSocketServer();
    if (!io) {
      logger.warn('Socket.io 서버가 초기화되지 않았습니다.');
      return;
    }

    // 사용자의 모든 소켓에 전송
    io.to(`user:${userId}`).emit('notification:new', notification);

    // 브라우저 푸시 알림 (우선순위가 높은 경우)
    if (notification.priority === 'high' || notification.priority === 'urgent') {
      io.to(`user:${userId}`).emit('notification:push', {
        title: notification.title,
        body: notification.message,
        icon: getNotificationIcon(notification.type),
        badge: '/badge.png',
        tag: notification.id,
        requireInteraction: notification.priority === 'urgent'
      });
    }

    logger.info(`알림 푸시: userId=${userId}, notificationId=${notification.id}`);

  } catch (error) {
    logger.error('알림 푸시 오류:', error);
  }
}

/**
 * 일괄 알림 푸시
 * @param {Array} userIds - 사용자 ID 목록
 * @param {Object} notification - 알림 데이터
 */
async function pushToUsers(userIds, notification) {
  try {
    const io = require('../socket').getSocketServer();
    if (!io) {
      logger.warn('Socket.io 서버가 초기화되지 않았습니다.');
      return;
    }

    // 각 사용자에게 개별 전송
    for (const userId of userIds) {
      io.to(`user:${userId}`).emit('notification:new', {
        ...notification,
        userId
      });
    }

    logger.info(`일괄 알림 푸시: count=${userIds.length}, type=${notification.type}`);

  } catch (error) {
    logger.error('일괄 알림 푸시 오류:', error);
  }
}

/**
 * 알림 읽음 처리
 * @param {string} userId - 사용자 ID
 * @param {string} notificationId - 알림 ID
 * @returns {Promise<Object>} 처리 결과
 */
async function markAsRead(userId, notificationId) {
  const client = await pool.connect();

  try {
    // 알림 소유자 확인 및 읽음 처리
    const updateQuery = `
      UPDATE notifications
      SET is_read = true, read_at = NOW()
      WHERE id = $1 AND user_id = $2 AND is_read = false
      RETURNING id
    `;

    const result = await client.query(updateQuery, [notificationId, userId]);

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'NOTIFICATION_NOT_FOUND',
        message: '알림을 찾을 수 없거나 이미 읽은 상태입니다.'
      };
    }

    // 읽지 않은 알림 수 업데이트
    await updateUnreadCount(userId);

    logger.info(`알림 읽음: id=${notificationId}, userId=${userId}`);

    return {
      success: true,
      notificationId,
      readAt: new Date()
    };

  } catch (error) {
    logger.error('알림 읽음 처리 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 모든 알림 읽음 처리
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} 처리 결과
 */
async function markAllAsRead(userId) {
  const client = await pool.connect();

  try {
    const updateQuery = `
      UPDATE notifications
      SET is_read = true, read_at = NOW()
      WHERE user_id = $1 AND is_read = false
      RETURNING id
    `;

    const result = await client.query(updateQuery, [userId]);
    const updatedCount = result.rows.length;

    // 읽지 않은 알림 수 업데이트
    await updateUnreadCount(userId);

    logger.info(`전체 알림 읽음: userId=${userId}, count=${updatedCount}`);

    return {
      success: true,
      updatedCount,
      readAt: new Date()
    };

  } catch (error) {
    logger.error('전체 알림 읽음 처리 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 읽지 않은 알림 개수 조회
 * @param {string} userId - 사용자 ID
 * @returns {Promise<number>} 읽지 않은 알림 개수
 */
async function getUnreadCount(userId) {
  const client = await pool.connect();

  try {
    const query = `
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = $1 AND is_read = false
    `;

    const result = await client.query(query, [userId]);
    return parseInt(result.rows[0].count);

  } catch (error) {
    logger.error('읽지 않은 알림 개수 조회 오류:', error);
    return 0;
  } finally {
    client.release();
  }
}

/**
 * 읽지 않은 알림 수 업데이트 및 브로드캐스트
 * @param {string} userId - 사용자 ID
 */
async function updateUnreadCount(userId) {
  try {
    const count = await getUnreadCount(userId);

    const io = require('../socket').getSocketServer();
    if (io) {
      // 사용자의 모든 소켓에 업데이트된 카운트 전송
      io.to(`user:${userId}`).emit('notification:unread-count', {
        count,
        timestamp: new Date()
      });
    }

    logger.debug(`읽지 않은 알림 수 업데이트: userId=${userId}, count=${count}`);

  } catch (error) {
    logger.error('읽지 않은 알림 수 업데이트 오류:', error);
  }
}

/**
 * 예약 알림 처리
 * 스케줄러에서 호출되는 함수
 * @param {string} notificationId - 알림 ID
 */
async function processScheduledNotification(notificationId) {
  const client = await pool.connect();

  try {
    // 예약 알림 조회
    const query = `
      SELECT * FROM notifications
      WHERE id = $1 AND scheduled_at IS NOT NULL AND is_sent = false
    `;

    const result = await client.query(query, [notificationId]);

    if (result.rows.length === 0) {
      logger.warn(`예약 알림 없음: id=${notificationId}`);
      return;
    }

    const notification = result.rows[0];

    // 전송 시간 확인
    const scheduledTime = moment(notification.scheduled_at);
    const now = moment();

    if (now.isBefore(scheduledTime)) {
      logger.info(`예약 알림 시간 미도래: id=${notificationId}, scheduled=${scheduledTime.format()}`);
      return;
    }

    // 즉시 전송
    await pushToUser(notification.user_id, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: JSON.parse(notification.data || '{}'),
      priority: notification.priority,
      timestamp: notification.created_at,
      isRead: false
    });

    // 전송 상태 업데이트
    await client.query(`
      UPDATE notifications
      SET is_sent = true, sent_at = NOW()
      WHERE id = $1
    `, [notificationId]);

    // 읽지 않은 알림 수 업데이트
    await updateUnreadCount(notification.user_id);

    logger.info(`예약 알림 전송 완료: id=${notificationId}`);

  } catch (error) {
    logger.error('예약 알림 처리 오류:', error);
  } finally {
    client.release();
  }
}

/**
 * 외부 알림 발송 (이메일, SMS 등)
 * @param {Object} user - 사용자 정보
 * @param {Object} notification - 알림 정보
 */
async function sendExternalNotification(user, notification) {
  try {
    // 사용자 알림 설정 조회
    const settings = await getUserNotificationSettings(user.id);

    // 이메일 알림
    if (settings.email && notification.priority !== 'low') {
      await notificationLib.sendNotification({
        type: 'email',
        recipient: user.email,
        content: {
          subject: notification.title,
          body: `
            <h2>${notification.title}</h2>
            <p>${notification.message}</p>
            <hr>
            <p><small>DOT Platform에서 발송된 알림입니다.</small></p>
          `
        },
        priority: notification.priority
      });
    }

    // SMS 알림 (긴급한 경우만)
    if (settings.sms && notification.priority === 'urgent') {
      await notificationLib.sendNotification({
        type: 'sms',
        recipient: user.phone,
        content: {
          body: `[DOT] ${notification.title}: ${notification.message}`
        }
      });
    }

  } catch (error) {
    logger.error('외부 알림 발송 오류:', error);
    // 외부 알림 실패는 전체 프로세스를 중단하지 않음
  }
}

/**
 * 사용자 알림 설정 조회
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Object>} 알림 설정
 */
async function getUserNotificationSettings(userId) {
  const client = await pool.connect();

  try {
    const query = `
      SELECT email_notifications, sms_notifications
      FROM user_notification_settings
      WHERE user_id = $1
    `;

    const result = await client.query(query, [userId]);

    if (result.rows.length === 0) {
      // 기본 설정
      return {
        email: true,
        sms: false
      };
    }

    const settings = result.rows[0];
    return {
      email: settings.email_notifications,
      sms: settings.sms_notifications
    };

  } catch (error) {
    logger.error('알림 설정 조회 오류:', error);
    // 기본 설정 반환
    return {
      email: true,
      sms: false
    };
  } finally {
    client.release();
  }
}

/**
 * 알림 타입별 아이콘 조회
 * @param {string} type - 알림 타입
 * @returns {string} 아이콘 URL
 */
function getNotificationIcon(type) {
  const icons = {
    attendance: '/icons/attendance.png',
    schedule: '/icons/schedule.png',
    payroll: '/icons/payroll.png',
    system: '/icons/system.png',
    chat: '/icons/chat.png',
    document: '/icons/document.png'
  };

  return icons[type] || '/icons/default.png';
}

/**
 * 알림 통계 조회
 * @param {string} userId - 사용자 ID
 * @param {string} period - 기간 (day, week, month)
 * @returns {Promise<Object>} 알림 통계
 */
async function getNotificationStats(userId, period = 'week') {
  const client = await pool.connect();

  try {
    let dateFilter = '';
    switch (period) {
      case 'day':
        dateFilter = "created_at >= CURRENT_DATE";
        break;
      case 'week':
        dateFilter = "created_at >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'month':
        dateFilter = "created_at >= CURRENT_DATE - INTERVAL '30 days'";
        break;
    }

    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN is_read = true THEN 1 END) as read,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread,
        COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority,
        COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent
      FROM notifications
      WHERE user_id = $1 AND ${dateFilter}
    `;

    const result = await client.query(query, [userId]);
    const stats = result.rows[0];

    return {
      total: parseInt(stats.total),
      read: parseInt(stats.read),
      unread: parseInt(stats.unread),
      readRate: stats.total > 0 ? Math.round((stats.read / stats.total) * 100) : 0,
      highPriority: parseInt(stats.high_priority),
      urgent: parseInt(stats.urgent),
      period
    };

  } catch (error) {
    logger.error('알림 통계 조회 오류:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  sendNotification,
  pushToUser,
  pushToUsers,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  updateUnreadCount,
  processScheduledNotification,
  getNotificationStats
};