/**
 * T299: 브로드캐스트 테스트
 * WebSocket 룸별 브로드캐스트 및 선택적 전송 테스트
 *
 * 테스트 항목:
 * - 룸별 브로드캐스트
 * - 역할별 선택적 전송
 * - 실시간 출퇴근 알림
 * - 스케줄 변경 알림
 * - 알림 푸시 테스트
 * - 성능 테스트
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const jwt = require('jsonwebtoken');
const pool = require('../../../src/db');
const { initializeSocketServer } = require('../../../src/socket');

describe('WebSocket Broadcast Tests', () => {
  let httpServer;
  let io;
  let ownerSocket;
  let managerSocket;
  let workerSocket1;
  let workerSocket2;
  let ownerToken;
  let managerToken;
  let workerToken1;
  let workerToken2;
  let businessId;
  let ownerUserId;
  let managerUserId;
  let workerUserId1;
  let workerUserId2;

  beforeAll(async () => {
    // HTTP 서버 및 Socket.io 서버 설정
    httpServer = createServer();
    io = initializeSocketServer(httpServer, {
      corsOrigin: '*',
      pingTimeout: 5000,
      pingInterval: 1000
    });

    await new Promise((resolve) => {
      httpServer.listen(3002, resolve);
    });

    // 테스트 사용자들 생성
    const client = await pool.connect();
    try {
      // 사업장 소유자 생성
      const ownerResult = await client.query(`
        INSERT INTO users (email, password, name, phone, status)
        VALUES ('broadcast-owner@test.com', 'hash', '소유자', '010-1111-1111', 'active')
        RETURNING id
      `);
      ownerUserId = ownerResult.rows[0].id;

      // 관리자 생성
      const managerResult = await client.query(`
        INSERT INTO users (email, password, name, phone, status)
        VALUES ('broadcast-manager@test.com', 'hash', '관리자', '010-2222-2222', 'active')
        RETURNING id
      `);
      managerUserId = managerResult.rows[0].id;

      // 근로자들 생성
      const worker1Result = await client.query(`
        INSERT INTO users (email, password, name, phone, status)
        VALUES ('broadcast-worker1@test.com', 'hash', '근로자1', '010-3333-3333', 'active')
        RETURNING id
      `);
      workerUserId1 = worker1Result.rows[0].id;

      const worker2Result = await client.query(`
        INSERT INTO users (email, password, name, phone, status)
        VALUES ('broadcast-worker2@test.com', 'hash', '근로자2', '010-4444-4444', 'active')
        RETURNING id
      `);
      workerUserId2 = worker2Result.rows[0].id;

      // 사업장 생성
      const businessResult = await client.query(`
        INSERT INTO businesses (name, address, business_number, owner_id, status)
        VALUES ('브로드캐스트테스트사업장', '서울시 테스트구', '999-99-99999', $1, 'active')
        RETURNING id
      `, [ownerUserId]);
      businessId = businessResult.rows[0].id;

      // 사용자 역할 설정
      await client.query(`
        INSERT INTO user_roles (user_id, business_id, role_type, is_active, is_primary)
        VALUES
          ($1, $2, 'owner', true, true),
          ($3, $2, 'manager', true, false),
          ($4, $2, 'worker', true, false),
          ($5, $2, 'worker', true, false)
      `, [ownerUserId, businessId, managerUserId, workerUserId1, workerUserId2]);

      // JWT 토큰들 생성
      const secret = process.env.JWT_SECRET || 'test-secret';

      ownerToken = jwt.sign(
        { id: ownerUserId, email: 'broadcast-owner@test.com' },
        secret,
        { expiresIn: '1h' }
      );

      managerToken = jwt.sign(
        { id: managerUserId, email: 'broadcast-manager@test.com' },
        secret,
        { expiresIn: '1h' }
      );

      workerToken1 = jwt.sign(
        { id: workerUserId1, email: 'broadcast-worker1@test.com' },
        secret,
        { expiresIn: '1h' }
      );

      workerToken2 = jwt.sign(
        { id: workerUserId2, email: 'broadcast-worker2@test.com' },
        secret,
        { expiresIn: '1h' }
      );

    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    // 소켓 연결 정리
    [ownerSocket, managerSocket, workerSocket1, workerSocket2].forEach(socket => {
      if (socket?.connected) {
        socket.disconnect();
      }
    });

    io.close();
    httpServer.close();

    // 테스트 데이터 정리
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM user_roles WHERE business_id = $1', [businessId]);
      await client.query('DELETE FROM businesses WHERE id = $1', [businessId]);
      await client.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4)', [
        ownerUserId, managerUserId, workerUserId1, workerUserId2
      ]);
    } finally {
      client.release();
    }
  });

  beforeEach(async () => {
    // 각 테스트 전 모든 클라이언트 연결
    const connectPromises = [
      new Promise((resolve, reject) => {
        ownerSocket = Client('http://localhost:3002', {
          auth: { token: ownerToken },
          transports: ['websocket']
        });
        ownerSocket.on('connect', resolve);
        ownerSocket.on('connect_error', reject);
      }),
      new Promise((resolve, reject) => {
        managerSocket = Client('http://localhost:3002', {
          auth: { token: managerToken },
          transports: ['websocket']
        });
        managerSocket.on('connect', resolve);
        managerSocket.on('connect_error', reject);
      }),
      new Promise((resolve, reject) => {
        workerSocket1 = Client('http://localhost:3002', {
          auth: { token: workerToken1 },
          transports: ['websocket']
        });
        workerSocket1.on('connect', resolve);
        workerSocket1.on('connect_error', reject);
      }),
      new Promise((resolve, reject) => {
        workerSocket2 = Client('http://localhost:3002', {
          auth: { token: workerToken2 },
          transports: ['websocket']
        });
        workerSocket2.on('connect', resolve);
        workerSocket2.on('connect_error', reject);
      })
    ];

    await Promise.all(connectPromises);
  });

  afterEach(() => {
    // 각 테스트 후 연결 해제
    [ownerSocket, managerSocket, workerSocket1, workerSocket2].forEach(socket => {
      if (socket?.connected) {
        socket.disconnect();
      }
    });
  });

  describe('룸별 브로드캐스트 테스트', () => {
    test('사업장 전체 브로드캐스트', (done) => {
      let receivedCount = 0;
      const testMessage = { type: 'test', message: '전체 알림 테스트' };

      // 모든 클라이언트에서 메시지 수신 대기
      [managerSocket, workerSocket1, workerSocket2].forEach(socket => {
        socket.on('test:broadcast', (data) => {
          expect(data).toEqual(testMessage);
          receivedCount++;
          if (receivedCount === 3) {
            done();
          }
        });
      });

      // 소유자가 사업장 전체에 브로드캐스트
      setTimeout(() => {
        ownerSocket.emit('room:message', {
          room: `business:${businessId}`,
          message: JSON.stringify(testMessage),
          type: 'broadcast'
        });
      }, 100);
    });

    test('관리자 전용 룸 브로드캐스트', (done) => {
      let ownerReceived = false;
      let managerReceived = false;
      let workerReceived = false;

      const testMessage = { type: 'admin', message: '관리자 전용 메시지' };

      // 소유자와 관리자만 수신해야 함
      ownerSocket.on('admin:message', (data) => {
        expect(data).toEqual(testMessage);
        ownerReceived = true;
        checkCompletion();
      });

      managerSocket.on('admin:message', (data) => {
        expect(data).toEqual(testMessage);
        managerReceived = true;
        checkCompletion();
      });

      // 근로자는 수신하면 안됨
      workerSocket1.on('admin:message', () => {
        done(new Error('근로자가 관리자 메시지를 수신했습니다'));
      });

      function checkCompletion() {
        if (ownerReceived && managerReceived) {
          setTimeout(() => {
            expect(workerReceived).toBe(false);
            done();
          }, 100);
        }
      }

      // 관리자 룸에 브로드캐스트
      setTimeout(() => {
        const managerRoom = `business:${businessId}:managers`;
        io.to(managerRoom).emit('admin:message', testMessage);
      }, 100);
    });

    test('개인 룸 전용 메시지', (done) => {
      const testMessage = { type: 'personal', message: '개인 메시지' };
      let receivedCount = 0;

      // 대상 근로자만 수신해야 함
      workerSocket1.on('personal:message', (data) => {
        expect(data).toEqual(testMessage);
        receivedCount++;
        done();
      });

      // 다른 사용자들은 수신하면 안됨
      [ownerSocket, managerSocket, workerSocket2].forEach(socket => {
        socket.on('personal:message', () => {
          done(new Error('대상이 아닌 사용자가 개인 메시지를 수신했습니다'));
        });
      });

      // 개인 룸에 메시지 전송
      setTimeout(() => {
        io.to(`user:${workerUserId1}`).emit('personal:message', testMessage);
      }, 100);
    });
  });

  describe('실시간 출퇴근 알림 테스트', () => {
    test('체크인 브로드캐스트', (done) => {
      let managerReceived = false;
      let ownerReceived = false;

      const checkInData = {
        userId: workerUserId1,
        userName: '근로자1',
        checkInTime: new Date(),
        location: { latitude: 37.5665, longitude: 126.9780 }
      };

      // 관리자들만 체크인 알림 수신
      managerSocket.on('attendance:user-checked-in', (data) => {
        expect(data.userId).toBe(workerUserId1);
        expect(data.userName).toBe('근로자1');
        managerReceived = true;
        checkCompletion();
      });

      ownerSocket.on('attendance:user-checked-in', (data) => {
        expect(data.userId).toBe(workerUserId1);
        ownerReceived = true;
        checkCompletion();
      });

      function checkCompletion() {
        if (managerReceived && ownerReceived) {
          done();
        }
      }

      // 체크인 이벤트 발생
      setTimeout(() => {
        workerSocket1.emit('attendance:checkin', {
          latitude: 37.5665,
          longitude: 126.9780,
          method: 'gps'
        });
      }, 100);
    });

    test('실시간 출근 현황 업데이트', (done) => {
      ownerSocket.on('dashboard:update', (data) => {
        expect(data.type).toBe('attendance');
        expect(data.data).toHaveProperty('totalWorkers');
        expect(data.data).toHaveProperty('working');
        expect(data.data).toHaveProperty('attendanceRate');
        done();
      });

      // 출근 현황 요청
      setTimeout(() => {
        ownerSocket.emit('attendance:live-status');
      }, 100);
    });
  });

  describe('스케줄 변경 알림 테스트', () => {
    test('스케줄 생성 알림', (done) => {
      const scheduleData = {
        userId: workerUserId1,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 내일
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000), // 8시간 후
        shiftType: 'regular'
      };

      // 대상 근로자가 스케줄 알림 수신
      workerSocket1.on('schedule:new', (data) => {
        expect(data.scheduleId).toBeDefined();
        expect(data.createdBy).toBe('소유자');
        done();
      });

      // 스케줄 생성
      setTimeout(() => {
        ownerSocket.emit('schedule:create', scheduleData);
      }, 100);
    });

    test('교대 요청 알림', (done) => {
      let targetReceived = false;
      let managerReceived = false;

      const shiftRequestData = {
        scheduleId: 'test-schedule-123',
        targetUserId: workerUserId2,
        reason: '개인 사유'
      };

      // 대상 근로자 알림 수신
      workerSocket2.on('schedule:shift-requested', (data) => {
        expect(data.fromUser).toBe('근로자1');
        expect(data.requestId).toBeDefined();
        targetReceived = true;
        checkCompletion();
      });

      // 관리자 알림 수신
      managerSocket.on('schedule:shift-request-pending', (data) => {
        expect(data.fromUser).toBe('근로자1');
        managerReceived = true;
        checkCompletion();
      });

      function checkCompletion() {
        if (targetReceived && managerReceived) {
          done();
        }
      }

      // 교대 요청
      setTimeout(() => {
        workerSocket1.emit('schedule:shift-request', shiftRequestData);
      }, 100);
    });
  });

  describe('알림 푸시 테스트', () => {
    test('개인 알림 전송', (done) => {
      const notificationData = {
        recipientId: workerUserId1,
        type: 'system',
        title: '테스트 알림',
        message: '알림 푸시 테스트입니다.',
        priority: 'normal'
      };

      // 대상자만 알림 수신
      workerSocket1.on('notification:new', (data) => {
        expect(data.title).toBe('테스트 알림');
        expect(data.message).toBe('알림 푸시 테스트입니다.');
        expect(data.senderName).toBe('소유자');
        done();
      });

      // 다른 사용자는 수신하면 안됨
      workerSocket2.on('notification:new', () => {
        done(new Error('대상이 아닌 사용자가 알림을 수신했습니다'));
      });

      // 알림 전송
      setTimeout(() => {
        ownerSocket.emit('notification:send', notificationData);
      }, 100);
    });

    test('긴급 알림 푸시', (done) => {
      const urgentNotification = {
        recipientId: workerUserId1,
        type: 'system',
        title: '긴급 알림',
        message: '긴급 상황입니다.',
        priority: 'urgent'
      };

      // 일반 알림과 푸시 알림 모두 수신
      let normalReceived = false;
      let pushReceived = false;

      workerSocket1.on('notification:new', (data) => {
        expect(data.priority).toBe('urgent');
        normalReceived = true;
        checkCompletion();
      });

      workerSocket1.on('notification:push', (data) => {
        expect(data.title).toBe('긴급 알림');
        expect(data.requireInteraction).toBe(true);
        pushReceived = true;
        checkCompletion();
      });

      function checkCompletion() {
        if (normalReceived && pushReceived) {
          done();
        }
      }

      // 긴급 알림 전송
      setTimeout(() => {
        ownerSocket.emit('notification:send', urgentNotification);
      }, 100);
    });

    test('읽음 상태 동기화', (done) => {
      const notificationId = 'test-notification-123';

      // 다른 기기에서 읽음 상태 동기화 수신
      workerSocket2.on('notification:read-sync', (data) => {
        expect(data.notificationId).toBe(notificationId);
        done();
      });

      // 한 기기에서 읽음 처리
      setTimeout(() => {
        workerSocket1.emit('notification:read', { notificationId });
      }, 100);
    });
  });

  describe('성능 테스트', () => {
    test('대량 동시 브로드캐스트', (done) => {
      const messageCount = 100;
      let receivedCount = 0;

      // 메시지 수신 카운터
      workerSocket1.on('performance:test', () => {
        receivedCount++;
        if (receivedCount === messageCount) {
          done();
        }
      });

      // 대량 메시지 전송
      setTimeout(() => {
        for (let i = 0; i < messageCount; i++) {
          io.to(`user:${workerUserId1}`).emit('performance:test', {
            index: i,
            timestamp: Date.now()
          });
        }
      }, 100);
    }, 10000); // 10초 타임아웃

    test('룸 참가자 수 조회 성능', (done) => {
      const startTime = Date.now();

      ownerSocket.emit('room:users', {
        room: `business:${businessId}`
      }, (response) => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(response.success).toBe(true);
        expect(response.users).toBeDefined();
        expect(duration).toBeLessThan(1000); // 1초 이내
        done();
      });
    });

    test('연결 상태 추적 성능', (done) => {
      let statusUpdates = 0;
      const targetUpdates = 4; // 4명의 사용자

      [ownerSocket, managerSocket, workerSocket1, workerSocket2].forEach(socket => {
        socket.on('presence:user-status', () => {
          statusUpdates++;
          if (statusUpdates === targetUpdates) {
            done();
          }
        });
      });

      // 상태 변경
      setTimeout(() => {
        ownerSocket.emit('presence:status', {
          status: 'busy',
          message: '회의 중'
        });
      }, 100);
    });
  });

  describe('에러 처리 및 복구', () => {
    test('연결 해제 후 자동 정리', (done) => {
      let disconnectReceived = false;

      // 다른 사용자들이 연결 해제 알림 수신
      managerSocket.on('user:offline', (data) => {
        expect(data.userId).toBe(workerUserId1);
        expect(data.reason).toBeDefined();
        disconnectReceived = true;
        done();
      });

      // 강제 연결 해제
      setTimeout(() => {
        workerSocket1.disconnect();
      }, 100);
    });

    test('잘못된 룸 접근 시도', (done) => {
      workerSocket1.emit('room:join', {
        room: 'business:99999',
        type: 'business'
      }, (response) => {
        expect(response.success).toBe(false);
        expect(response.error).toContain('접근 권한');
        done();
      });
    });

    test('권한 없는 브로드캐스트 시도', (done) => {
      workerSocket1.emit('system:broadcast', {
        message: '권한 없는 브로드캐스트',
        priority: 'high'
      }, (response) => {
        expect(response.success).toBe(false);
        expect(response.error).toContain('권한');
        done();
      });
    });
  });
});