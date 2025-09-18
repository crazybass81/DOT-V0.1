/**
 * T130: 테스트 헬퍼 함수 작성
 * E2E 테스트에서 공통으로 사용하는 유틸리티 함수들
 * 데이터베이스 작업, 인증, 네트워크 모킹 등
 */

const { Pool } = require('pg');
const { createClient } = require('redis');
const { testUsers, testBusinesses, testScenarios } = require('../fixtures/test-data');

/**
 * 데이터베이스 헬퍼 클래스
 */
class DatabaseHelper {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/dot_platform_test'
    });
  }

  /**
   * 데이터베이스 연결 해제
   */
  async close() {
    await this.pool.end();
  }

  /**
   * 테스트 사용자 생성
   * @param {Object} userData - 사용자 데이터
   */
  async createTestUser(userData) {
    const query = `
      INSERT INTO users (id, name, email, phone, password_hash, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        status = EXCLUDED.status
      RETURNING id
    `;

    const values = [
      userData.id,
      userData.name,
      userData.email,
      userData.phone,
      '$2b$10$dummy.hash.for.e2e.testing', // 테스트용 해시
      userData.status
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * 테스트 사업장 생성
   * @param {Object} businessData - 사업장 데이터
   */
  async createTestBusiness(businessData) {
    const query = `
      INSERT INTO businesses (
        id, owner_id, name, registration_number, business_type,
        industry_type, address, phone, email, status,
        location, gps_radius_meters
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        status = EXCLUDED.status
      RETURNING id
    `;

    const values = [
      businessData.id,
      businessData.ownerId,
      businessData.name,
      businessData.registrationNumber,
      businessData.businessType,
      businessData.industryType,
      businessData.address,
      businessData.phone,
      businessData.email,
      businessData.status,
      `POINT(${businessData.location.longitude} ${businessData.location.latitude})`,
      businessData.gpsRadiusMeters
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * 사용자 역할 할당
   * @param {number} userId - 사용자 ID
   * @param {number} businessId - 사업장 ID
   * @param {string} role - 역할
   * @param {Object} permissions - 권한 객체
   */
  async assignUserRole(userId, businessId, role, permissions = {}) {
    const query = `
      INSERT INTO user_roles (user_id, business_id, role, permissions, is_active)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, business_id) DO UPDATE SET
        role = EXCLUDED.role,
        permissions = EXCLUDED.permissions,
        is_active = EXCLUDED.is_active
    `;

    await this.pool.query(query, [userId, businessId, role, JSON.stringify(permissions), true]);
  }

  /**
   * 현재 출근 상태 설정
   * @param {number} userId - 사용자 ID
   * @param {number} businessId - 사업장 ID
   * @param {string} status - 출근 상태
   */
  async setCurrentAttendanceStatus(userId, businessId, status = 'checked_in') {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;

    const query = `
      INSERT INTO attendance (
        user_id, business_id, date, check_in_time, status, check_in_method
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, business_id, date) DO UPDATE SET
        status = EXCLUDED.status,
        check_in_time = EXCLUDED.check_in_time
    `;

    await this.pool.query(query, [userId, businessId, today, currentTime, status, 'gps']);
  }

  /**
   * 테스트 데이터 정리
   * @param {number} minId - 최소 ID (기본값: 9000)
   */
  async cleanupTestData(minId = 9000) {
    const queries = [
      `DELETE FROM documents WHERE owner_id >= ${minId}`,
      `DELETE FROM pay_statements WHERE user_id >= ${minId}`,
      `DELETE FROM attendance WHERE user_id >= ${minId}`,
      `DELETE FROM schedule_assignments WHERE user_id >= ${minId}`,
      `DELETE FROM schedules WHERE business_id >= ${minId}`,
      `DELETE FROM user_roles WHERE user_id >= ${minId}`,
      `DELETE FROM businesses WHERE owner_id >= ${minId}`,
      `DELETE FROM users WHERE id >= ${minId}`
    ];

    for (const query of queries) {
      try {
        await this.pool.query(query);
      } catch (error) {
        console.warn(`정리 쿼리 실패 (무시됨): ${query}`, error.message);
      }
    }
  }

  /**
   * 사용자 인증 토큰 생성 (테스트용)
   * @param {number} userId - 사용자 ID
   * @param {number} businessId - 사업장 ID
   * @param {string} role - 역할
   */
  async createAuthToken(userId, businessId, role) {
    // 실제 JWT 토큰 생성 로직 호출
    const authLib = require('../../../backend/src/lib/auth-lib');

    const payload = {
      userId,
      businessId,
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24시간
    };

    return authLib.generateToken(payload);
  }
}

/**
 * Redis 헬퍼 클래스
 */
class RedisHelper {
  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379/1'
    });
  }

  /**
   * Redis 연결
   */
  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  /**
   * Redis 연결 해제
   */
  async disconnect() {
    if (this.client.isOpen) {
      await this.client.disconnect();
    }
  }

  /**
   * 세션 데이터 설정
   * @param {string} sessionId - 세션 ID
   * @param {Object} sessionData - 세션 데이터
   * @param {number} ttl - TTL (초, 기본값: 24시간)
   */
  async setSession(sessionId, sessionData, ttl = 86400) {
    await this.connect();
    await this.client.setEx(`session:${sessionId}`, ttl, JSON.stringify(sessionData));
  }

  /**
   * Rate limit 설정
   * @param {string} key - Rate limit 키
   * @param {number} count - 카운트
   * @param {number} ttl - TTL (초)
   */
  async setRateLimit(key, count, ttl = 60) {
    await this.connect();
    await this.client.setEx(`rate-limit:${key}`, ttl, count.toString());
  }

  /**
   * 테스트 키 정리
   */
  async cleanupTestKeys() {
    await this.connect();
    const keys = await this.client.keys('*test*');
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }
}

