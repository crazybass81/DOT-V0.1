/**
 * 간단한 테스트 - 앱 실행 확인
 */

const request = require('supertest');
const app = require('../src/app');

describe('앱 기본 동작 테스트', () => {
  it('헬스체크 엔드포인트가 작동해야 함', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'healthy');
  });

  it('API 버전 정보를 반환해야 함', async () => {
    const response = await request(app)
      .get('/api/version')
      .expect(200);

    expect(response.body).toHaveProperty('version', '1.0.0');
  });
});

// 테스트 후 종료
afterAll(async () => {
  // 앱 종료 처리
  await new Promise(resolve => setTimeout(resolve, 500));
});