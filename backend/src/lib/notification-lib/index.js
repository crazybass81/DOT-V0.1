/**
 * T281: Notification Library 메인 모듈
 * 알림 발송 라이브러리 - 이메일, SMS, 푸시 알림 관리
 *
 * 주요 기능:
 * - 이메일 발송 (nodemailer)
 * - SMS 발송 (준비)
 * - 템플릿 기반 메시지 생성
 * - 발송 큐 관리
 * - 발송 이력 추적
 */

const email = require('./email');
const sms = require('./sms');
const template = require('./template');
const queue = require('./queue');

// 알림 타입
const NOTIFICATION_TYPES = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  IN_APP: 'in_app'
};

// 우선순위
const PRIORITY = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  URGENT: 3
};

// 상태
const STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SENT: 'sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// 에러 코드
const ERROR_CODES = {
  INVALID_RECIPIENT: 'INVALID_RECIPIENT',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  SEND_FAILED: 'SEND_FAILED',
  QUEUE_FULL: 'QUEUE_FULL',
  RATE_LIMIT: 'RATE_LIMIT'
};

/**
 * 알림 발송
 * @param {Object} notification - 알림 객체
 * @returns {Promise<Object>} 발송 결과
 */
async function sendNotification(notification) {
  try {
    const {
      type = NOTIFICATION_TYPES.EMAIL,
      recipient,
      templateId,
      data = {},
      priority = PRIORITY.NORMAL,
      scheduledAt = null,
      metadata = {}
    } = notification;

    // 1. 수신자 검증
    if (!recipient) {
      return {
        success: false,
        error: ERROR_CODES.INVALID_RECIPIENT,
        message: '수신자 정보가 필요합니다.'
      };
    }

    // 2. 템플릿 로드 및 렌더링
    let content;
    if (templateId) {
      const templateResult = await template.render(templateId, data);
      if (!templateResult.success) {
        return {
          success: false,
          error: ERROR_CODES.TEMPLATE_NOT_FOUND,
          message: templateResult.error
        };
      }
      content = templateResult.content;
    } else if (notification.content) {
      content = notification.content;
    } else {
      return {
        success: false,
        error: ERROR_CODES.TEMPLATE_NOT_FOUND,
        message: '템플릿 ID 또는 내용이 필요합니다.'
      };
    }

    // 3. 예약 발송인 경우 큐에 추가
    if (scheduledAt && new Date(scheduledAt) > new Date()) {
      const queueResult = await queue.schedule({
        type,
        recipient,
        content,
        priority,
        scheduledAt,
        metadata
      });

      return {
        success: true,
        scheduled: true,
        queueId: queueResult.id,
        scheduledAt
      };
    }

    // 4. 즉시 발송
    let sendResult;
    switch (type) {
      case NOTIFICATION_TYPES.EMAIL:
        sendResult = await email.send({
          to: recipient,
          subject: content.subject,
          html: content.body,
          text: content.text
        });
        break;

      case NOTIFICATION_TYPES.SMS:
        sendResult = await sms.send({
          to: recipient,
          message: content.body || content.text
        });
        break;

      case NOTIFICATION_TYPES.PUSH:
        sendResult = {
          success: false,
          error: 'PUSH 알림은 아직 구현되지 않았습니다.'
        };
        break;

      case NOTIFICATION_TYPES.IN_APP:
        // 인앱 알림은 데이터베이스에만 저장
        sendResult = await queue.saveInApp({
          recipient,
          content,
          metadata
        });
        break;

      default:
        sendResult = {
          success: false,
          error: `지원하지 않는 알림 타입: ${type}`
        };
    }

    // 5. 발송 이력 저장
    await queue.logNotification({
      type,
      recipient,
      content,
      status: sendResult.success ? STATUS.SENT : STATUS.FAILED,
      result: sendResult,
      metadata
    });

    return sendResult;

  } catch (error) {
    console.error('알림 발송 오류:', error);
    return {
      success: false,
      error: ERROR_CODES.SEND_FAILED,
      message: error.message
    };
  }
}

/**
 * 일괄 알림 발송
 * @param {Array} notifications - 알림 배열
 * @param {Object} options - 발송 옵션
 * @returns {Promise<Object>} 일괄 발송 결과
 */