/**
 * 인증 헬퍼 함수들
 */
const authHelpers = {
  /**
   * 페이지에 쿠키 설정
   * @param {Page} page - Playwright 페이지
   * @param {string} token - JWT 토큰
   */
  async setAuthCookie(page, token) {
    await page.context().addCookies([
      {
        name: 'auth-token',
        value: token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      }
    ]);
  },

  /**
   * 로컬 스토리지에 토큰 설정
   * @param {Page} page - Playwright 페이지
   * @param {string} token - JWT 토큰
   * @param {Object} userInfo - 사용자 정보
   */
  async setAuthStorage(page, token, userInfo) {
    await page.evaluate(([token, userInfo]) => {
      localStorage.setItem('auth-token', token);
      localStorage.setItem('user-info', JSON.stringify(userInfo));
    }, [token, userInfo]);
  },

  /**
   * 인증 상태 정리
   * @param {Page} page - Playwright 페이지
   */
  async clearAuth(page) {
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.removeItem('auth-token');
      localStorage.removeItem('user-info');
      sessionStorage.clear();
    });
  }
};

/**
 * 네트워크 모킹 헬퍼
 */
const networkHelpers = {
  /**
   * API 응답 모킹
   * @param {Page} page - Playwright 페이지
   * @param {string} urlPattern - URL 패턴
   * @param {Object} mockResponse - 모킹할 응답
   */
  async mockApiResponse(page, urlPattern, mockResponse) {
    await page.route(urlPattern, async route => {
      await route.fulfill({
        status: mockResponse.status || 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse.data || mockResponse)
      });
    });
  },

  /**
   * 네트워크 지연 시뮬레이션
   * @param {Page} page - Playwright 페이지
   * @param {number} delay - 지연 시간 (ms)
   */
  async simulateNetworkDelay(page, delay = 1000) {
    await page.route('**/*', async route => {
      await new Promise(resolve => setTimeout(resolve, delay));
      await route.continue();
    });
  },

  /**
   * 네트워크 오류 시뮬레이션
   * @param {Page} page - Playwright 페이지
   * @param {string} urlPattern - URL 패턴
   */
  async simulateNetworkError(page, urlPattern) {
    await page.route(urlPattern, async route => {
      await route.abort('failed');
    });
  },

  /**
   * WebSocket 메시지 시뮬레이션
   * @param {Page} page - Playwright 페이지
   * @param {string} eventType - 이벤트 타입
   * @param {Object} data - 이벤트 데이터
   */
  async simulateWebSocketMessage(page, eventType, data) {
    await page.evaluate(([eventType, data]) => {
      const event = new CustomEvent(eventType, { detail: data });
      document.dispatchEvent(event);
    }, [eventType, data]);
  }
};

