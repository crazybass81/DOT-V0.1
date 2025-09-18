/**
 * T127: 테스트 환경 구성 - 글로벌 정리
 * Playwright E2E 테스트 후 정리 작업
 * 테스트 데이터 정리, 연결 해제
 */

const { Pool } = require('pg');
const { createClient } = require('redis');

/**
 * 글로벌 정리 함수
 * 모든 테스트 완료 후 한 번 실행
 */
async function globalTeardown(config) {
  console.log('🧹 E2E 테스트 환경 정리 시작...');

  try {
    // 테스트 데이터 정리
    await cleanupTestData();

    // Redis 캐시 정리
    await cleanupRedisCache();

    console.log('✅ E2E 테스트 환경 정리 완료');

  } catch (error) {
    console.error('❌ E2E 테스트 환경 정리 실패:', error);
    // 정리 실패는 치명적이지 않으므로 에러를 던지지 않음
  }
}

/**
 * 테스트 데이터 정리
 * E2E 테스트에서 생성된 데이터 삭제
 */
async function cleanupTestData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    const client = await pool.connect();

    // 테스트 계정 관련 데이터 모두 삭제 (외래키 순서 고려)
    await client.query(`
      -- 문서 파일 삭제 (실제 파일은 별도 정리 필요)
      DELETE FROM documents WHERE owner_id >= 9000;

      -- 급여 명세서 삭제
      DELETE FROM pay_statements WHERE user_id >= 9000;

      -- 출근 기록 삭제
      DELETE FROM attendance WHERE user_id >= 9000;

      -- 스케줄 할당 삭제
      DELETE FROM schedule_assignments WHERE user_id >= 9000 OR schedule_id IN (
        SELECT id FROM schedules WHERE business_id IN (
          SELECT id FROM businesses WHERE owner_id >= 9000
        )
      );

      -- 스케줄 삭제
      DELETE FROM schedules WHERE business_id IN (
        SELECT id FROM businesses WHERE owner_id >= 9000
      );

      -- 사용자 역할 삭제
      DELETE FROM user_roles WHERE user_id >= 9000;

      -- 사업장 삭제
      DELETE FROM businesses WHERE owner_id >= 9000;

      -- 사용자 삭제
      DELETE FROM users WHERE id >= 9000;

      -- 에러 로그 정리 (테스트 관련만)
      DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '1 day';
    `);

    // 시퀀스 리셋 (필요한 경우)
    await client.query(`
      SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users WHERE id < 9000), 1));
      SELECT setval('businesses_id_seq', COALESCE((SELECT MAX(id) FROM businesses WHERE id < 9000), 1));
    `);

    console.log('🗑️ 테스트 데이터 정리 완료');
    client.release();

  } catch (error) {
    console.error('❌ 테스트 데이터 정리 실패:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Redis 캐시 정리
 * 테스트 관련 Redis 키 삭제
 */
async function cleanupRedisCache() {
  const redis = createClient({
    url: process.env.REDIS_URL
  });

  try {
    await redis.connect();

    // 테스트 관련 키 패턴 찾기
    const testKeys = await redis.keys('*e2e*');
    const sessionKeys = await redis.keys('session:*9000*');
    const rateLimitKeys = await redis.keys('rate-limit:*9000*');

    // 모든 테스트 키 삭제
    const allKeys = [...testKeys, ...sessionKeys, ...rateLimitKeys];
    if (allKeys.length > 0) {
      await redis.del(allKeys);
      console.log(`🗑️ Redis 캐시 정리 완료: ${allKeys.length}개 키 삭제`);
    }

  } catch (error) {
    console.error('❌ Redis 캐시 정리 실패:', error);
    throw error;
  } finally {
    await redis.disconnect();
  }
}

/**
 * 업로드된 테스트 파일 정리
 * storage 디렉토리의 테스트 파일들 삭제
 */
async function cleanupTestFiles() {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    const storageDir = path.join(__dirname, '../../backend/storage/documents');
    const files = await fs.readdir(storageDir, { withFileTypes: true });

    // 테스트 파일 패턴 (e2e, test 포함)
    const testFilePattern = /(e2e|test|9000)/i;

    for (const file of files) {
      if (file.isFile() && testFilePattern.test(file.name)) {
        const filePath = path.join(storageDir, file.name);
        await fs.unlink(filePath);
        console.log(`🗑️ 테스트 파일 삭제: ${file.name}`);
      }
    }

  } catch (error) {
    // 파일 정리 실패는 치명적이지 않음
    console.warn('⚠️ 테스트 파일 정리 실패 (무시됨):', error.message);
  }
}

/**
 * 브라우저 아티팩트 정리
 * 스크린샷, 비디오, 트레이스 파일 정리
 */
async function cleanupBrowserArtifacts() {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    const artifactsDir = path.join(__dirname, '../../test-results');

    // 7일 이상 된 아티팩트 파일 삭제
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    const cleanDirectory = async (dirPath) => {
      try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });

        for (const item of items) {
          const itemPath = path.join(dirPath, item.name);

          if (item.isDirectory()) {
            await cleanDirectory(itemPath);
          } else {
            const stat = await fs.stat(itemPath);
            if (stat.mtime.getTime() < sevenDaysAgo) {
              await fs.unlink(itemPath);
              console.log(`🗑️ 오래된 아티팩트 삭제: ${item.name}`);
            }
          }
        }
      } catch (error) {
        // 디렉토리가 없거나 접근 불가한 경우 무시
      }
    };

    await cleanDirectory(artifactsDir);

  } catch (error) {
    console.warn('⚠️ 브라우저 아티팩트 정리 실패 (무시됨):', error.message);
  }
}

/**
 * 종합 정리 함수
 * 모든 정리 작업을 순차적으로 실행
 */
async function fullCleanup() {
  console.log('🧹 전체 정리 작업 시작...');

  await cleanupTestData();
  await cleanupRedisCache();
  await cleanupTestFiles();
  await cleanupBrowserArtifacts();

  console.log('✨ 전체 정리 작업 완료');
}

// 개발용 정리 스크립트로도 사용 가능
if (require.main === module) {
  fullCleanup().catch(console.error);
}

module.exports = globalTeardown;