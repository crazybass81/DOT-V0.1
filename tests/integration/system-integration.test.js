/**
 * 시스템 통합 테스트
 * DOT Platform의 전체 시스템 통합 검증
 *
 * 테스트 범위:
 * - 프론트엔드/백엔드 통합
 * - 데이터베이스 연결
 * - API 엔드포인트
 * - 인증/권한
 * - 실시간 기능
 */

const request = require('supertest');
const { app } = require('../../backend/src/app');
const { connectDB, closeDB } = require('../../backend/src/config/database');
const WebSocket = require('ws');

describe('시스템 통합 테스트', () => {
  let authToken;
  let testUser;
  let wsClient;

  // 테스트 환경 설정
  beforeAll(async () => {
    // 테스트 데이터베이스 연결
    await connectDB(process.env.TEST_DATABASE_URL);

    // 테스트 사용자 생성
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({
        businessName: 'Test Restaurant',
        ownerName: '테스트 사장',
        email: 'test@example.com',
        password: 'testpassword123',
        phone: '010-1234-5678'
      });

    testUser = response.body.user;
    authToken = response.body.token;
  });

  // 테스트 환경 정리
  afterAll(async () => {
    if (wsClient) {
      wsClient.close();
    }
    await closeDB();
  });

  describe('인증 시스템 통합', () => {
    test('사용자 등록이 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          businessName: 'Another Restaurant',
          ownerName: '다른 사장',
          email: 'another@example.com',
          password: 'password123',
          phone: '010-9876-5432'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('another@example.com');
    });

    test('로그인이 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    test('잘못된 인증 정보로 로그인이 실패한다', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('토큰 검증이 정상 작동한다', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('test@example.com');
    });
  });

  describe('직원 관리 시스템 통합', () => {
    let employeeId;

    test('직원 생성이 정상 작동한다', async () => {
      const employeeData = {
        name: '김직원',
        email: 'employee@example.com',
        phone: '010-1111-2222',
        position: '서버',
        department: '홀',
        employmentType: 'part-time',
        hourlyWage: 12000,
        hireDate: '2024-01-01'
      };

      const response = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${authToken}`)
        .send(employeeData);

      expect(response.status).toBe(201);
      expect(response.body.employee.name).toBe('김직원');
      employeeId = response.body.employee._id;
    });

    test('직원 목록 조회가 정상 작동한다', async () => {
      const response = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.employees)).toBe(true);
      expect(response.body.employees.length).toBeGreaterThan(0);
    });

    test('직원 정보 수정이 정상 작동한다', async () => {
      const response = await request(app)
        .put(`/api/v1/employees/${employeeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: '김직원수정',
          position: '주방'
        });

      expect(response.status).toBe(200);
      expect(response.body.employee.name).toBe('김직원수정');
      expect(response.body.employee.position).toBe('주방');
    });
  });

  describe('출퇴근 시스템 통합', () => {
    let attendanceId;

    test('출근 체크인이 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          location: {
            lat: 37.5665,
            lng: 126.9780
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.attendance.status).toBe('checked-in');
      attendanceId = response.body.attendance._id;
    });

    test('출퇴근 기록 조회가 정상 작동한다', async () => {
      const response = await request(app)
        .get('/api/v1/attendance')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.records)).toBe(true);
    });

    test('퇴근 체크아웃이 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/check-out')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          location: {
            lat: 37.5665,
            lng: 126.9780
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.attendance.status).toBe('checked-out');
    });
  });

  describe('스케줄 시스템 통합', () => {
    let scheduleId;

    test('스케줄 생성이 정상 작동한다', async () => {
      const scheduleData = {
        employeeId: testUser._id,
        date: '2024-09-20',
        startTime: '09:00',
        endTime: '18:00',
        shiftType: 'morning',
        isRecurring: false
      };

      const response = await request(app)
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send(scheduleData);

      expect(response.status).toBe(201);
      expect(response.body.schedule.shiftType).toBe('morning');
      scheduleId = response.body.schedule._id;
    });

    test('스케줄 조회가 정상 작동한다', async () => {
      const response = await request(app)
        .get('/api/v1/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2024-09-01',
          endDate: '2024-09-30'
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.schedules)).toBe(true);
    });

    test('스케줄 수정이 정상 작동한다', async () => {
      const response = await request(app)
        .put(`/api/v1/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shiftType: 'afternoon',
          startTime: '13:00',
          endTime: '22:00'
        });

      expect(response.status).toBe(200);
      expect(response.body.schedule.shiftType).toBe('afternoon');
    });
  });

  describe('급여 시스템 통합', () => {
    test('급여 계산이 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/payroll/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          employeeId: testUser._id,
          period: {
            start: '2024-09-01',
            end: '2024-09-30'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.payroll).toHaveProperty('baseSalary');
      expect(response.body.payroll).toHaveProperty('totalHours');
      expect(response.body.payroll).toHaveProperty('netPay');
    });

    test('급여 내역 조회가 정상 작동한다', async () => {
      const response = await request(app)
        .get('/api/v1/payroll')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          year: 2024,
          month: 9
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.payrolls)).toBe(true);
    });
  });

  describe('실시간 WebSocket 통합', () => {
    test('WebSocket 연결이 정상 작동한다', (done) => {
      wsClient = new WebSocket(`ws://localhost:${process.env.PORT || 3000}/ws`);

      wsClient.on('open', () => {
        // 인증 메시지 전송
        wsClient.send(JSON.stringify({
          type: 'auth',
          token: authToken
        }));
        done();
      });

      wsClient.on('error', (error) => {
        done(error);
      });
    });

    test('실시간 출퇴근 알림이 정상 작동한다', (done) => {
      wsClient.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'attendance-update') {
          expect(message.data).toHaveProperty('employeeId');
          expect(message.data).toHaveProperty('status');
          done();
        }
      });

      // 출근 이벤트 트리거
      request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          location: { lat: 37.5665, lng: 126.9780 }
        })
        .end(() => {});
    });
  });

  describe('파일 업로드/다운로드 통합', () => {
    test('이미지 업로드가 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/upload/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', Buffer.from('test image data'), 'profile.jpg');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('fileUrl');
    });

    test('급여명세서 다운로드가 정상 작동한다', async () => {
      const response = await request(app)
        .get('/api/v1/payroll/download')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          employeeId: testUser._id,
          year: 2024,
          month: 9
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('알림 시스템 통합', () => {
    test('이메일 알림 전송이 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to: 'test@example.com',
          subject: '테스트 알림',
          template: 'schedule-reminder',
          data: {
            employeeName: '김직원',
            shiftDate: '2024-09-20'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('SMS 알림 전송이 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/sms')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to: '010-1234-5678',
          message: '내일 오전 9시 출근입니다.',
          type: 'schedule-reminder'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('보고서 시스템 통합', () => {
    test('출근율 보고서 생성이 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/reports/attendance')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period: {
            start: '2024-09-01',
            end: '2024-09-30'
          },
          format: 'json'
        });

      expect(response.status).toBe(200);
      expect(response.body.report).toHaveProperty('totalDays');
      expect(response.body.report).toHaveProperty('attendanceRate');
    });

    test('급여 보고서 생성이 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/reports/payroll')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period: {
            start: '2024-09-01',
            end: '2024-09-30'
          },
          format: 'json'
        });

      expect(response.status).toBe(200);
      expect(response.body.report).toHaveProperty('totalPayroll');
      expect(response.body.report).toHaveProperty('averageHours');
    });
  });

  describe('데이터 백업/복원 통합', () => {
    test('데이터 백업이 정상 작동한다', async () => {
      const response = await request(app)
        .post('/api/v1/admin/backup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          includeData: ['employees', 'attendance', 'schedules', 'payroll']
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('backupId');
    });

    test('백업 목록 조회가 정상 작동한다', async () => {
      const response = await request(app)
        .get('/api/v1/admin/backups')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.backups)).toBe(true);
    });
  });

  describe('성능 및 부하 테스트', () => {
    test('대량 데이터 처리가 정상 작동한다', async () => {
      const startTime = Date.now();

      const promises = Array(100).fill().map((_, index) =>
        request(app)
          .get('/api/v1/employees')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();

      expect(responses.every(res => res.status === 200)).toBe(true);
      expect(endTime - startTime).toBeLessThan(10000); // 10초 이내
    });

    test('동시 출퇴근 처리가 정상 작동한다', async () => {
      const promises = Array(50).fill().map(() =>
        request(app)
          .post('/api/v1/attendance/check-in')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            location: { lat: 37.5665, lng: 126.9780 }
          })
      );

      const responses = await Promise.all(promises);
      const successCount = responses.filter(res => res.status === 201).length;

      expect(successCount).toBeGreaterThan(0);
    });
  });
});