/**
 * 시나리오 설정 헬퍼
 */
const scenarioHelpers = {
  /**
   * 완전한 사용자 시나리오 설정
   * @param {string} scenarioName - 시나리오 이름
   * @param {DatabaseHelper} dbHelper - 데이터베이스 헬퍼
   */
  async setupScenario(scenarioName, dbHelper) {
    const scenario = testScenarios[scenarioName];
    if (!scenario) {
      throw new Error(`알 수 없는 시나리오: ${scenarioName}`);
    }

    // 사용자 생성
    await dbHelper.createTestUser(scenario.user);

    // 사업장 생성 (있는 경우)
    if (scenario.business) {
      await dbHelper.createTestBusiness(scenario.business);
    }

    // 역할 할당 (있는 경우)
    if (scenario.role) {
      await dbHelper.assignUserRole(
        scenario.role.userId,
        scenario.role.businessId,
        scenario.role.role,
        scenario.role.permissions
      );
    }

    // 추가 사용자들 생성 (관리자/사업주 시나리오)
    if (scenario.employees) {
      for (const employee of scenario.employees) {
        await dbHelper.createTestUser(employee);
      }
    }

    return scenario;
  },

  /**
   * 로그인된 페이지 준비
   * @param {Page} page - Playwright 페이지
   * @param {string} scenarioName - 시나리오 이름
   * @param {DatabaseHelper} dbHelper - 데이터베이스 헬퍼
   */
  async setupAuthenticatedPage(page, scenarioName, dbHelper) {
    const scenario = await this.setupScenario(scenarioName, dbHelper);

    // 인증 토큰 생성
    const token = await dbHelper.createAuthToken(
      scenario.user.id,
      scenario.business?.id || null,
      scenario.role?.role || 'user'
    );

    // 인증 상태 설정
    await authHelpers.setAuthStorage(page, token, {
      id: scenario.user.id,
      name: scenario.user.name,
      email: scenario.user.email,
      role: scenario.role?.role || 'user',
      businessId: scenario.business?.id || null
    });

    return scenario;
  }
};

/**
 * 유틸리티 함수들
 */
const utils = {
  /**
   * 랜덤 문자열 생성
   * @param {number} length - 길이
   */
  randomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * 테스트 ID 생성
   */
  generateTestId() {
    return 9000 + Math.floor(Math.random() * 1000);
  },

  /**
   * 날짜 포맷팅
   * @param {Date} date - 날짜
   * @param {string} format - 포맷 ('YYYY-MM-DD', 'HH:mm:ss')
   */
  formatDate(date = new Date(), format = 'YYYY-MM-DD') {
    if (format === 'YYYY-MM-DD') {
      return date.toISOString().split('T')[0];
    } else if (format === 'HH:mm:ss') {
      return date.toTimeString().split(' ')[0];
    }
    return date.toISOString();
  },

  /**
   * 비동기 대기
   * @param {number} ms - 대기 시간 (밀리초)
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * 재시도 함수
   * @param {Function} fn - 실행할 함수
   * @param {number} maxRetries - 최대 재시도 횟수
   * @param {number} delay - 재시도 간격 (ms)
   */
  async retry(fn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries) throw error;
        console.log(`재시도 ${i + 1}/${maxRetries} - ${error.message}`);
        await this.sleep(delay);
      }
    }
  }
};

module.exports = {
  DatabaseHelper,
  RedisHelper,
  authHelpers,
  networkHelpers,
  scenarioHelpers,
  utils
};