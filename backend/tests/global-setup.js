/**
 * Jest 전역 설정
 * 모든 테스트 실행 전 한 번 실행됨
 */

module.exports = async () => {
  console.log('🚀 Jest 전역 설정 시작');

  // 테스트 환경 확인
  if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'test';
  }

  console.log('✅ Jest 전역 설정 완료');
};