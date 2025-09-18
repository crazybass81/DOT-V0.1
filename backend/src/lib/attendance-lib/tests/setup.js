/**
 * Jest 테스트 환경 설정
 * 실제 데이터베이스 연결 및 정리
 */

// 환경 변수 설정 (테스트용)
process.env.NODE_ENV = 'test';
process.env.DB_PORT = '5434';
process.env.REDIS_PORT = '6379';

// 테스트 타임아웃 설정
jest.setTimeout(10000);

// 전역 설정
beforeAll(async () => {
  // 필요시 DB 연결 초기화
  console.log('🧪 테스트 환경 준비 완료');
});

afterAll(async () => {
  // 필요시 DB 연결 종료
  console.log('✅ 테스트 환경 정리 완료');
});