async function sendBulkNotifications(notifications, options = {}) {
  const {
    parallel = false,
    batchSize = 10,
    delayBetween = 100
  } = options;

  const results = {
    total: notifications.length,
    sent: 0,
    failed: 0,
    errors: []
  };

  try {
    if (parallel) {
      // 병렬 발송
      const batches = [];
      for (let i = 0; i < notifications.length; i += batchSize) {
        batches.push(notifications.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map(notification => sendNotification(notification))
        );

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.success) {
            results.sent++;
          } else {
            results.failed++;
            results.errors.push({
              notification: batch[index],
              error: result.reason || result.value?.error
            });
          }
        });

        // 배치 간 딜레이
        if (delayBetween > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetween));
        }
      }
    } else {
      // 순차 발송
      for (const notification of notifications) {
        try {
          const result = await sendNotification(notification);
          if (result.success) {
            results.sent++;
          } else {
            results.failed++;
            results.errors.push({
              notification,
              error: result.error
            });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({
            notification,
            error: error.message
          });
        }

        // 개별 발송 간 딜레이
        if (delayBetween > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetween));
        }
      }
    }

    return {
      success: true,
      data: results
    };

  } catch (error) {
    console.error('일괄 발송 오류:', error);
    return {
      success: false,
      error: error.message,
      data: results
    };
  }
}

/**
 * 알림 큐 처리
 * @returns {Promise<Object>} 처리 결과
 */
async function processQueue() {
  try {
    const pendingNotifications = await queue.getPending();
    const results = {
      processed: 0,
      failed: 0
    };

    for (const notification of pendingNotifications) {
      // 상태 업데이트
      await queue.updateStatus(notification.id, STATUS.PROCESSING);

      // 발송 시도
      const result = await sendNotification(notification);

      if (result.success) {
        await queue.updateStatus(notification.id, STATUS.SENT);
        results.processed++;
      } else {
        await queue.updateStatus(notification.id, STATUS.FAILED);
        results.failed++;
      }
    }

    return {
      success: true,
      data: results
    };

  } catch (error) {
    console.error('큐 처리 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 알림 취소
 * @param {string} notificationId - 알림 ID
 * @returns {Promise<Object>} 취소 결과
 */
async function cancelNotification(notificationId) {
  try {
    const notification = await queue.getNotification(notificationId);

    if (!notification) {
      return {
        success: false,
        error: '알림을 찾을 수 없습니다.'
      };
    }

    if (notification.status !== STATUS.PENDING) {
      return {
        success: false,
        error: `${notification.status} 상태의 알림은 취소할 수 없습니다.`
      };
    }

    await queue.updateStatus(notificationId, STATUS.CANCELLED);

    return {
      success: true,
      message: '알림이 취소되었습니다.'
    };

  } catch (error) {
    console.error('알림 취소 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 알림 이력 조회
 * @param {Object} filters - 조회 필터
 * @returns {Promise<Object>} 알림 이력
 */
async function getNotificationHistory(filters = {}) {
  try {
    const {
      userId,
      type,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = filters;

    const history = await queue.queryHistory({
      userId,
      type,
      status,
      startDate,
      endDate
    });

    // 페이지네이션
    const offset = (page - 1) * limit;
    const paginatedHistory = history.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        notifications: paginatedHistory,
        pagination: {
          total: history.length,
          page,
          limit,
          totalPages: Math.ceil(history.length / limit)
        }
      }
    };

  } catch (error) {
    console.error('이력 조회 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 템플릿 등록
 * @param {Object} templateData - 템플릿 데이터
 * @returns {Promise<Object>} 등록 결과
 */
async function registerTemplate(templateData) {
  try {
    const result = await template.register(templateData);
    return result;
  } catch (error) {
    console.error('템플릿 등록 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  // 주요 기능
  sendNotification,
  sendBulkNotifications,
  processQueue,
  cancelNotification,
  getNotificationHistory,
  registerTemplate,

  // 유틸리티
  validateEmail: email.validateEmail,
  validatePhone: sms.validatePhone,
  renderTemplate: template.render,

  // 상수
  NOTIFICATION_TYPES,
  PRIORITY,
  STATUS,
  ERROR_CODES
};