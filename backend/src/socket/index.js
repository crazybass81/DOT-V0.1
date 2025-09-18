/**
 * T291: Socket.io 서버 초기화
 * WebSocket 실시간 통신 서버 설정
 *
 * 주요 기능:
 * - Socket.io 서버 생성 및 CORS 설정
 * - 인증 미들웨어 연결
 * - 네임스페이스 및 룸 설정
 * - Redis 어댑터 연결 (스케일링)
 * - 연결/해제 이벤트 처리
 */

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const { authenticateSocket } = require('./auth');
const { setupRooms } = require('./rooms');
const { setupEventHandlers } = require('./events');

let io = null;

/**
 * Socket.io 서버 초기화
 * @param {http.Server} httpServer - HTTP 서버 인스턴스
 * @param {Object} options - 설정 옵션
 * @returns {Server} Socket.io 서버 인스턴스
 */
function initializeSocketServer(httpServer, options = {}) {
  // 이미 초기화된 경우
  if (io) {
    logger.warn('Socket.io 서버가 이미 초기화되었습니다.');
    return io;
  }

  // Socket.io 서버 생성
  io = new Server(httpServer, {
    cors: {
      origin: options.corsOrigin || process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Authorization']
    },
    // 연결 옵션
    pingTimeout: options.pingTimeout || 60000, // 60초
    pingInterval: options.pingInterval || 25000, // 25초
    // 전송 옵션
    transports: ['websocket', 'polling'], // WebSocket 우선, 폴백으로 polling
    // 최대 HTTP 버퍼 크기
    maxHttpBufferSize: options.maxHttpBufferSize || 1e6, // 1MB
    // 경로
    path: options.path || '/socket.io/',
    // 서버 옵션
    serveClient: false, // 클라이언트 라이브러리 서빙 비활성화
    // 연결 상태 복구
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2분
      skipMiddlewares: false
    }
  });

  // Redis 어댑터 설정 (멀티 서버 지원)
  if (process.env.REDIS_URL) {
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.io Redis 어댑터 연결 성공');
      })
      .catch(error => {
        logger.error('Socket.io Redis 어댑터 연결 실패:', error);
      });
  } else {
    logger.warn('Redis URL이 설정되지 않음. 단일 서버 모드로 동작');
  }

  // 인증 미들웨어 적용
  io.use(authenticateSocket);

  // 연결 이벤트 처리
  io.on('connection', (socket) => {
    const userId = socket.user?.id;
    const businessId = socket.user?.currentBusinessId;

    logger.info(`소켓 연결: userId=${userId}, businessId=${businessId}, socketId=${socket.id}`);

    // 사용자 정보를 소켓에 저장
    socket.data.userId = userId;
    socket.data.businessId = businessId;
    socket.data.connectedAt = new Date();

    // 룸 설정
    setupRooms(socket, io);

    // 이벤트 핸들러 설정
    setupEventHandlers(socket, io);

    // 연결 상태 브로드캐스트
    if (businessId) {
      socket.to(`business:${businessId}`).emit('user:online', {
        userId,
        socketId: socket.id,
        connectedAt: socket.data.connectedAt
      });
    }

    // 연결 해제 처리
    socket.on('disconnect', (reason) => {
      logger.info(`소켓 연결 해제: userId=${userId}, reason=${reason}`);

      // 연결 해제 브로드캐스트
      if (businessId) {
        socket.to(`business:${businessId}`).emit('user:offline', {
          userId,
          socketId: socket.id,
          disconnectedAt: new Date(),
          reason
        });
      }

      // 정리 작업
      cleanupSocket(socket);
    });

    // 에러 처리
    socket.on('error', (error) => {
      logger.error(`소켓 에러: userId=${userId}`, error);
    });

    // 핑-퐁 체크 (연결 상태 확인)
    socket.on('ping', (callback) => {
      callback({ timestamp: Date.now() });
    });
  });

  // 서버 레벨 에러 처리
  io.on('error', (error) => {
    logger.error('Socket.io 서버 에러:', error);
  });

  // 네임스페이스 설정
  setupNamespaces(io);

  logger.info('Socket.io 서버 초기화 완료');
  return io;
}

/**
 * 네임스페이스 설정
 * 기능별로 분리된 네임스페이스 생성
 */
