/**
 * T284: 알림 큐 관리 모듈
 * 발송 큐, 예약 발송, 이력 관리
 */

// 메모리 기반 큐 (실제로는 Redis 또는 DB 사용)
const notificationQueue = [];
const notificationHistory = [];
let notificationIdCounter = 1;

/**
 * 알림 예약
 * @param {Object} notification - 알림 데이터
 * @returns {Object} 예약 결과
 */
async function schedule(notification) {
  try {
    const id = `NOTIF_${Date.now()}_${notificationIdCounter++}`;

    const queueItem = {
      id,
      ...notification,
      status: 'pending',
      createdAt: new Date(),
      scheduledAt: new Date(notification.scheduledAt)
    };

    notificationQueue.push(queueItem);

    return {
      success: true,
      id,
      scheduledAt: queueItem.scheduledAt
    };

  } catch (error) {
    console.error('알림 예약 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 대기 중인 알림 조회
 * @returns {Array} 대기 중인 알림 목록
 */
async function getPending() {
  const now = new Date();

  // 발송 시간이 된 알림 필터링
  return notificationQueue.filter(notification =>
    notification.status === 'pending' &&
    (!notification.scheduledAt || notification.scheduledAt <= now)
  );
}

/**
 * 알림 상태 업데이트
 * @param {string} notificationId - 알림 ID
 * @param {string} status - 새 상태
 * @returns {boolean} 업데이트 성공 여부
 */
async function updateStatus(notificationId, status) {
  const notification = notificationQueue.find(n => n.id === notificationId);

  if (notification) {
    notification.status = status;
    notification.updatedAt = new Date();

    // 완료된 알림은 이력으로 이동
    if (status === 'sent' || status === 'failed' || status === 'cancelled') {
      const index = notificationQueue.indexOf(notification);
      notificationQueue.splice(index, 1);
      notificationHistory.push(notification);
    }

    return true;
  }

  return false;
}

/**
 * 알림 조회
 * @param {string} notificationId - 알림 ID
 * @returns {Object} 알림 데이터
 */
async function getNotification(notificationId) {
  // 큐에서 먼저 검색
  let notification = notificationQueue.find(n => n.id === notificationId);

  // 이력에서 검색
  if (!notification) {
    notification = notificationHistory.find(n => n.id === notificationId);
  }

  return notification || null;
}

/**
 * 인앱 알림 저장
 * @param {Object} notification - 알림 데이터
 * @returns {Object} 저장 결과
 */
async function saveInApp(notification) {
  try {
    const id = `INAPP_${Date.now()}_${notificationIdCounter++}`;

    const inAppNotification = {
      id,
      type: 'in_app',
      ...notification,
      status: 'sent',
      readAt: null,
      createdAt: new Date()
    };

    notificationHistory.push(inAppNotification);

    return {
      success: true,
      id
    };

  } catch (error) {
    console.error('인앱 알림 저장 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 알림 로그 기록
 * @param {Object} logData - 로그 데이터
 * @returns {void}
 */
async function logNotification(logData) {
  const logEntry = {
    id: `LOG_${Date.now()}_${notificationIdCounter++}`,
    ...logData,
    loggedAt: new Date()
  };

  notificationHistory.push(logEntry);
}

/**
 * 이력 조회
 * @param {Object} filters - 조회 필터
 * @returns {Array} 알림 이력
 */
async function queryHistory(filters = {}) {
  const {
    userId,
    type,
    status,
    startDate,
    endDate
  } = filters;

  let results = [...notificationHistory];

  // 사용자 필터
  if (userId) {
    results = results.filter(n =>
      n.recipient === userId ||
      n.metadata?.userId === userId
    );
  }

  // 타입 필터
  if (type) {
    results = results.filter(n => n.type === type);
  }

  // 상태 필터
  if (status) {
    results = results.filter(n => n.status === status);
  }

  // 날짜 범위 필터
  if (startDate) {
    const start = new Date(startDate);
    results = results.filter(n => new Date(n.createdAt) >= start);
  }

  if (endDate) {
    const end = new Date(endDate);
    results = results.filter(n => new Date(n.createdAt) <= end);
  }

  // 최신 순 정렬
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return results;
}

/**
 * 큐 상태 조회
 * @returns {Object} 큐 상태
 */
async function getQueueStatus() {
  const now = new Date();

  const pending = notificationQueue.filter(n => n.status === 'pending').length;
  const processing = notificationQueue.filter(n => n.status === 'processing').length;
  const scheduled = notificationQueue.filter(n =>
    n.status === 'pending' && n.scheduledAt > now
  ).length;

  return {
    pending,
    processing,
    scheduled,
    total: notificationQueue.length,
    historyCount: notificationHistory.length
  };
}

/**
 * 큐 정리
 * @param {number} daysToKeep - 보관 일수
 * @returns {Object} 정리 결과
 */
async function cleanupQueue(daysToKeep = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const before = notificationHistory.length;

  // 오래된 이력 제거
  const recentHistory = notificationHistory.filter(n =>
    new Date(n.createdAt) > cutoffDate
  );

  notificationHistory.length = 0;
  notificationHistory.push(...recentHistory);

  const after = notificationHistory.length;

  return {
    success: true,
    removed: before - after,
    remaining: after
  };
}

/**
 * 재시도 큐 추가
 * @param {Object} notification - 실패한 알림
 * @param {number} retryAfter - 재시도 대기 시간 (밀리초)
 * @returns {Object} 재시도 예약 결과
 */
async function addToRetryQueue(notification, retryAfter = 60000) {
  const retryTime = new Date(Date.now() + retryAfter);

  const retryNotification = {
    ...notification,
    scheduledAt: retryTime,
    retryCount: (notification.retryCount || 0) + 1,
    status: 'pending'
  };

  return await schedule(retryNotification);
}

/**
 * 우선순위 큐 처리
 * @returns {Array} 우선순위 정렬된 알림 목록
 */
async function getPriorityQueue() {
  const pending = await getPending();

  // 우선순위별 정렬
  return pending.sort((a, b) => {
    // 우선순위가 높은 것 먼저
    if (a.priority !== b.priority) {
      return (b.priority || 0) - (a.priority || 0);
    }
    // 같은 우선순위면 오래된 것 먼저
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

/**
 * 배치 처리용 알림 그룹화
 * @param {Array} notifications - 알림 목록
 * @returns {Object} 타입별로 그룹화된 알림
 */
function groupByType(notifications) {
  return notifications.reduce((groups, notification) => {
    const type = notification.type || 'unknown';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(notification);
    return groups;
  }, {});
}

module.exports = {
  schedule,
  getPending,
  updateStatus,
  getNotification,
  saveInApp,
  logNotification,
  queryHistory,
  getQueueStatus,
  cleanupQueue,
  addToRetryQueue,
  getPriorityQueue,
  groupByType
};