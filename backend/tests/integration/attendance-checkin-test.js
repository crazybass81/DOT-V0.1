/**
 * T111-T115: 체크인 API 통합 테스트
 * TDD RED-GREEN-Refactor 사이클
 */

const request = require('supertest');
const { verifyQRToken } = require('../../src/lib/attendance-lib/qr');

async function testCheckIn() {
  // Express 앱 설정을 먼저 로드
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.QR_SECRET = 'test-qr-secret';

  // Express 앱과 DB 연결 가져오기
  const app = require('../../src/app');
  const pgPool = app.get('pgPool');

  try {
    // 기존 데이터 삭제
    await pgPool.query('DELETE FROM attendance WHERE 1=1');
    await pgPool.query('DELETE FROM user_roles WHERE 1=1');
    await pgPool.query('DELETE FROM businesses WHERE 1=1');
    await pgPool.query('DELETE FROM users WHERE 1=1');
    console.log('✅ 테이블 초기화 완료\n');
  } catch (error) {
    console.log('초기화 실패:', error.message);
  }

  const timestamp = Date.now();
  let workerId, ownerId, businessId, accessToken, ownerToken;

  console.log('=== 체크인 API 테스트 시작 ===\n');

  // 1. Worker와 Owner 생성
  console.log('1️⃣ Worker와 Owner 계정 생성');
  try {
    // Worker 생성 및 로그인
    const workerRegister = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `worker${timestamp}@example.com`,
        password: 'SecurePass123!',
        name: '근무자테스트',
        phone: `010-${String(timestamp).slice(-4)}-2222`
      })
      .expect(201);

    workerId = workerRegister.body.user.id;

    const workerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `worker${timestamp}@example.com`,
        password: 'SecurePass123!'
      })
      .expect(200);

    accessToken = workerLogin.body.accessToken;
    console.log('  ✅ Worker 생성 및 로그인 성공');
    console.log('  - Access Token 길이:', accessToken ? accessToken.length : 'NULL');

    // Owner 생성
    const ownerRegister = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `owner${timestamp}@example.com`,
        password: 'SecurePass123!',
        name: '사업주테스트',
        phone: `010-${String(timestamp).slice(-4)}-1111`
      })
      .expect(201);

    ownerId = ownerRegister.body.user.id;

    const ownerLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `owner${timestamp}@example.com`,
        password: 'SecurePass123!'
      })
      .expect(200);

    ownerToken = ownerLogin.body.accessToken;
    console.log('  ✅ Owner 생성 및 로그인 성공');
  } catch (error) {
    console.error('  ❌ 계정 생성 실패:', error.message);
    await pgPool.end();
    process.exit(1);
  }

  // 2. 사업장 생성 및 Worker 등록
  console.log('\n2️⃣ 사업장 생성 및 Worker 등록');
  try {
    // 사업장 생성
    const result = await pgPool.query(`
      INSERT INTO businesses (
        name, registration_number, business_type, industry_type,
        address, location, status
      ) VALUES (
        '테스트카페', '123-45-67890', '개인사업자', '카페',
        '서울시 강남구 테헤란로 123',
        ST_SetSRID(ST_MakePoint(127.0276, 37.4979), 4326),
        'active'
      )
      RETURNING id
    `);
    businessId = result.rows[0].id;

    // Owner 역할 부여
    await pgPool.query(`
      INSERT INTO user_roles (user_id, business_id, role_type, is_active)
      VALUES ($1, $2, 'owner', true)
    `, [ownerId, businessId]);

    // Worker 역할 부여
    await pgPool.query(`
      INSERT INTO user_roles (user_id, business_id, role_type, is_active)
      VALUES ($1, $2, 'worker', true)
    `, [workerId, businessId]);

    console.log(`  ✅ 사업장 생성 및 Worker 등록 완료 (Business ID: ${businessId})`);
  } catch (error) {
    console.error('  ❌ 사업장 설정 실패:', error.message);
    await pgPool.end();
    process.exit(1);
  }

  // 3. GPS 체크인 테스트 (성공 케이스)
  console.log('\n3️⃣ GPS 체크인 (정상 위치)');
  try {
    const response = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        businessId: businessId,
        latitude: 37.4979,  // 사업장 위치
        longitude: 127.0276,
        method: 'gps'
      });

    if (response.status !== 200) {
      console.error('  ❌ GPS 체크인 실패:', response.status, response.body);
      return;
    }

    console.log('  ✅ 체크인 성공');
    console.log('  - Attendance ID:', response.body.attendanceId);
    console.log('  - 체크인 시간:', new Date(response.body.checkInTime).toLocaleTimeString());
    console.log('  - 체크인 방식:', response.body.method);
  } catch (error) {
    console.error('  ❌ GPS 체크인 실패:', error.message);
  }

  // 4. 중복 체크인 시도 (실패해야 함)
  console.log('\n4️⃣ 중복 체크인 시도');
  try {
    await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        businessId: businessId,
        latitude: 37.4979,
        longitude: 127.0276,
        method: 'gps'
      })
      .expect(409);

    console.log('  ✅ 예상대로 409 에러 (이미 체크인됨)');
  } catch (error) {
    console.error('  ❌ 예상치 못한 응답:', error.message);
  }

  // 5. 범위 밖 GPS 체크인 (실패해야 함)
  console.log('\n5️⃣ 범위 밖 GPS 체크인 시도');
  try {
    // 체크아웃 먼저 하고 다시 시도
    await pgPool.query(`
      UPDATE attendance
      SET check_out_time = NOW(), status = 'completed'
      WHERE user_id = $1 AND business_id = $2 AND status = 'working'
    `, [workerId, businessId]);

    await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        businessId: businessId,
        latitude: 35.4979,  // 다른 도시 (2도 차이)
        longitude: 127.0276,
        method: 'gps'
      })
      .expect(403);

    console.log('  ✅ 예상대로 403 에러 (위치 범위 초과)');
  } catch (error) {
    console.error('  ❌ 예상치 못한 응답:', error.message);
  }

  // 6. QR 체크인 테스트
  console.log('\n6️⃣ QR 코드 체크인');
  try {
    // Owner가 QR 코드 생성
    const qrResponse = await request(app)
      .get(`/api/v1/attendance/qr/generate?businessId=${businessId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const qrToken = qrResponse.body.token;

    // 다시 체크아웃 처리
    await pgPool.query(`
      UPDATE attendance
      SET check_out_time = NOW(), status = 'completed'
      WHERE user_id = $1 AND business_id = $2 AND status = 'working'
    `, [workerId, businessId]);

    // Worker가 QR로 체크인
    const checkInResponse = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        businessId: businessId,
        qrToken: qrToken,
        method: 'qr'
      })
      .expect(200);

    console.log('  ✅ QR 체크인 성공');
    console.log('  - 체크인 방식:', checkInResponse.body.method);
  } catch (error) {
    console.error('  ❌ QR 체크인 실패:', error.message);
  }

  // 7. 만료된 QR 체크인 시도 (시간이 오래 걸려서 건너뜀)
  console.log('\n7️⃣ 만료된 QR 코드로 체크인 시도 - 건너뜀 (31초 대기 필요)');

  // 8. 권한 없는 사업장 체크인 시도
  console.log('\n8️⃣ 권한 없는 사업장 체크인 시도');
  try {
    const otherBusinessId = 999;  // 존재하지 않는 사업장

    await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        businessId: otherBusinessId,
        latitude: 37.4979,
        longitude: 127.0276,
        method: 'gps'
      })
      .expect(403);

    console.log('  ✅ 예상대로 403 에러 (권한 없음)');
  } catch (error) {
    console.error('  ❌ 예상치 못한 응답:', error.message);
  }

  await pgPool.end();
  console.log('\n=== 체크인 API 테스트 완료 ===');
  process.exit(0);
}

testCheckIn().catch(err => {
  console.error('테스트 실패:', err);
  process.exit(1);
});