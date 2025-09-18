/**
 * T041, T043: JWT 토큰 생성 및 검증 테스트 (RED phase)
 * Mock 사용 금지 - 실제 jsonwebtoken 사용
 */

const { generateToken, verifyToken, generateRefreshToken, decodeToken } = require('./token');

describe('Token Module', () => {
  const testSecret = 'test-secret-key-for-testing';
  const testPayload = {
    userId: 1,
    email: 'test@example.com',
    role: 'user'
  };

  describe('generateToken', () => {
    test('should generate a JWT token', async () => {
      const token = await generateToken(testPayload, testSecret);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT는 3부분으로 구성
    });

    test('should include payload in token', async () => {
      const token = await generateToken(testPayload, testSecret);
      const decoded = await verifyToken(token, testSecret);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
    });

    test('should set expiration time', async () => {
      const token = await generateToken(testPayload, testSecret, '1h');
      const decoded = await verifyToken(token, testSecret);

      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });

    test('should use default secret from environment', async () => {
      process.env.JWT_SECRET = 'env-secret';
      const token = await generateToken(testPayload);
      const decoded = await verifyToken(token, 'env-secret');

      expect(decoded.userId).toBe(testPayload.userId);
      delete process.env.JWT_SECRET;
    });

    test('should throw error for invalid payload', async () => {
      await expect(generateToken(null, testSecret)).rejects.toThrow();
      await expect(generateToken('string', testSecret)).rejects.toThrow();
    });
  });

  describe('verifyToken', () => {
    let validToken;

    beforeAll(async () => {
      validToken = await generateToken(testPayload, testSecret);
    });

    test('should verify valid token', async () => {
      const decoded = await verifyToken(validToken, testSecret);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
    });

    test('should reject token with wrong secret', async () => {
      await expect(verifyToken(validToken, 'wrong-secret'))
        .rejects.toThrow('invalid signature');
    });

    test('should reject expired token', async () => {
      const expiredToken = await generateToken(testPayload, testSecret, '1ms');

      // 잠시 대기하여 토큰 만료
      await new Promise(resolve => setTimeout(resolve, 10));

      await expect(verifyToken(expiredToken, testSecret))
        .rejects.toThrow('jwt expired');
    });

    test('should reject malformed token', async () => {
      await expect(verifyToken('invalid.token.here', testSecret))
        .rejects.toThrow();
    });

    test('should reject empty token', async () => {
      await expect(verifyToken('', testSecret))
        .rejects.toThrow('Token is required');
    });
  });

  describe('generateRefreshToken', () => {
    test('should generate refresh token with longer expiry', async () => {
      const refreshToken = await generateRefreshToken(testPayload, testSecret);
      const decoded = await verifyToken(refreshToken, testSecret);

      const expiryTime = decoded.exp - decoded.iat;
      expect(expiryTime).toBeGreaterThan(86400); // > 1 day
    });

    test('should include refresh token type', async () => {
      const refreshToken = await generateRefreshToken(testPayload, testSecret);
      const decoded = await verifyToken(refreshToken, testSecret);

      expect(decoded.type).toBe('refresh');
    });
  });

  describe('decodeToken', () => {
    test('should decode token without verification', async () => {
      const token = await generateToken(testPayload, testSecret);
      const decoded = decodeToken(token);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
    });

    test('should decode expired token', async () => {
      const expiredToken = await generateToken(testPayload, testSecret, '1ms');
      await new Promise(resolve => setTimeout(resolve, 10));

      const decoded = decodeToken(expiredToken);
      expect(decoded.userId).toBe(testPayload.userId);
    });

    test('should return null for invalid token', () => {
      const decoded = decodeToken('invalid.token');
      expect(decoded).toBeNull();
    });
  });

  describe('Token Security', () => {
    test('should not expose secret in token', async () => {
      const token = await generateToken(testPayload, testSecret);
      expect(token).not.toContain(testSecret);
    });

    test('should generate different tokens for same payload', async () => {
      const token1 = await generateToken(testPayload, testSecret);

      // JWT는 1초 단위로 iat를 생성하므로 1초 대기 필요
      await new Promise(resolve => setTimeout(resolve, 1000));

      const token2 = await generateToken(testPayload, testSecret);
      expect(token1).not.toBe(token2); // iat 때문에 다름
    });
  });
});