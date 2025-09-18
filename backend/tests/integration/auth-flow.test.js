/**
 * 인증 플로우 통합 테스트
 * 전체 인증 API 엔드포인트 동작 확인
 */

const request = require('supertest');
const { Pool } = require('pg');

async function testAuthFlow() {
  const pgPool = new Pool({
    host: 'localhost',
    port: 5435,
    database: 'dot_platform_test',
    user: 'postgres',
    password: 'postgres123'
  });

  try {
    // 기존 데이터 삭제
    await pgPool.query('DELETE FROM user_roles WHERE 1=1');
    await pgPool.query('DELETE FROM users WHERE 1=1');
    console.log('✅ 테이블 초기화 완료\n');
  } catch (error) {
    console.log('초기화 실패:', error.message);
  }

  // Express 앱 가져오기
  process.env.NODE_ENV = 'test';
  const app = require('../../src/app');

  const timestamp = Date.now();
  const userData = {
    email: `authflow${timestamp}@example.com`,
    password: 'SecurePass123!',
    name: '통합테스트',
    phone: `010-${String(timestamp).slice(-4)}-9999`
  };

  let accessToken = '';
  let refreshToken = '';
  let userId = 0;

  console.log('=== 인증 플로우 통합 테스트 시작 ===\n');

  // 1. 회원가입
  console.log('1️⃣ 회원가입');
  try {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send(userData)
      .expect(201);

    userId = response.body.user.id;
    console.log(`  ✅ 회원가입 성공 (ID: ${userId})`);
  } catch (error) {
    console.error('  ❌ 회원가입 실패:', error.message);
    await pgPool.end();
    process.exit(1);
  }

  // 2. 로그인
  console.log('\n2️⃣ 로그인');
  try {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: userData.email,
        password: userData.password
      })
      .expect(200);

    accessToken = response.body.accessToken;
    refreshToken = response.body.refreshToken;
    console.log('  ✅ 로그인 성공');
    console.log('  - 액세스 토큰 발급됨');
    console.log('  - 리프레시 토큰 발급됨');
  } catch (error) {
    console.error('  ❌ 로그인 실패:', error.message);
  }

  // 3. 현재 사용자 정보 조회
  console.log('\n3️⃣ 현재 사용자 정보 조회 (GET /me)');
  try {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    console.log('  ✅ 사용자 정보 조회 성공');
    console.log('  - 이메일:', response.body.user.email);
    console.log('  - 이름:', response.body.user.name);
    console.log('  - 역할 수:', response.body.user.roles?.length || 0);
  } catch (error) {
    console.error('  ❌ 사용자 정보 조회 실패:', error.message);
  }

  // 4. 역할 목록 조회
  console.log('\n4️⃣ 역할 목록 조회 (GET /roles)');
  try {
    const response = await request(app)
      .get('/api/v1/auth/roles')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    console.log('  ✅ 역할 목록 조회 성공');
    console.log('  - 보유 역할:', response.body.roles.map(r => r.roleType).join(', '));
  } catch (error) {
    console.error('  ❌ 역할 목록 조회 실패:', error.message);
  }

  // 5. 토큰 갱신
  console.log('\n5️⃣ 토큰 갱신');
  try {
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const newAccessToken = response.body.accessToken;
    const newRefreshToken = response.body.refreshToken;

    console.log('  ✅ 토큰 갱신 성공');
    console.log('  - 새 액세스 토큰 발급됨');
    console.log('  - 새 리프레시 토큰 발급됨');

    // 갱신된 토큰 사용
    accessToken = newAccessToken;
    refreshToken = newRefreshToken;
  } catch (error) {
    console.error('  ❌ 토큰 갱신 실패:', error.message);
  }

  // 6. 갱신된 토큰으로 인증 확인
  console.log('\n6️⃣ 갱신된 토큰으로 인증 확인');
  try {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    console.log('  ✅ 갱신된 토큰 인증 성공');
  } catch (error) {
    console.error('  ❌ 갱신된 토큰 인증 실패:', error.message);
  }

  // 7. 역할 전환 시도 (provider 역할 추가 필요)
  console.log('\n7️⃣ 역할 전환 (provider로)');
  try {
    // 먼저 provider 역할 추가
    await pgPool.query(`
      INSERT INTO user_roles (user_id, role_type, is_active)
      VALUES ($1, 'provider', true)
    `, [userId]);

    const response = await request(app)
      .post('/api/v1/auth/switch-role')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ roleType: 'provider' })
      .expect(200);

    console.log('  ✅ 역할 전환 성공');
    console.log('  - 현재 역할:', response.body.currentRole.roleType);
  } catch (error) {
    console.error('  ❌ 역할 전환 실패:', error.message);
  }

  // 8. 로그아웃
  console.log('\n8️⃣ 로그아웃');
  try {
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    console.log('  ✅ 로그아웃 성공');
    console.log('  - 메시지:', response.body.message);
  } catch (error) {
    console.error('  ❌ 로그아웃 실패:', error.message);
  }

  // 9. 로그아웃 후 인증 확인 (실패해야 함)
  console.log('\n9️⃣ 로그아웃 후 인증 확인 (실패 예상)');
  try {
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    console.log('  ✅ 예상대로 인증 실패 (401)');
  } catch (error) {
    // 401이 아닌 다른 응답
    if (error.status !== 401) {
      console.error('  ❌ 예상치 못한 응답:', error.status || error.message);
    } else {
      console.log('  ✅ 예상대로 인증 실패 (401)');
    }
  }

  // 10. 잘못된 토큰 형식 테스트
  console.log('\n🔟 잘못된 토큰 형식 테스트');
  try {
    await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'InvalidTokenFormat')
      .expect(401);

    console.log('  ✅ 예상대로 401 에러');
  } catch (error) {
    console.error('  ❌ 예상치 못한 응답:', error.message);
  }

  await pgPool.end();
  console.log('\n=== 인증 플로우 통합 테스트 완료 ===');
  process.exit(0);
}

testAuthFlow().catch(err => {
  console.error('테스트 실패:', err);
  process.exit(1);
});