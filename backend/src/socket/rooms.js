/**
 * T293: 사업장별 룸 관리
 * WebSocket 룸 생성 및 참가 관리
 *
 * 룸 구조:
 * - business:{id} : 사업장 전체 룸
 * - business:{id}:owners : 소유자 전용 룸
 * - business:{id}:managers : 관리자 전용 룸
 * - business:{id}:workers : 근로자 전용 룸
 * - user:{id} : 개인 전용 룸
 * - shift:{id} : 교대 근무 룸
 * - department:{id} : 부서별 룸
 */

const pool = require('../db');
const logger = require('../utils/logger');

/**
 * 룸 설정
 * 사용자 정보에 따라 적절한 룸에 자동 참가
 * @param {Socket} socket - Socket.io 소켓
 * @param {Server} io - Socket.io 서버
 */
async function setupRooms(socket, io) {
  try {
    const userId = socket.user?.id;
    const businessId = socket.user?.currentBusinessId;
    const role = socket.user?.currentRole;

    if (!userId) {
      logger.warn('룸 설정 실패: 사용자 ID 없음');
      return;
    }

    // 개인 룸 참가 (1:1 메시지용)
    const userRoom = `user:${userId}`;
    await socket.join(userRoom);
    logger.info(`룸 참가: userId=${userId}, room=${userRoom}`);

    // 사업장 룸 참가
    if (businessId) {
      // 사업장 전체 룸
      const businessRoom = `business:${businessId}`;
      await socket.join(businessRoom);
      logger.info(`룸 참가: userId=${userId}, room=${businessRoom}`);

      // 역할별 룸 참가
      if (role) {
        const roleRoom = `business:${businessId}:${role}s`;
        await socket.join(roleRoom);
        logger.info(`룸 참가: userId=${userId}, room=${roleRoom}`);
      }

      // 부서별 룸 참가 (있는 경우)
      const departmentId = await getUserDepartment(userId, businessId);
      if (departmentId) {
        const departmentRoom = `department:${departmentId}`;
        await socket.join(departmentRoom);
        logger.info(`룸 참가: userId=${userId}, room=${departmentRoom}`);
      }

      // 현재 교대 근무 룸 참가 (있는 경우)
      const shiftId = await getCurrentShift(userId, businessId);
      if (shiftId) {
        const shiftRoom = `shift:${shiftId}`;
        await socket.join(shiftRoom);
        logger.info(`룸 참가: userId=${userId}, room=${shiftRoom}`);
      }
    }

    // 룸 이벤트 핸들러 설정
    setupRoomEventHandlers(socket, io);

    // 현재 참가 중인 룸 목록 전송
    socket.emit('rooms:joined', {
      rooms: Array.from(socket.rooms).filter(room => room !== socket.id)
    });

  } catch (error) {
    logger.error('룸 설정 오류:', error);
    socket.emit('error', {
      message: '룸 설정에 실패했습니다.',
      error: error.message
    });
  }
}

/**
 * 룸 이벤트 핸들러 설정
 * @param {Socket} socket - Socket.io 소켓
 * @param {Server} io - Socket.io 서버
 */
