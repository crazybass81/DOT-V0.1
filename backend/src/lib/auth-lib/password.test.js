/**
 * T036, T038: 비밀번호 해싱 및 검증 테스트 (RED phase)
 * Mock 사용 금지 - 실제 bcrypt 사용
 */

const { hashPassword, verifyPassword } = require('./password');

describe('Password Module', () => {
  describe('hashPassword', () => {
    test('should hash a password', async () => {
      const password = 'Test123!@#';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hash는 보통 60자
      expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash 형식
    });

    test('should generate different hashes for the same password', async () => {
      const password = 'Test123!@#';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2); // salt 때문에 다른 해시
    });

    test('should throw error for empty password', async () => {
      await expect(hashPassword('')).rejects.toThrow('Password cannot be empty');
    });

    test('should throw error for non-string password', async () => {
      await expect(hashPassword(null)).rejects.toThrow('Password must be a string');
      await expect(hashPassword(123)).rejects.toThrow('Password must be a string');
    });
  });

  describe('verifyPassword', () => {
    let testHash;

    beforeAll(async () => {
      // 실제 bcrypt로 해싱
      testHash = await hashPassword('Test123!@#');
    });

    test('should verify correct password', async () => {
      const isValid = await verifyPassword('Test123!@#', testHash);
      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const isValid = await verifyPassword('WrongPassword', testHash);
      expect(isValid).toBe(false);
    });

    test('should handle empty password', async () => {
      const isValid = await verifyPassword('', testHash);
      expect(isValid).toBe(false);
    });

    test('should return false for invalid hash format', async () => {
      const isValid = await verifyPassword('Test123!@#', 'invalid-hash');
      expect(isValid).toBe(false);
    });

    test('should be case-sensitive', async () => {
      const password = 'CaseSensitive123';
      const hash = await hashPassword(password);

      const isValid1 = await verifyPassword('CaseSensitive123', hash);
      const isValid2 = await verifyPassword('casesensitive123', hash);

      expect(isValid1).toBe(true);
      expect(isValid2).toBe(false);
    });
  });

  describe('Performance', () => {
    test('should hash password within reasonable time', async () => {
      const start = Date.now();
      await hashPassword('TestPassword123');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500); // 500ms 이내
      expect(duration).toBeGreaterThan(50); // 너무 빠르면 안전하지 않음
    });
  });
});