function setupNamespaces(io) {
  // 근태 관리 네임스페이스
  const attendanceNsp = io.of('/attendance');
  attendanceNsp.use(authenticateSocket);
  attendanceNsp.on('connection', (socket) => {
    logger.info(`근태 네임스페이스 연결: userId=${socket.user?.id}`);
    // 근태 관련 이벤트는 attendance-broadcast.js에서 처리
  });

  // 스케줄 관리 네임스페이스
  const scheduleNsp = io.of('/schedule');
  scheduleNsp.use(authenticateSocket);
  scheduleNsp.on('connection', (socket) => {
    logger.info(`스케줄 네임스페이스 연결: userId=${socket.user?.id}`);
    // 스케줄 관련 이벤트는 schedule-updates.js에서 처리
  });

  // 알림 네임스페이스
  const notificationNsp = io.of('/notification');
  notificationNsp.use(authenticateSocket);
  notificationNsp.on('connection', (socket) => {
    logger.info(`알림 네임스페이스 연결: userId=${socket.user?.id}`);
    // 알림 관련 이벤트는 notification-push.js에서 처리
  });

  // 관리자 네임스페이스
  const adminNsp = io.of('/admin');
  adminNsp.use(authenticateSocket);
  adminNsp.use((socket, next) => {
    // 관리자 권한 확인
    if (socket.user?.role === 'owner' || socket.user?.role === 'manager') {
      next();
    } else {
      next(new Error('관리자 권한이 필요합니다.'));
    }
  });
  adminNsp.on('connection', (socket) => {
    logger.info(`관리자 네임스페이스 연결: userId=${socket.user?.id}`);
  });
}

/**
 * 소켓 정리
 * 연결 해제 시 리소스 정리
 */
function cleanupSocket(socket) {
  // 모든 룸에서 나가기
  socket.rooms.forEach(room => {
    if (room !== socket.id) {
      socket.leave(room);
    }
  });

  // 소켓 데이터 정리
  delete socket.data.userId;
  delete socket.data.businessId;
  delete socket.data.connectedAt;
}

/**
 * Socket.io 서버 종료
 */
function shutdownSocketServer() {
  if (io) {
    logger.info('Socket.io 서버 종료 중...');

    // 모든 연결 종료
    io.disconnectSockets(true);

    // 서버 닫기
    io.close(() => {
      logger.info('Socket.io 서버 종료 완료');
    });

    io = null;
  }
}

/**
 * 특정 사용자에게 이벤트 전송
 * @param {string} userId - 사용자 ID
 * @param {string} event - 이벤트 이름
 * @param {*} data - 전송할 데이터
 */
function emitToUser(userId, event, data) {
  if (!io) {
    logger.warn('Socket.io 서버가 초기화되지 않았습니다.');
    return;
  }

  // 사용자의 모든 소켓 찾기
  const sockets = [];
  for (const [socketId, socket] of io.sockets.sockets) {
    if (socket.data.userId === userId) {
      sockets.push(socket);
    }
  }

  // 이벤트 전송
  sockets.forEach(socket => {
    socket.emit(event, data);
  });

  return sockets.length;
}

/**
 * 특정 사업장에 이벤트 브로드캐스트
 * @param {string} businessId - 사업장 ID
 * @param {string} event - 이벤트 이름
 * @param {*} data - 전송할 데이터
 * @param {string} excludeUserId - 제외할 사용자 ID (선택)
 */
function broadcastToBusiness(businessId, event, data, excludeUserId = null) {
  if (!io) {
    logger.warn('Socket.io 서버가 초기화되지 않았습니다.');
    return;
  }

  const room = `business:${businessId}`;

  if (excludeUserId) {
    // 특정 사용자 제외하고 브로드캐스트
    for (const [socketId, socket] of io.sockets.sockets) {
      if (socket.rooms.has(room) && socket.data.userId !== excludeUserId) {
        socket.emit(event, data);
      }
    }
  } else {
    // 모든 사용자에게 브로드캐스트
    io.to(room).emit(event, data);
  }
}

/**
 * 연결된 사용자 목록 조회
 * @param {string} businessId - 사업장 ID (선택)
 * @returns {Array} 연결된 사용자 목록
 */
function getConnectedUsers(businessId = null) {
  if (!io) {
    return [];
  }

  const users = [];
  for (const [socketId, socket] of io.sockets.sockets) {
    if (!businessId || socket.data.businessId === businessId) {
      users.push({
        userId: socket.data.userId,
        socketId: socketId,
        businessId: socket.data.businessId,
        connectedAt: socket.data.connectedAt
      });
    }
  }

  return users;
}

/**
 * Socket.io 인스턴스 가져오기
 * @returns {Server} Socket.io 서버 인스턴스
 */
function getSocketServer() {
  return io;
}

module.exports = {
  initializeSocketServer,
  shutdownSocketServer,
  emitToUser,
  broadcastToBusiness,
  getConnectedUsers,
  getSocketServer
};