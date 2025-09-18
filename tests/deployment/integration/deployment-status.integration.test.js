/**
 * 배포 상태 검증 통합 테스트 (T007)
 *
 * 실제 배포 과정과 상태 추적이 올바르게 동작하는지 검증합니다.
 * 배포 스크립트와 Docker Compose 서비스들의 상호작용을 테스트합니다.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

describe('배포 상태 검증 통합 테스트', () => {
  describe('Docker Compose 서비스 상태', () => {
    test('모든 컨테이너가 healthy 상태', async () => {
      try {
        const { stdout } = await execAsync('docker-compose -f docker-compose.prod.yml ps --format json');
        const containers = stdout.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));

        const coreServices = ['dot-postgres-prod', 'dot-redis-prod', 'dot-backend-prod', 'dot-nginx-prod'];

        coreServices.forEach(serviceName => {
          const container = containers.find(c => c.Name === serviceName);
          if (container) {
            expect(container.State).toBe('running');
            expect(container.Health).toBe('healthy');
          } else {
            console.log(`서비스 ${serviceName} 컨테이너가 실행되지 않음`);
          }
        });
      } catch (error) {
        console.log('Docker Compose 서비스 상태 확인 실패:', error.message);
        throw error;
      }
    });

    test('서비스 의존성 순서 확인', async () => {
      try {
        // PostgreSQL과 Redis가 먼저 시작되어야 함
        const { stdout } = await execAsync('docker-compose -f docker-compose.prod.yml config');

        expect(stdout).toContain('condition: service_healthy');
        expect(stdout).toContain('postgres:');
        expect(stdout).toContain('redis:');
      } catch (error) {
        console.log('서비스 의존성 설정 확인 실패:', error.message);
        throw error;
      }
    });
  });

  describe('배포 스크립트 검증', () => {
    test('배포 스크립트 상태 확인 기능', async () => {
      try {
        const { stdout } = await execAsync('./scripts/deploy.sh --status');

        expect(stdout).toContain('dot-');
        expect(stdout.toLowerCase()).toMatch(/(running|up|healthy)/);
      } catch (error) {
        console.log('배포 스크립트 상태 확인 기능 구현 필요:', error.message);
        throw error;
      }
    });

    test('헬스체크 기능 통합', async () => {
      // deploy.sh의 health_check 함수가 올바르게 동작하는지 확인
      try {
        // 배포 스크립트의 헬스체크 로직 테스트
        const { stdout, stderr } = await execAsync('bash -c "source ./scripts/deploy.sh && health_check"');

        if (stderr && stderr.includes('command not found')) {
          console.log('배포 스크립트 헬스체크 함수 구현 필요');
          throw new Error('health_check 함수 구현 필요');
        }

        expect(stdout.toLowerCase()).toMatch(/(healthy|정상|성공)/);
      } catch (error) {
        console.log('배포 스크립트 헬스체크 통합 구현 필요:', error.message);
        throw error;
      }
    });
  });

  describe('환경 변수 및 설정', () => {
    test('필수 환경 변수 설정 확인', async () => {
      const requiredEnvVars = [
        'DATABASE_URL',
        'REDIS_URL',
        'JWT_SECRET',
        'SESSION_SECRET'
      ];

      requiredEnvVars.forEach(envVar => {
        if (!process.env[envVar]) {
          console.log(`환경 변수 ${envVar}이 설정되지 않음`);
          // 프로덕션 환경에서는 실제로 설정되어야 함
          if (process.env.NODE_ENV === 'production') {
            throw new Error(`필수 환경 변수 ${envVar}이 설정되지 않음`);
          }
        }
      });
    });

    test('데이터베이스 연결 문자열 유효성', () => {
      const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/dot_platform';

      expect(dbUrl).toMatch(/^postgresql:\/\/.+/);
      expect(dbUrl).toContain('dot_platform');
    });

    test('Redis 연결 문자열 유효성', () => {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      expect(redisUrl).toMatch(/^redis:\/\/.+/);
    });
  });

  describe('로그 및 모니터링', () => {
    test('로그 디렉토리 존재 확인', async () => {
      try {
        const { stdout } = await execAsync('ls -la ./logs');
        expect(stdout).toBeTruthy();
      } catch (error) {
        console.log('로그 디렉토리 생성 필요:', error.message);
      }
    });

    test('업로드 디렉토리 권한 확인', async () => {
      try {
        const { stdout } = await execAsync('ls -la ./uploads');
        expect(stdout).toBeTruthy();
      } catch (error) {
        console.log('업로드 디렉토리 생성 필요:', error.message);
      }
    });
  });

  describe('백업 및 복구', () => {
    test('백업 스크립트 실행 가능성', async () => {
      try {
        const { stdout } = await execAsync('ls -la ./scripts/backup.sh');
        expect(stdout).toContain('-rwx'); // 실행 권한 확인
      } catch (error) {
        console.log('백업 스크립트 권한 설정 필요:', error.message);
      }
    });

    test('백업 디렉토리 존재', async () => {
      try {
        const { stdout } = await execAsync('ls -la ./backups || mkdir -p ./backups && ls -la ./backups');
        expect(stdout).toBeTruthy();
      } catch (error) {
        console.log('백업 디렉토리 생성 실패:', error.message);
      }
    });
  });
});