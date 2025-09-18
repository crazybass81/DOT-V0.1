/**
 * QR 생성 API 통합 테스트
 */

const request = require('supertest');
const { verifyQRToken } = require('../../src/lib/attendance-lib/qr');

async function testQRGenerate() {
  // Express 앱 설정을 먼저 로드
  process.env.NODE_ENV = 'test';
  process.env.QR_SECRET = 'test-qr-secret';

  // Express 앱 가져오기 (이미 pgPool이 설정됨)
  const app = require('../../src/app');

  // app에서 사용하는 것과 동일한 pgPool 가져오기
  const pgPool = app.get('pgPool');

  try {
    // 기존 데이터 삭제
    await pgPool.query('DELETE FROM user_roles WHERE 1=1');
    await pgPool.query('DELETE FROM businesses WHERE 1=1');
    await pgPool.query('DELETE FROM users WHERE 1=1');
    console.log('✅ 테이블 초기화 완료\n');
  } catch (error) {
    console.log('초기화 실패:', error.message);
  }

  // app은 이미 위에서 가져왔음

  const timestamp = Date.now();
  let userId, businessId, accessToken;

  console.log('=== QR 생성 API 테스트 시작 ===\n');

  // 1. Owner 생성 및 로그인
  console.log('1️⃣ Owner 계정 생성 및 로그인');
  try {
    // 회원가입
    const registerResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `owner${timestamp}@example.com`,
        password: 'SecurePass123!',
        name: '사업주테스트',
        phone: `010-${String(timestamp).slice(-4)}-1111`
      })
      .expect(201);

    // 회원가입 응답에서 userId 추출
    if (registerResponse.body.user && registerResponse.body.user.id) {
      userId = registerResponse.body.user.id;
      console.log('  ✅ Owner 회원가입 성공 (ID:', userId, ')');
    }

    // 로그인
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `owner${timestamp}@example.com`,
        password: 'SecurePass123!'
      })
      .expect(200);

    accessToken = loginResponse.body.accessToken;
    // 로그인 응답에서도 userId 확인 (이미 회원가입에서 받았지만)
    if (!userId && loginResponse.body.user && loginResponse.body.user.id) {
      userId = loginResponse.body.user.id;
    }
    console.log('  ✅ Owner 로그인 성공');
    console.log('  - User ID:', userId);
  } catch (error) {
    console.error('  ❌ Owner 생성 실패:', error.message);
    await pgPool.end();
    process.exit(1);
  }

  // 2. 사업장 생성
  console.log('\n2️⃣ 사업장 생성');
  try {
    // 먼저 users 테이블에 사용자가 존재하는지 확인
    const userCheck = await pgPool.query(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    );
    console.log('  - DB에서 사용자 확인:', userCheck.rows.length > 0 ? 'OK' : 'NOT FOUND');
    if (userCheck.rows.length === 0) {
      console.error('  ❌ Users 테이블에 사용자가 없습니다!');
      await pgPool.end();
      process.exit(1);
    }

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
    // seeker 역할은 business_id가 NULL이므로 owner는 별도로 추가 가능
    await pgPool.query(`
      INSERT INTO user_roles (user_id, business_id, role_type, is_active)
      VALUES ($1, $2, 'owner', true)
    `, [userId, businessId]);

    console.log(`  ✅ 사업장 생성 완료 (ID: ${businessId})`);
  } catch (error) {
    console.error('  ❌ 사업장 생성 실패:', error.message);
    await pgPool.end();
    process.exit(1);
  }

  // 3. QR 생성 테스트 (성공 케이스)
  console.log('\n3️⃣ QR 코드 생성 (Owner)');
  try {
    const response = await request(app)
      .get(`/api/v1/attendance/qr/generate?businessId=${businessId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    console.log('  ✅ QR 코드 생성 성공');
    console.log('  - Business ID:', response.body.businessId);
    console.log('  - 만료 시간:', new Date(response.body.expiresAt).toLocaleTimeString());
    console.log('  - 토큰 길이:', response.body.token?.length, '문자');

    // 토큰 검증
    const verification = await verifyQRToken(response.body.token);
    console.log('  - 토큰 검증:', verification.valid ? '✅ 유효' : '❌ 무효');
  } catch (error) {
    console.error('  ❌ QR 생성 실패:', error.message);
  }

  // 4. 권한 없는 사용자 테스트
  console.log('\n4️⃣ 권한 없는 사용자의 QR 생성 시도');
  try {
    // Worker 역할로 변경
    await pgPool.query(`
      UPDATE user_roles
      SET role_type = 'worker'
      WHERE user_id = $1 AND business_id = $2
    `, [userId, businessId]);

    // 다시 로그인하여 새 토큰 받기
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `owner${timestamp}@example.com`,
        password: 'SecurePass123!'
      })
      .expect(200);

    const workerToken = loginResponse.body.accessToken;

    await request(app)
      .get(`/api/v1/attendance/qr/generate?businessId=${businessId}`)
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(403);

    console.log('  ✅ 예상대로 403 에러 (권한 없음)');
  } catch (error) {
    console.error('  ❌ 예상치 못한 응답:', error.message);
  }

  // 5. 인증 없이 요청
  console.log('\n5️⃣ 인증 없이 QR 생성 시도');
  try {
    await request(app)
      .get(`/api/v1/attendance/qr/generate?businessId=${businessId}`)
      .expect(401);

    console.log('  ✅ 예상대로 401 에러 (인증 필요)');
  } catch (error) {
    console.error('  ❌ 예상치 못한 응답:', error.message);
  }

  // 6. businessId 없이 요청
  console.log('\n6️⃣ businessId 없이 QR 생성 시도');
  try {
    await request(app)
      .get('/api/v1/attendance/qr/generate')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    console.log('  ✅ 예상대로 400 에러 (businessId 필수)');
  } catch (error) {
    console.error('  ❌ 예상치 못한 응답:', error.message);
  }

  await pgPool.end();
  console.log('\n=== QR 생성 API 테스트 완료 ===');
  process.exit(0);
}

testQRGenerate().catch(err => {
  console.error('테스트 실패:', err);
  process.exit(1);
});