function setupRoomEventHandlers(socket, io) {
  // 룸 참가 요청
  socket.on('room:join', async (data, callback) => {
    try {
      const { room, type } = data;

      // 권한 확인
      const hasAccess = await checkRoomAccess(socket, room, type);
      if (!hasAccess) {
        callback({
          success: false,
          error: '해당 룸에 접근 권한이 없습니다.'
        });
        return;
      }

      // 룸 참가
      await socket.join(room);
      logger.info(`룸 참가 요청: userId=${socket.user.id}, room=${room}`);

      // 다른 사용자들에게 알림
      socket.to(room).emit('room:user-joined', {
        room,
        userId: socket.user.id,
        userName: socket.user.name,
        joinedAt: new Date()
      });

      callback({ success: true, room });

    } catch (error) {
      logger.error('룸 참가 오류:', error);
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // 룸 나가기 요청
  socket.on('room:leave', async (data, callback) => {
    try {
      const { room } = data;

      // 기본 룸은 나갈 수 없음
      if (isDefaultRoom(socket, room)) {
        callback({
          success: false,
          error: '기본 룸은 나갈 수 없습니다.'
        });
        return;
      }

      // 룸에서 나가기
      await socket.leave(room);
      logger.info(`룸 나가기: userId=${socket.user.id}, room=${room}`);

      // 다른 사용자들에게 알림
      socket.to(room).emit('room:user-left', {
        room,
        userId: socket.user.id,
        userName: socket.user.name,
        leftAt: new Date()
      });

      callback({ success: true, room });

    } catch (error) {
      logger.error('룸 나가기 오류:', error);
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // 룸 사용자 목록 조회
  socket.on('room:users', async (data, callback) => {
    try {
      const { room } = data;

      // 권한 확인
      if (!socket.rooms.has(room)) {
        callback({
          success: false,
          error: '해당 룸에 참가하지 않았습니다.'
        });
        return;
      }

      // 룸의 모든 소켓 조회
      const sockets = await io.in(room).fetchSockets();
      const users = sockets.map(s => ({
        userId: s.user?.id,
        userName: s.user?.name,
        socketId: s.id,
        connectedAt: s.data.connectedAt
      }));

      callback({
        success: true,
        room,
        users,
        count: users.length
      });

    } catch (error) {
      logger.error('룸 사용자 조회 오류:', error);
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // 룸 메시지 전송
  socket.on('room:message', async (data, callback) => {
    try {
      const { room, message, type = 'text' } = data;

      // 룸 참가 확인
      if (!socket.rooms.has(room)) {
        callback({
          success: false,
          error: '해당 룸에 참가하지 않았습니다.'
        });
        return;
      }

      // 메시지 브로드캐스트
      const messageData = {
        id: generateMessageId(),
        room,
        userId: socket.user.id,
        userName: socket.user.name,
        message,
        type,
        timestamp: new Date()
      };

      socket.to(room).emit('room:message', messageData);

      // 메시지 로그 저장 (선택적)
      await saveRoomMessage(room, messageData);

      callback({
        success: true,
        messageId: messageData.id
      });

    } catch (error) {
      logger.error('룸 메시지 전송 오류:', error);
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // 사업장 변경
  socket.on('business:switch', async (data, callback) => {
    try {
      const { businessId } = data;
      const userId = socket.user.id;

      // 권한 확인
      const hasAccess = await checkBusinessAccess(userId, businessId);
      if (!hasAccess) {
        callback({
          success: false,
          error: '해당 사업장에 접근 권한이 없습니다.'
        });
        return;
      }

      // 기존 사업장 룸에서 나가기
      const currentBusinessId = socket.user.currentBusinessId;
      if (currentBusinessId) {
        const oldRooms = Array.from(socket.rooms).filter(room =>
          room.startsWith(`business:${currentBusinessId}`) ||
          room.startsWith('department:') ||
          room.startsWith('shift:')
        );

        for (const room of oldRooms) {
          await socket.leave(room);
        }
      }

      // 새 사업장 정보 조회 및 업데이트
      const client = await pool.connect();
      try {
        const roleQuery = `
          SELECT role_type
          FROM user_roles
          WHERE user_id = $1 AND business_id = $2 AND is_active = true
        `;
        const roleResult = await client.query(roleQuery, [userId, businessId]);

        if (roleResult.rows.length === 0) {
          callback({
            success: false,
            error: '사업장 역할을 찾을 수 없습니다.'
          });
          return;
        }

        const newRole = roleResult.rows[0].role_type;

        // 소켓 사용자 정보 업데이트
        socket.user.currentBusinessId = businessId;
        socket.user.currentRole = newRole;
        socket.data.businessId = businessId;

        // 새 사업장 룸 참가
        await setupRooms(socket, io);

        callback({
          success: true,
          businessId,
          role: newRole
        });

        logger.info(`사업장 변경: userId=${userId}, businessId=${businessId}`);

      } finally {
        client.release();
      }

    } catch (error) {
      logger.error('사업장 변경 오류:', error);
      callback({
        success: false,
        error: error.message
      });
    }
  });
}

/**
 * 룸 접근 권한 확인
 * @param {Socket} socket - Socket.io 소켓
 * @param {string} room - 룸 이름
 * @param {string} type - 룸 타입
 * @returns {Promise<boolean>} 접근 가능 여부
 */
async function checkRoomAccess(socket, room, type) {
  try {
    const userId = socket.user?.id;
    const businessId = socket.user?.currentBusinessId;
    const role = socket.user?.currentRole;

    switch (type) {
      case 'business':
        // 사업장 멤버만 접근 가능
        return room === `business:${businessId}`;

      case 'role':
        // 해당 역할만 접근 가능
        return room === `business:${businessId}:${role}s`;

      case 'user':
        // 본인 룸만 접근 가능
        return room === `user:${userId}`;

      case 'department':
        // 부서 멤버만 접근 가능
        const departmentId = room.replace('department:', '');
        return await checkDepartmentMembership(userId, departmentId);

      case 'shift':
        // 교대 근무자만 접근 가능
        const shiftId = room.replace('shift:', '');
        return await checkShiftMembership(userId, shiftId);

      default:
        return false;
    }
  } catch (error) {
    logger.error('룸 접근 권한 확인 오류:', error);
    return false;
  }
}

/**
 * 기본 룸 여부 확인
 * @param {Socket} socket - Socket.io 소켓
 * @param {string} room - 룸 이름
 * @returns {boolean} 기본 룸 여부
 */
function isDefaultRoom(socket, room) {
  const userId = socket.user?.id;
  const businessId = socket.user?.currentBusinessId;
  const role = socket.user?.currentRole;

  const defaultRooms = [
    `user:${userId}`,
    `business:${businessId}`,
    `business:${businessId}:${role}s`
  ];

  return defaultRooms.includes(room);
}

/**
 * 사용자 부서 조회
 * @param {string} userId - 사용자 ID
 * @param {string} businessId - 사업장 ID
 * @returns {Promise<string|null>} 부서 ID
 */
async function getUserDepartment(userId, businessId) {
  const client = await pool.connect();
  try {
    const query = `
      SELECT department_id
      FROM user_departments
      WHERE user_id = $1 AND business_id = $2 AND is_active = true
    `;
    const result = await client.query(query, [userId, businessId]);
    return result.rows[0]?.department_id || null;
  } catch (error) {
    logger.error('부서 조회 오류:', error);
    return null;
  } finally {
    client.release();
  }
}

/**
 * 현재 교대 근무 조회
 * @param {string} userId - 사용자 ID
 * @param {string} businessId - 사업장 ID
 * @returns {Promise<string|null>} 교대 ID
 */
async function getCurrentShift(userId, businessId) {
  const client = await pool.connect();
  try {
    const query = `
      SELECT id
      FROM schedules
      WHERE user_id = $1
        AND business_id = $2
        AND start_time <= NOW()
        AND end_time >= NOW()
        AND status = 'confirmed'
      LIMIT 1
    `;
    const result = await client.query(query, [userId, businessId]);
    return result.rows[0]?.id || null;
  } catch (error) {
    logger.error('교대 조회 오류:', error);
    return null;
  } finally {
    client.release();
  }
}

/**
 * 사업장 접근 권한 확인
 * @param {string} userId - 사용자 ID
 * @param {string} businessId - 사업장 ID
 * @returns {Promise<boolean>} 접근 가능 여부
 */
async function checkBusinessAccess(userId, businessId) {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 1
      FROM user_roles
      WHERE user_id = $1 AND business_id = $2 AND is_active = true
    `;
    const result = await client.query(query, [userId, businessId]);
    return result.rows.length > 0;
  } catch (error) {
    logger.error('사업장 접근 권한 확인 오류:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * 부서 멤버십 확인
 * @param {string} userId - 사용자 ID
 * @param {string} departmentId - 부서 ID
 * @returns {Promise<boolean>} 멤버 여부
 */
async function checkDepartmentMembership(userId, departmentId) {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 1
      FROM user_departments
      WHERE user_id = $1 AND department_id = $2 AND is_active = true
    `;
    const result = await client.query(query, [userId, departmentId]);
    return result.rows.length > 0;
  } catch (error) {
    logger.error('부서 멤버십 확인 오류:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * 교대 멤버십 확인
 * @param {string} userId - 사용자 ID
 * @param {string} shiftId - 교대 ID
 * @returns {Promise<boolean>} 멤버 여부
 */
async function checkShiftMembership(userId, shiftId) {
  const client = await pool.connect();
  try {
    const query = `
      SELECT 1
      FROM schedules
      WHERE id = $1 AND user_id = $2
    `;
    const result = await client.query(query, [shiftId, userId]);
    return result.rows.length > 0;
  } catch (error) {
    logger.error('교대 멤버십 확인 오류:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * 메시지 ID 생성
 * @returns {string} 메시지 ID
 */
function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 룸 메시지 저장
 * @param {string} room - 룸 이름
 * @param {Object} message - 메시지 데이터
 */
async function saveRoomMessage(room, message) {
  // 메시지 로깅은 선택적 구현
  // 필요시 데이터베이스나 Redis에 저장
  logger.info(`룸 메시지: room=${room}, userId=${message.userId}, type=${message.type}`);
}

module.exports = {
  setupRooms,
  checkRoomAccess,
  checkBusinessAccess
};