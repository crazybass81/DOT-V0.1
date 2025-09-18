/**
 * T063: AuthService - 인증 관련 비즈니스 로직
 *
 * 로그인, 토큰 발급, 세션 관리 등 인증 관련 서비스
 * Mock 사용 금지 - 실제 PostgreSQL과 Redis 사용
 */

const { verifyPassword } = require('../lib/auth-lib/password');
const { generateToken, verifyToken } = require('../lib/auth-lib/token');

class AuthService {
  constructor(pgPool, redisClient) {
    if (!pgPool) {
      throw new Error('PostgreSQL pool is required for AuthService');
    }
    if (!redisClient) {
      throw new Error('Redis client is required for AuthService');
    }

    this.pgPool = pgPool;
    this.redisClient = redisClient;
  }

  /**
   * 사용자 로그인
   * @param {string} email - 이메일
   * @param {string} password - 비밀번호
   * @returns {Object} 사용자 정보와 토큰
   */
  async login(email, password) {
    // 1. 사용자 조회
    const userQuery = `
      SELECT id, email, password_hash, name, phone, status, created_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
    `;

    const userResult = await this.pgPool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
    }

    const user = userResult.rows[0];

    // 2. 계정 상태 확인
    if (user.status === 'inactive') {
      throw new Error('비활성화된 계정입니다');
    }

    if (user.status === 'suspended') {
      throw new Error('정지된 계정입니다');
    }

