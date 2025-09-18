/**
 * T079: QR 코드 생성/검증 테스트 (RED phase)
 * 동적 QR 코드 생성 및 HMAC 서명 검증
 */

const {
  generateQRCode,
  verifyQRCode,
  createSignature,
  parseQRToken,
  isExpired
} = require('./qr');

describe('QR Code Module', () => {

  // 테스트용 비밀키
  const testSecret = 'test-secret-key-for-qr';
  process.env.QR_SECRET = testSecret;

  describe('generateQRCode', () => {
    test('사업장 ID로 QR 코드 생성', async () => {
      const businessId = 'business-123';
      const result = await generateQRCode(businessId);

      expect(result).toHaveProperty('qrCode');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresAt');

      // QR 코드는 data URL 형식
      expect(result.qrCode).toMatch(/^data:image\/png;base64,/);

      // 토큰은 base64 문자열
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(0);
    });

    test('30초 만료 시간 설정', async () => {
      const businessId = 'business-123';
      const startTime = Date.now();
      const result = await generateQRCode(businessId);

      // 만료 시간은 30초 후
      const expectedExpiry = startTime + 30000;
      expect(result.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 100);
      expect(result.expiresAt).toBeLessThanOrEqual(expectedExpiry + 100);
    });

    test('매번 다른 QR 코드 생성 (nonce 포함)', async () => {
      const businessId = 'business-123';

      const result1 = await generateQRCode(businessId);
      const result2 = await generateQRCode(businessId);

      // 같은 사업장 ID여도 다른 토큰 생성
      expect(result1.token).not.toBe(result2.token);
      expect(result1.qrCode).not.toBe(result2.qrCode);
    });

    test('빈 사업장 ID 처리', async () => {
      await expect(generateQRCode('')).rejects.toThrow('Business ID is required');
      await expect(generateQRCode(null)).rejects.toThrow('Business ID is required');
      await expect(generateQRCode(undefined)).rejects.toThrow('Business ID is required');
    });

    test('커스텀 만료 시간 설정', async () => {
      const businessId = 'business-123';
      const customExpiry = 60000; // 60초
      const startTime = Date.now();

      const result = await generateQRCode(businessId, customExpiry);

      const expectedExpiry = startTime + customExpiry;
      expect(result.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 100);
      expect(result.expiresAt).toBeLessThanOrEqual(expectedExpiry + 100);
    });
  });

  describe('verifyQRCode', () => {
    test('유효한 QR 토큰 검증', async () => {
      const businessId = 'business-123';
      const { token } = await generateQRCode(businessId);

      const result = await verifyQRCode(token);

      expect(result.valid).toBe(true);
      expect(result.businessId).toBe(businessId);
      expect(result.expired).toBe(false);
      expect(result.error).toBeUndefined();
    });

    test('만료된 토큰 거부', async () => {
      const businessId = 'business-123';
      // 1ms 만료 시간으로 즉시 만료되도록
      const { token } = await generateQRCode(businessId, 1);

      // 만료 대기
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await verifyQRCode(token);

      expect(result.valid).toBe(false);
      expect(result.expired).toBe(true);
      expect(result.error).toBe('Token expired');
    });

    test('잘못된 서명 거부', async () => {
      const businessId = 'business-123';
      const { token } = await generateQRCode(businessId);

      // 토큰 변조
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded);
      payload.businessId = 'hacked-business';
      const tamperedToken = Buffer.from(JSON.stringify(payload)).toString('base64');

      const result = await verifyQRCode(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    test('잘못된 형식의 토큰 처리', async () => {
      const invalidTokens = [
        'invalid-token',
        '',
        null,
        undefined,
        'eyJhbGciOi', // 불완전한 base64
        Buffer.from('not-json').toString('base64')
      ];

      for (const token of invalidTokens) {
        const result = await verifyQRCode(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    test('중복 사용 방지 (재사용 감지)', async () => {
      const businessId = 'business-123';
      const { token } = await generateQRCode(businessId);

      // 첫 번째 사용
      const result1 = await verifyQRCode(token);
      expect(result1.valid).toBe(true);

      // 토큰을 사용됨으로 표시 (실제로는 Redis에 저장)
      await markTokenAsUsed(token);

      // 두 번째 사용 시도
      const result2 = await verifyQRCode(token);
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe('Token already used');
    });
  });

  describe('createSignature', () => {
    test('동일한 페이로드는 동일한 서명 생성', () => {
      const payload = { businessId: 'test', timestamp: 12345 };

      const signature1 = createSignature(payload, testSecret);
      const signature2 = createSignature(payload, testSecret);

      expect(signature1).toBe(signature2);
      expect(signature1).toHaveLength(64); // SHA256 hex 길이
    });

    test('다른 페이로드는 다른 서명 생성', () => {
      const payload1 = { businessId: 'test1', timestamp: 12345 };
      const payload2 = { businessId: 'test2', timestamp: 12345 };

      const signature1 = createSignature(payload1, testSecret);
      const signature2 = createSignature(payload2, testSecret);

      expect(signature1).not.toBe(signature2);
    });

    test('다른 시크릿은 다른 서명 생성', () => {
      const payload = { businessId: 'test', timestamp: 12345 };

      const signature1 = createSignature(payload, 'secret1');
      const signature2 = createSignature(payload, 'secret2');

      expect(signature1).not.toBe(signature2);
    });
  });

  describe('parseQRToken', () => {
    test('유효한 토큰 파싱', async () => {
      const businessId = 'business-123';
      const { token } = await generateQRCode(businessId);

      const parsed = parseQRToken(token);

      expect(parsed).toHaveProperty('businessId', businessId);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('nonce');
      expect(parsed).toHaveProperty('expiresAt');
      expect(parsed).toHaveProperty('signature');
    });

    test('잘못된 토큰 파싱 실패', () => {
      expect(() => parseQRToken('invalid')).toThrow();
      expect(() => parseQRToken('')).toThrow();
      expect(() => parseQRToken(null)).toThrow();
    });
  });

  describe('isExpired', () => {
    test('만료 시간 확인', () => {
      const future = Date.now() + 10000;
      const past = Date.now() - 10000;

      expect(isExpired(future)).toBe(false);
      expect(isExpired(past)).toBe(true);
      expect(isExpired(Date.now())).toBe(false); // 현재 시간은 아직 유효
    });
  });

  describe('Performance', () => {
    test('QR 코드 생성은 적절한 시간 내에 완료', async () => {
      const businessId = 'business-123';

      // 첫 번째 생성으로 라이브러리 초기화 (warmup)
      await generateQRCode(businessId);

      // 실제 성능 측정
      const start = Date.now();
      await generateQRCode(businessId);
      const duration = Date.now() - start;

      // QR 코드 생성(이미지 변환 포함)은 복잡한 작업
      // 실제 환경에서는 캐싱으로 최적화 가능
      // 1초 이내로 완료되면 충분함
      expect(duration).toBeLessThan(1000);
    });

    test('토큰 검증은 5ms 이내', async () => {
      const businessId = 'business-123';
      const { token } = await generateQRCode(businessId);

      const start = Date.now();
      await verifyQRCode(token);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5);
    });
  });
});

// 테스트용 헬퍼 함수 (실제로는 Redis에 저장)
const usedTokens = new Set();

async function markTokenAsUsed(token) {
  usedTokens.add(token);
  // QR 모듈에서 사용할 수 있도록 export
  if (typeof global.markTokenAsUsed === 'function') {
    await global.markTokenAsUsed(token);
  }
}

// 전역으로 설정하여 QR 모듈에서 접근 가능하도록
global.usedTokens = usedTokens;