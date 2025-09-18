/**
 * T295: WebSocket 연결 통합 테스트
 *
 * 테스트 항목:
 * - Socket.io 서버 연결/해제
 * - JWT 인증 성공/실패
 * - 자동 재연결
 * - 룸 참가/나가기
 * - 이벤트 송수신
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const jwt = require('jsonwebtoken');
const pool = require('../../../src/db');
const { initializeSocketServer } = require('../../../src/socket');

describe('WebSocket Connection Tests', () => {
  let httpServer;
  let io;
  let serverSocket;
  let clientSocket;
  let authToken;
  let userId;
  let businessId;

  beforeAll(async () => {
    // HTTP 서버 생성
    httpServer = createServer();

    // Socket.io 서버 초기화
    io = initializeSocketServer(httpServer, {
      corsOrigin: '*',
      pingTimeout: 5000,
      pingInterval: 1000
    });

    // 테스트 포트에서 서버 시작
    await new Promise((resolve) => {
      httpServer.listen(3001, resolve);
    });

    // 테스트 사용자 생성
    const client = await pool.connect();
    try {
      const userResult = await client.query(`
        INSERT INTO users (email, password, name, phone, status)
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING id
      `, [
        'sockettest@test.com',
        'hashedpassword',
        '소켓테스트',
        '010-5555-5555'
      ]);
      userId = userResult.rows[0].id;

      // 테스트 사업장 생성
      const businessResult = await client.query(`
        INSERT INTO businesses (name, address, business_number, owner_id, status)
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING id
      `, [
        '소켓테스트사업장',
        '서울시 테스트구',
        '555-55-55555',
        userId
      ]);
      businessId = businessResult.rows[0].id;

      // 사용자 역할 설정
      await client.query(`
        INSERT INTO user_roles (user_id, business_id, role_type, is_active, is_primary)
        VALUES ($1, $2, $3, true, true)
      `, [userId, businessId, 'owner']);

      // JWT 토큰 생성
      authToken = jwt.sign(
        {
          id: userId,
          email: 'sockettest@test.com',
          sessionId: 'test-session-123'
        },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );
    } finally {
      client.release();
    }

    // 서버 소켓 연결 이벤트 리스너
    io.on('connection', (socket) => {
      serverSocket = socket;
    });
  });

  afterAll(async () => {
    // 연결 정리
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }

    io.close();
    httpServer.close();

    // 테스트 데이터 정리
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM businesses WHERE id = $1', [businessId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    } finally {
      client.release();
    }
  });

  afterEach(() => {
    // 각 테스트 후 클라이언트 연결 해제
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
  });

  describe('연결 테스트', () => {
    test('유효한 토큰으로 연결 성공', (done) => {
      clientSocket = Client('http://localhost:3001', {
        auth: {
          token: authToken
        },
        transports: ['websocket']
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    test('유효하지 않은 토큰으로 연결 실패', (done) => {
      clientSocket = Client('http://localhost:3001', {
        auth: {
          token: 'invalid-token'
        },
        transports: ['websocket']
      });

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('유효하지 않은 토큰');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('연결되면 안됩니다'));
      });
    });

    test('토큰 없이 연결 실패', (done) => {
      clientSocket = Client('http://localhost:3001', {
        transports: ['websocket']
      });

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('인증 토큰이 필요');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('연결되면 안됩니다'));
      });
    });

    test('만료된 토큰으로 연결 실패', (done) => {
      const expiredToken = jwt.sign(
        { id: userId, email: 'sockettest@test.com' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1h' } // 1시간 전 만료
      );

      clientSocket = Client('http://localhost:3001', {
        auth: {
          token: expiredToken
        },
        transports: ['websocket']
      });

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('토큰이 만료');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('연결되면 안됩니다'));
      });
    });
  });

  describe('룸 참가 테스트', () => {
    beforeEach((done) => {
      // 각 테스트 전 연결 설정
      clientSocket = Client('http://localhost:3001', {
        auth: { token: authToken },
        transports: ['websocket']
      });

      clientSocket.on('connect', done);
    });

    test('연결 시 자동 룸 참가 확인', (done) => {
      clientSocket.emit('room:users', {
        room: `user:${userId}`
      }, (response) => {
        expect(response.success).toBe(true);
        expect(response.users).toBeDefined();
        expect(response.count).toBeGreaterThan(0);
        done();
      });
    });

    test('사업장 룸 참가', (done) => {
      clientSocket.emit('room:join', {
        room: `business:${businessId}`,
        type: 'business'
      }, (response) => {
        expect(response.success).toBe(true);
        expect(response.room).toBe(`business:${businessId}`);
        done();
      });
    });

    test('권한 없는 룸 참가 실패', (done) => {
      clientSocket.emit('room:join', {
        room: 'business:99999',
        type: 'business'
      }, (response) => {
        expect(response.success).toBe(false);
        expect(response.error).toContain('접근 권한');
        done();
      });
    });

    test('룸 나가기', (done) => {
      const testRoom = 'test-room';

      // 먼저 룸 참가
      clientSocket.emit('room:join', {
        room: testRoom,
        type: 'custom'
      }, (joinResponse) => {
        expect(joinResponse.success).toBe(true);

        // 룸 나가기
        clientSocket.emit('room:leave', {
          room: testRoom
        }, (leaveResponse) => {
          expect(leaveResponse.success).toBe(true);
          expect(leaveResponse.room).toBe(testRoom);
          done();
        });
      });
    });
  });

  describe('이벤트 송수신 테스트', () => {
    beforeEach((done) => {
      clientSocket = Client('http://localhost:3001', {
        auth: { token: authToken },
        transports: ['websocket']
      });

      clientSocket.on('connect', done);
    });

    test('핑-퐁 테스트', (done) => {
      clientSocket.emit('ping', (response) => {
        expect(response.timestamp).toBeDefined();
        expect(typeof response.timestamp).toBe('number');
        done();
      });
    });

    test('시스템 시간 동기화', (done) => {
      clientSocket.emit('system:time-sync', (response) => {
        expect(response.serverTime).toBeDefined();
        expect(response.timezone).toBeDefined();
        done();
      });
    });

    test('하트비트 체크', (done) => {
      clientSocket.emit('system:heartbeat', (response) => {
        expect(response.success).toBe(true);
        expect(response.timestamp).toBeDefined();
        expect(response.latency).toBeDefined();
        done();
      });
    });

    test('룸 메시지 전송', (done) => {
      const room = `user:${userId}`;
      const testMessage = '테스트 메시지';

      // 메시지 수신 리스너
      clientSocket.on('room:message', (data) => {
        expect(data.message).toBe(testMessage);
        expect(data.userId).toBe(userId);
        done();
      });

      // 메시지 전송
      clientSocket.emit('room:message', {
        room: room,
        message: testMessage,
        type: 'text'
      }, (response) => {
        expect(response.success).toBe(true);
        expect(response.messageId).toBeDefined();
      });
    });
  });

  describe('재연결 테스트', () => {
    test('연결 해제 후 자동 재연결', (done) => {
      let disconnectCount = 0;
      let reconnectCount = 0;

      clientSocket = Client('http://localhost:3001', {
        auth: { token: authToken },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionAttempts: 3
      });

      clientSocket.on('connect', () => {
        if (reconnectCount === 0) {
          // 첫 연결 후 강제 연결 해제
          clientSocket.disconnect();
        }
      });

      clientSocket.on('disconnect', () => {
        disconnectCount++;
        if (disconnectCount === 1) {
          // 재연결 시도
          clientSocket.connect();
        }
      });

      clientSocket.on('reconnect', () => {
        reconnectCount++;
        expect(reconnectCount).toBe(1);
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    test('재연결 시 룸 복구', (done) => {
      const testRoom = `business:${businessId}`;

      clientSocket = Client('http://localhost:3001', {
        auth: { token: authToken },
        transports: ['websocket']
      });

      clientSocket.on('connect', () => {
        // 룸 참가
        clientSocket.emit('room:join', {
          room: testRoom,
          type: 'business'
        }, (response) => {
          expect(response.success).toBe(true);

          // 연결 해제 후 재연결
          clientSocket.disconnect();
          setTimeout(() => {
            clientSocket.connect();
          }, 100);
        });
      });

      clientSocket.on('reconnect', () => {
        // 룸 복구 확인
        clientSocket.emit('room:users', {
          room: testRoom
        }, (response) => {
          expect(response.success).toBe(true);
          done();
        });
      });
    });
  });

  describe('권한 테스트', () => {
    let workerToken;
    let workerSocket;

    beforeAll(async () => {
      // 일반 근로자 계정 생성
      const client = await pool.connect();
      try {
        const workerResult = await client.query(`
          INSERT INTO users (email, password, name, phone, status)
          VALUES ('worker@test.com', 'hash', '근로자테스트', '010-6666-6666', 'active')
          RETURNING id
        `);
        const workerId = workerResult.rows[0].id;

        await client.query(`
          INSERT INTO user_roles (user_id, business_id, role_type, is_active)
          VALUES ($1, $2, 'worker', true)
        `, [workerId, businessId]);

        workerToken = jwt.sign(
          { id: workerId, email: 'worker@test.com' },
          process.env.JWT_SECRET || 'test-secret',
          { expiresIn: '1h' }
        );
      } finally {
        client.release();
      }
    });

    test('관리자 전용 이벤트 권한 확인', (done) => {
      workerSocket = Client('http://localhost:3001', {
        auth: { token: workerToken },
        transports: ['websocket']
      });

      workerSocket.on('connect', () => {
        // 시스템 브로드캐스트 시도 (관리자 전용)
        workerSocket.emit('system:broadcast', {
          message: '테스트 공지',
          priority: 'high'
        }, (response) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('권한');
          workerSocket.disconnect();
          done();
        });
      });
    });

    test('소유자 권한으로 시스템 브로드캐스트', (done) => {
      clientSocket = Client('http://localhost:3001', {
        auth: { token: authToken },
        transports: ['websocket']
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('system:broadcast', {
          message: '소유자 공지사항',
          priority: 'normal'
        }, (response) => {
          expect(response.success).toBe(true);
          done();
        });
      });
    });
  });

  describe('오류 처리 테스트', () => {
    beforeEach((done) => {
      clientSocket = Client('http://localhost:3001', {
        auth: { token: authToken },
        transports: ['websocket']
      });

      clientSocket.on('connect', done);
    });

    test('잘못된 이벤트 데이터 처리', (done) => {
      clientSocket.emit('room:join', {
        // room 필드 누락
        type: 'business'
      }, (response) => {
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
        done();
      });
    });

    test('존재하지 않는 사용자에게 메시지 전송', (done) => {
      clientSocket.emit('chat:direct-message', {
        toUserId: '99999',
        message: '테스트 메시지'
      }, (response) => {
        // 메시지는 전송되지만 수신자가 없음
        expect(response.success).toBe(true);
        expect(response.messageId).toBeDefined();
        done();
      });
    });

    test('에러 이벤트 수신', (done) => {
      clientSocket.on('error', (error) => {
        expect(error.message).toBeDefined();
        expect(error.timestamp).toBeDefined();
        done();
      });

      // 의도적으로 에러 발생시키기
      clientSocket.emit('invalid-event', {});
    });
  });
});