    // 3. 비밀번호 검증
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
    }

    // 4. 사용자 역할 조회
    const rolesQuery = `
      SELECT ur.role_type, ur.business_id, b.name as business_name
      FROM user_roles ur
      LEFT JOIN businesses b ON ur.business_id = b.id
      WHERE ur.user_id = $1 AND ur.is_active = true
      ORDER BY ur.created_at DESC
    `;

    const rolesResult = await this.pgPool.query(rolesQuery, [user.id]);
    const roles = rolesResult.rows;

    // 5. JWT 토큰 생성
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      roles: roles.map(r => ({
        role: r.role_type,
        businessId: r.business_id,
        businessName: r.business_name
      }))
    };

    // 액세스 토큰 (15분)
    const accessToken = await generateToken(tokenPayload, null, '15m');

    // 리프레시 토큰 (7일)
    const refreshToken = await generateToken(
      { userId: user.id, type: 'refresh' },
      null,
      '7d'
    );

    // 6. 리프레시 토큰을 Redis에 저장
    const refreshTokenKey = `refresh_token:${user.id}`;
    const refreshTokenTTL = 604800; // 7일

    // Redis setEx는 (key, seconds, value) 순서
    await this.redisClient.setEx(
      refreshTokenKey,
      refreshTokenTTL,
      refreshToken
    );

    // 7. 마지막 로그인 시간 업데이트 (컬럼이 있는 경우만)
    try {
      await this.pgPool.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );
    } catch (err) {
      // last_login_at 컬럼이 없을 수 있음 - 무시
      console.log('last_login_at 업데이트 건너뜀');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        status: user.status,
        roles: roles
      },
      accessToken,
      refreshToken
    };
  }

  /**
   * 토큰 갱신
   * @param {string} refreshToken - 리프레시 토큰
   * @returns {Object} 새로운 액세스 토큰과 리프레시 토큰
   */
  async refreshTokens(refreshToken) {
    try {
      // 1. 리프레시 토큰 검증
      const decoded = await verifyToken(refreshToken);

      if (decoded.type !== 'refresh') {
        throw new Error('유효하지 않은 리프레시 토큰입니다');
      }

      // 2. Redis에서 저장된 토큰과 비교
      const storedToken = await this.redisClient.get(`refresh_token:${decoded.userId}`);

      if (storedToken !== refreshToken) {
        throw new Error('유효하지 않은 리프레시 토큰입니다');
      }

      // 3. 사용자 정보 조회
      const userQuery = `
        SELECT id, email, name, phone, status
        FROM users
        WHERE id = $1
      `;

      const userResult = await this.pgPool.query(userQuery, [decoded.userId]);

      if (userResult.rows.length === 0) {
        throw new Error('사용자를 찾을 수 없습니다');
      }

      const user = userResult.rows[0];

      // 계정 상태 확인
      if (user.status !== 'active') {
        throw new Error('계정이 활성 상태가 아닙니다');
      }

      // 4. 사용자 역할 조회
      const rolesQuery = `
        SELECT ur.role_type, ur.business_id, b.name as business_name
        FROM user_roles ur
        LEFT JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1 AND ur.is_active = true
      `;

      const rolesResult = await this.pgPool.query(rolesQuery, [user.id]);

      // 5. 새 토큰 발급
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        roles: rolesResult.rows.map(r => ({
          role: r.role_type,
          businessId: r.business_id,
          businessName: r.business_name
        }))
      };

      const newAccessToken = await generateToken(tokenPayload, null, '15m');
      const newRefreshToken = await generateToken(
        { userId: user.id, type: 'refresh' },
        null,
        '7d'
      );

      // 6. 새 리프레시 토큰 저장
      await this.redisClient.setEx(
        `refresh_token:${user.id}`,
        604800, // 7일
        newRefreshToken
      );

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };

    } catch (error) {
      console.error('토큰 갱신 오류:', error);

      // JWT 검증 에러인 경우 구체적인 메시지 전달
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new Error('유효하지 않은 리프레시 토큰입니다');
      }

      // 이미 정의된 에러 메시지는 그대로 전달
      if (error.message.includes('유효하지 않은') ||
          error.message.includes('사용자를 찾을 수 없습니다') ||
          error.message.includes('활성')) {
        throw error;
      }

      throw new Error('토큰 갱신에 실패했습니다');
    }
  }

  /**
   * 로그아웃
   * @param {number} userId - 사용자 ID
   */
  async logout(userId) {
    try {
      // Redis에서 세션과 리프레시 토큰 삭제
      const keysToDelete = [
        `session:${userId}`,
        `refresh_token:${userId}`
      ];

      // 사용자의 모든 세션 찾기
      const sessionKeys = await this.redisClient.keys(`session:user:${userId}:*`);
      keysToDelete.push(...sessionKeys);

      if (keysToDelete.length > 0) {
        await this.redisClient.del(keysToDelete);
      }

      return true;
    } catch (error) {
      console.error('로그아웃 오류:', error);
      throw new Error('로그아웃 처리 중 오류가 발생했습니다');
    }
  }

  /**
   * 현재 사용자 정보 조회
   * @param {number} userId - 사용자 ID
   */
  async getCurrentUser(userId) {
    try {
      const userQuery = `
        SELECT id, email, name, phone, status, created_at, last_login_at
        FROM users
        WHERE id = $1
      `;

      const userResult = await this.pgPool.query(userQuery, [userId]);

      if (userResult.rows.length === 0) {
        throw new Error('사용자를 찾을 수 없습니다');
      }

      const user = userResult.rows[0];

      // 역할 조회
      const rolesQuery = `
        SELECT ur.role_type, ur.business_id, b.name as business_name
        FROM user_roles ur
        LEFT JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1 AND ur.is_active = true
      `;

      const rolesResult = await this.pgPool.query(rolesQuery, [userId]);

      return {
        ...user,
        roles: rolesResult.rows
      };
    } catch (error) {
      console.error('사용자 조회 오류:', error);
      throw error;
    }
  }

  /**
   * 역할 전환
   * @param {number} userId - 사용자 ID
   * @param {string} roleType - 전환할 역할
   * @param {number} businessId - 사업장 ID (선택적)
   */
  async switchRole(userId, roleType, businessId = null) {
    try {
      // 해당 역할 권한 확인
      const roleQuery = `
        SELECT id, role_type, business_id
        FROM user_roles
        WHERE user_id = $1 AND role_type = $2
          AND (business_id = $3 OR ($3 IS NULL AND business_id IS NULL))
          AND is_active = true
      `;

      const roleResult = await this.pgPool.query(
        roleQuery,
        [userId, roleType, businessId]
      );

      if (roleResult.rows.length === 0) {
        throw new Error('해당 역할로 전환할 권한이 없습니다');
      }

      // 세션에 현재 역할 저장
      const sessionKey = `session:${userId}`;
      const session = await this.redisClient.get(sessionKey);

      if (session) {
        const sessionData = JSON.parse(session);
        sessionData.currentRole = {
          roleType,
          businessId
        };

        await this.redisClient.setex(
          sessionKey,
          86400 * 7, // 7일
          JSON.stringify(sessionData)
        );
      }

      return {
        success: true,
        currentRole: {
          roleType,
          businessId
        }
      };
    } catch (error) {
      console.error('역할 전환 오류:', error);
      throw error;
    }
  }
}

module.exports = AuthService;