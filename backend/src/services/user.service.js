/**
 * T058: UserService - 사용자 관련 비즈니스 로직
 *
 * Mock 사용 금지 - 실제 PostgreSQL 연결 사용
 * 모든 쿼리는 파라미터화되어 SQL 인젝션 방지
 */

class UserService {
  /**
   * @param {Pool} pgPool - PostgreSQL 연결 풀
   * @param {RedisClient} redisClient - Redis 클라이언트
   */
  constructor(pgPool, redisClient) {
    if (!pgPool) {
      throw new Error('PostgreSQL pool is required for UserService');
    }
    if (!redisClient) {
      throw new Error('Redis client is required for UserService');
    }

    this.pgPool = pgPool;
    this.redisClient = redisClient;
  }

  /**
   * 이메일로 사용자 찾기
   * @param {string} email
   * @returns {Object|null} 사용자 정보 또는 null
   */
  async findByEmail(email) {
    try {
      const query = `
        SELECT id, email, password_hash, name, phone, status, created_at, updated_at
        FROM users
        WHERE email = $1
      `;

      const result = await this.pgPool.query(query, [email]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('사용자 이메일 조회 오류:', error);
      throw new Error('사용자 조회 중 오류가 발생했습니다');
    }
  }

  /**
   * 전화번호로 사용자 찾기
   * @param {string} phone
   * @returns {Object|null} 사용자 정보 또는 null
   */
  async findByPhone(phone) {
    try {
      const query = `
        SELECT id, email, password_hash, name, phone, status, created_at, updated_at
        FROM users
        WHERE phone = $1
      `;

      const result = await this.pgPool.query(query, [phone]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('사용자 전화번호 조회 오류:', error);
      throw new Error('사용자 조회 중 오류가 발생했습니다');
    }
  }

  /**
   * ID로 사용자 찾기
   * @param {number} userId
   * @returns {Object|null} 사용자 정보 또는 null
   */
  async findById(userId) {
    try {
      // Redis 캐시 확인
      const cacheKey = `user:${userId}`;
      const cached = await this.redisClient.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      // DB 조회
      const query = `
        SELECT id, email, name, phone, status, created_at, updated_at
        FROM users
        WHERE id = $1
      `;

      const result = await this.pgPool.query(query, [userId]);
      const user = result.rows[0];

      if (user) {
        // Redis에 캐시 (1시간)
        await this.redisClient.setEx(
          cacheKey,
          3600,
          JSON.stringify(user)
        );
      }

      return user || null;
    } catch (error) {
      console.error('사용자 ID 조회 오류:', error);
      throw new Error('사용자 조회 중 오류가 발생했습니다');
    }
  }

  /**
   * 사용자 생성 (트랜잭션 내에서 실행)
   * @param {Object} userData
   * @param {Object} client - PostgreSQL 트랜잭션 클라이언트
   * @returns {Object} 생성된 사용자 정보
   */
  async createUser(userData, client = null) {
    const { email, passwordHash, name, phone } = userData;
    const dbClient = client || this.pgPool;

    try {
      const query = `
        INSERT INTO users (email, password_hash, name, phone, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
        RETURNING id, email, name, phone, status, created_at
      `;

      const result = await dbClient.query(query, [
        email,
        passwordHash,
        name,
        phone
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('사용자 생성 오류:', error);

      // 중복 키 오류 처리
      if (error.code === '23505') {
        if (error.constraint === 'users_email_key') {
          throw new Error('이미 사용 중인 이메일입니다');
        }
        if (error.constraint === 'users_phone_key') {
          throw new Error('이미 사용 중인 전화번호입니다');
        }
      }

      throw error;
    }
  }

  /**
   * 사용자 역할 조회
   * @param {number} userId
   * @returns {Array} 사용자 역할 목록
   */
  async getUserRoles(userId) {
    try {
      const query = `
        SELECT ur.role, ur.business_id, b.name as business_name
        FROM user_roles ur
        LEFT JOIN businesses b ON ur.business_id = b.id
        WHERE ur.user_id = $1
        ORDER BY ur.created_at DESC
      `;

      const result = await this.pgPool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error('사용자 역할 조회 오류:', error);
      throw new Error('역할 조회 중 오류가 발생했습니다');
    }
  }

  /**
   * 사용자 역할 추가
   * @param {number} userId
   * @param {string} role
   * @param {number|null} businessId
   * @param {Object} client - PostgreSQL 트랜잭션 클라이언트
   */
  async addUserRole(userId, role, businessId = null, client = null) {
    const dbClient = client || this.pgPool;

    try {
      const query = `
        INSERT INTO user_roles (user_id, role, business_id, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, role, business_id) DO NOTHING
      `;

      await dbClient.query(query, [userId, role, businessId]);
    } catch (error) {
      console.error('사용자 역할 추가 오류:', error);
      throw new Error('역할 추가 중 오류가 발생했습니다');
    }
  }

  /**
   * 사용자 상태 업데이트
   * @param {number} userId
   * @param {string} status - active, inactive, suspended
   */
  async updateUserStatus(userId, status) {
    try {
      const query = `
        UPDATE users
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, status, updated_at
      `;

      const result = await this.pgPool.query(query, [status, userId]);

      // Redis 캐시 무효화
      await this.redisClient.del(`user:${userId}`);

      return result.rows[0];
    } catch (error) {
      console.error('사용자 상태 업데이트 오류:', error);
      throw new Error('상태 업데이트 중 오류가 발생했습니다');
    }
  }

  /**
   * 사용자 정보 업데이트
   * @param {number} userId
   * @param {Object} updateData
   */
  async updateUser(userId, updateData) {
    const { name, phone } = updateData;

    try {
      const query = `
        UPDATE users
        SET name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            updated_at = NOW()
        WHERE id = $3
        RETURNING id, email, name, phone, status, updated_at
      `;

      const result = await this.pgPool.query(query, [name, phone, userId]);

      // Redis 캐시 무효화
      await this.redisClient.del(`user:${userId}`);

      return result.rows[0];
    } catch (error) {
      console.error('사용자 정보 업데이트 오류:', error);

      if (error.code === '23505') {
        if (error.constraint === 'users_phone_key') {
          throw new Error('이미 사용 중인 전화번호입니다');
        }
      }

      throw error;
    }
  }

  /**
   * 비밀번호 업데이트
   * @param {number} userId
   * @param {string} passwordHash
   */
  async updatePassword(userId, passwordHash) {
    try {
      const query = `
        UPDATE users
        SET password_hash = $1, updated_at = NOW()
        WHERE id = $2
      `;

      await this.pgPool.query(query, [passwordHash, userId]);

      // 비밀번호 변경 시 모든 세션 무효화
      await this.invalidateUserSessions(userId);

      return true;
    } catch (error) {
      console.error('비밀번호 업데이트 오류:', error);
      throw new Error('비밀번호 변경 중 오류가 발생했습니다');
    }
  }

  /**
   * 사용자의 모든 세션 무효화
   * @param {number} userId
   */
  async invalidateUserSessions(userId) {
    try {
      // Redis에서 사용자의 모든 세션 키 찾기
      const keys = await this.redisClient.keys(`session:user:${userId}:*`);

      if (keys.length > 0) {
        await this.redisClient.del(keys);
      }

      return true;
    } catch (error) {
      console.error('세션 무효화 오류:', error);
      throw new Error('세션 정리 중 오류가 발생했습니다');
    }
  }
}

module.exports = UserService;