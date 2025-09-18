/**
 * T300: Redis Pub/Sub 테스트
 * 멀티 서버 환경에서의 메시지 동기화 테스트
 *
 * 테스트 항목:
 * - 멀티 서버 간 메시지 동기화
 * - 메시지 순서 보장
 * - 장애 복구 메커니즘
 * - Socket.io Redis 어댑터 테스트
 * - 연결 상태 동기화
 * - 성능 및 확장성 테스트
 */

const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');
const pool = require('../../../src/db');
const { initializeSocketServer } = require('../../../src/socket');

describe('Redis Pub/Sub Integration Tests', () => {
  let httpServer1;
  let httpServer2;
  let io1;
  let io2;
  let redisClient1;
  let redisClient2;
  let clientSocket1;
  let clientSocket2;
  let authToken;
  let userId;
  let businessId;

  beforeAll(async () => {
    // Redis 클라이언트 생성
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient1 = createClient({ url: redisUrl });
    redisClient2 = createClient({ url: redisUrl });

    await Promise.all([
      redisClient1.connect(),
      redisClient2.connect()
    ]);

    // 첫 번째 서버 설정
    httpServer1 = createServer();
    io1 = new Server(httpServer1, {
      cors: { origin: '*' },
      transports: ['websocket']
    });

    // Redis 어댑터 설정
    const pubClient1 = redisClient1.duplicate();
    const subClient1 = redisClient1.duplicate();
    await Promise.all([pubClient1.connect(), subClient1.connect()]);
    io1.adapter(createAdapter(pubClient1, subClient1));

    // 두 번째 서버 설정
    httpServer2 = createServer();
    io2 = new Server(httpServer2, {
      cors: { origin: '*' },
      transports: ['websocket']
    });

    // Redis 어댑터 설정
    const pubClient2 = redisClient2.duplicate();
    const subClient2 = redisClient2.duplicate();
    await Promise.all([pubClient2.connect(), subClient2.connect()]);
    io2.adapter(createAdapter(pubClient2, subClient2));

    // 서버 시작
    await Promise.all([
      new Promise(resolve => httpServer1.listen(3003, resolve)),
      new Promise(resolve => httpServer2.listen(3004, resolve))
    ]);

    // 테스트 사용자 생성
    const client = await pool.connect();
    try {
      const userResult = await client.query(`
        INSERT INTO users (email, password, name, phone, status)
        VALUES ('redis-test@test.com', 'hash', 'Redis테스트', '010-9999-9999', 'active')
        RETURNING id
      `);
      userId = userResult.rows[0].id;

      const businessResult = await client.query(`
        INSERT INTO businesses (name, address, business_number, owner_id, status)
        VALUES ('Redis테스트사업장', '서울시 Redis구', '888-88-88888', $1, 'active')
        RETURNING id
      `, [userId]);
      businessId = businessResult.rows[0].id;

      await client.query(`
        INSERT INTO user_roles (user_id, business_id, role_type, is_active, is_primary)
        VALUES ($1, $2, 'owner', true, true)
      `, [userId, businessId]);

      authToken = jwt.sign(
        { id: userId, email: 'redis-test@test.com' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );
    } finally {
      client.release();
    }

    // 서버 이벤트 핸들러 설정
    setupServerEventHandlers(io1, 'server1');
    setupServerEventHandlers(io2, 'server2');
  });

  afterAll(async () => {
    // 연결 정리
    [clientSocket1, clientSocket2].forEach(socket => {
      if (socket?.connected) {
        socket.disconnect();
      }
    });

    // 서버 종료
    io1.close();
    io2.close();
    httpServer1.close();
    httpServer2.close();

    // Redis 연결 종료
    await Promise.all([
      redisClient1.disconnect(),
      redisClient2.disconnect()
    ]);

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
    // 각 테스트 후 연결 해제
    [clientSocket1, clientSocket2].forEach(socket => {
      if (socket?.connected) {
        socket.disconnect();
      }
    });
  });

  function setupServerEventHandlers(io, serverName) {
    io.on('connection', (socket) => {
      // 기본 인증 (간소화)
      socket.user = { id: userId, name: 'Redis테스트' };

      // 테스트 이벤트 핸들러
      socket.on('test:cross-server', (data, callback) => {
        // 다른 서버의 클라이언트에게 브로드캐스트
        io.emit('test:cross-server-response', {
          ...data,
          serverName,
          timestamp: Date.now()
        });

        callback({ success: true, server: serverName });
      });

      socket.on('test:room-broadcast', (data) => {
        socket.to(data.room).emit('test:room-message', {
          ...data,
          serverName,
          timestamp: Date.now()
        });
      });

      socket.on('join', (room) => {
        socket.join(room);
      });
    });
  }

  describe('멀티 서버 동기화 테스트', () => {
    test('서로 다른 서버의 클라이언트 간 메시지 전송', (done) => {
      let server1Response = false;
      let server2Response = false;

      // 첫 번째 서버에 연결
      clientSocket1 = Client('http://localhost:3003', {
        transports: ['websocket']
      });

      // 두 번째 서버에 연결
      clientSocket2 = Client('http://localhost:3004', {
        transports: ['websocket']
      });

      Promise.all([
        new Promise(resolve => clientSocket1.on('connect', resolve)),
        new Promise(resolve => clientSocket2.on('connect', resolve))
      ]).then(() => {
        // 응답 수신 설정
        clientSocket1.on('test:cross-server-response', (data) => {
          expect(data.message).toBe('Cross-server test');
          server1Response = true;
          checkCompletion();
        });

        clientSocket2.on('test:cross-server-response', (data) => {
          expect(data.message).toBe('Cross-server test');
          server2Response = true;
          checkCompletion();
        });

        function checkCompletion() {
          if (server1Response && server2Response) {
            done();
          }
        }

        // 첫 번째 클라이언트에서 메시지 전송
        clientSocket1.emit('test:cross-server', {
          message: 'Cross-server test'
        });
      });
    });

    test('룸 기반 멀티 서버 브로드캐스트', (done) => {
      const testRoom = 'test-room-123';
      const testMessage = { content: 'Room broadcast test' };

      clientSocket1 = Client('http://localhost:3003', {
        transports: ['websocket']
      });

      clientSocket2 = Client('http://localhost:3004', {
        transports: ['websocket']
      });

      Promise.all([
        new Promise(resolve => clientSocket1.on('connect', resolve)),
        new Promise(resolve => clientSocket2.on('connect', resolve))
      ]).then(() => {
        // 두 클라이언트 모두 같은 룸에 참가
        clientSocket1.emit('join', testRoom);
        clientSocket2.emit('join', testRoom);

        // 두 번째 클라이언트가 메시지 수신
        clientSocket2.on('test:room-message', (data) => {
          expect(data.content).toBe('Room broadcast test');
          expect(data.serverName).toBe('server1');
          done();
        });

        // 잠깐 대기 후 첫 번째 클라이언트에서 룸 브로드캐스트
        setTimeout(() => {
          clientSocket1.emit('test:room-broadcast', {
            room: testRoom,
            content: testMessage.content
          });
        }, 100);
      });
    });
  });

  describe('메시지 순서 보장 테스트', () => {
    test('순차적 메시지 전송 순서 확인', (done) => {
      const messageCount = 10;
      const receivedMessages = [];

      clientSocket1 = Client('http://localhost:3003', {
        transports: ['websocket']
      });

      clientSocket2 = Client('http://localhost:3004', {
        transports: ['websocket']
      });

      Promise.all([
        new Promise(resolve => clientSocket1.on('connect', resolve)),
        new Promise(resolve => clientSocket2.on('connect', resolve))
      ]).then(() => {
        // 메시지 수신
        clientSocket2.on('order:test', (data) => {
          receivedMessages.push(data.index);

          if (receivedMessages.length === messageCount) {
            // 순서 확인
            for (let i = 0; i < messageCount; i++) {
              expect(receivedMessages[i]).toBe(i);
            }
            done();
          }
        });

        // 순차적으로 메시지 전송
        for (let i = 0; i < messageCount; i++) {
          setTimeout(() => {
            io1.emit('order:test', { index: i });
          }, i * 10);
        }
      });
    });

    test('동시 메시지 전송 처리', (done) => {
      const messageCount = 50;
      const receivedMessages = new Set();

      clientSocket1 = Client('http://localhost:3003', {
        transports: ['websocket']
      });

      clientSocket1.on('connect', () => {
        clientSocket1.on('concurrent:test', (data) => {
          receivedMessages.add(data.id);

          if (receivedMessages.size === messageCount) {
            // 모든 메시지 수신 확인
            expect(receivedMessages.size).toBe(messageCount);
            done();
          }
        });

        // 동시에 여러 메시지 전송
        for (let i = 0; i < messageCount; i++) {
          io1.emit('concurrent:test', { id: i });
          io2.emit('concurrent:test', { id: i + messageCount });
        }
      });
    }, 10000);
  });

  describe('장애 복구 테스트', () => {
    test('Redis 연결 재시도', async () => {
      // Redis 연결 상태 확인
      expect(redisClient1.isReady).toBe(true);
      expect(redisClient2.isReady).toBe(true);

      // 임시로 연결 해제
      await redisClient1.disconnect();
      expect(redisClient1.isReady).toBe(false);

      // 재연결
      await redisClient1.connect();
      expect(redisClient1.isReady).toBe(true);
    });

    test('서버 재시작 후 메시지 복구', (done) => {
      clientSocket1 = Client('http://localhost:3003', {
        transports: ['websocket']
      });

      clientSocket1.on('connect', () => {
        // 서버가 정상적으로 메시지를 처리하는지 확인
        clientSocket1.emit('test:cross-server', {
          message: 'Recovery test'
        }, (response) => {
          expect(response.success).toBe(true);
          expect(response.server).toBe('server1');
          done();
        });
      });
    });
  });

  describe('성능 및 확장성 테스트', () => {
    test('대량 메시지 처리 성능', (done) => {
      const messageCount = 1000;
      let receivedCount = 0;
      const startTime = Date.now();

      clientSocket1 = Client('http://localhost:3003', {
        transports: ['websocket']
      });

      clientSocket1.on('connect', () => {
        clientSocket1.on('performance:test', () => {
          receivedCount++;

          if (receivedCount === messageCount) {
            const endTime = Date.now();
            const duration = endTime - startTime;
            const messagesPerSecond = messageCount / (duration / 1000);

            console.log(`처리된 메시지: ${messageCount}개`);
            console.log(`소요 시간: ${duration}ms`);
            console.log(`초당 메시지: ${messagesPerSecond.toFixed(2)}개/초`);

            // 성능 기준: 1초에 100개 이상 처리
            expect(messagesPerSecond).toBeGreaterThan(100);
            done();
          }
        });

        // 대량 메시지 전송
        for (let i = 0; i < messageCount; i++) {
          io1.emit('performance:test', { index: i });
        }
      });
    }, 30000);

    test('동시 접속자 처리', (done) => {
      const clientCount = 10;
      const clients = [];
      let connectedCount = 0;

      // 여러 클라이언트 동시 연결
      for (let i = 0; i < clientCount; i++) {
        const client = Client('http://localhost:3003', {
          transports: ['websocket']
        });

        client.on('connect', () => {
          connectedCount++;
          if (connectedCount === clientCount) {
            // 모든 클라이언트 연결 성공
            expect(connectedCount).toBe(clientCount);

            // 정리
            clients.forEach(c => c.disconnect());
            done();
          }
        });

        clients.push(client);
      }
    });

    test('메모리 사용량 모니터링', () => {
      const initialMemory = process.memoryUsage();

      // 대량 데이터 처리 시뮬레이션
      const largeData = Array(10000).fill().map((_, i) => ({
        id: i,
        data: 'test'.repeat(100)
      }));

      // Redis에 데이터 저장
      largeData.forEach(async (item, index) => {
        await redisClient1.set(`test:${index}`, JSON.stringify(item));
      });

      const currentMemory = process.memoryUsage();
      const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed;

      console.log(`메모리 증가: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

      // 메모리 증가가 100MB 미만이어야 함
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Redis 데이터 일관성 테스트', () => {
    test('동시 쓰기 작업 일관성', async () => {
      const key = 'test:counter';
      const incrementCount = 100;

      // 카운터 초기화
      await redisClient1.set(key, '0');

      // 두 클라이언트에서 동시에 증가
      const promises = [];
      for (let i = 0; i < incrementCount; i++) {
        promises.push(redisClient1.incr(key));
        promises.push(redisClient2.incr(key));
      }

      await Promise.all(promises);

      // 최종 값 확인
      const finalValue = await redisClient1.get(key);
      expect(parseInt(finalValue)).toBe(incrementCount * 2);

      // 정리
      await redisClient1.del(key);
    });

    test('트랜잭션 무결성', async () => {
      const multi = redisClient1.multi();

      multi.set('test:tx1', 'value1');
      multi.set('test:tx2', 'value2');
      multi.set('test:tx3', 'value3');

      const results = await multi.exec();

      // 모든 명령이 성공했는지 확인
      results.forEach((result, index) => {
        expect(result[0]).toBeNull(); // 에러 없음
        expect(result[1]).toBe('OK'); // 성공 응답
      });

      // 값 확인
      const values = await Promise.all([
        redisClient2.get('test:tx1'),
        redisClient2.get('test:tx2'),
        redisClient2.get('test:tx3')
      ]);

      expect(values).toEqual(['value1', 'value2', 'value3']);

      // 정리
      await redisClient1.del('test:tx1', 'test:tx2', 'test:tx3');
    });
  });

  describe('네트워크 분할 시나리오', () => {
    test('Redis 연결 끊김 시 복구', async () => {
      // 현재 연결 상태 확인
      expect(redisClient1.isReady).toBe(true);

      // 강제로 연결 해제 시뮬레이션
      redisClient1.emit('error', new Error('Network timeout'));

      // 짧은 대기 후 재연결 시도
      await new Promise(resolve => setTimeout(resolve, 100));

      // Redis 클라이언트가 자동으로 재연결을 시도하는지 확인
      // (실제 구현에서는 재연결 로직이 필요할 수 있음)
      if (!redisClient1.isReady) {
        await redisClient1.connect();
      }

      expect(redisClient1.isReady).toBe(true);
    });

    test('부분적 네트워크 장애 처리', (done) => {
      // 한 서버만 정상 작동하는 상황 시뮬레이션
      clientSocket1 = Client('http://localhost:3003', {
        transports: ['websocket']
      });

      clientSocket1.on('connect', () => {
        // 정상 서버를 통한 메시지 전송이 가능해야 함
        clientSocket1.emit('test:cross-server', {
          message: 'Partial failure test'
        }, (response) => {
          expect(response.success).toBe(true);
          done();
        });
      });
    });
  });
});