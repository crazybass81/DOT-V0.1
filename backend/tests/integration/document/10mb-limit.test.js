/**
 * T290: Document 10MB 제한 통합 테스트
 *
 * 테스트 항목:
 * - 10MB 제한 검증
 * - 파일 타입 검증
 * - 권한 확인
 * - 업로드 성공/실패 시나리오
 */

const request = require('supertest');
const app = require('../../../src/app');
const pool = require('../../../src/db');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

describe('Document Upload 10MB Limit Tests', () => {
  let authToken;
  let userId;
  let businessId;
  let testFilesDir;

  // 테스트 파일 생성 헬퍼
  async function createTestFile(filename, sizeMB) {
    const filePath = path.join(testFilesDir, filename);
    const size = sizeMB * 1024 * 1024;
    const buffer = Buffer.alloc(size);

    // 파일에 랜덤 데이터 채우기 (실제 파일처럼)
    for (let i = 0; i < buffer.length; i += 1024) {
      crypto.randomBytes(Math.min(1024, buffer.length - i)).copy(buffer, i);
    }

    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  beforeAll(async () => {
    // 테스트 디렉토리 생성
    testFilesDir = path.join(__dirname, 'test-files');
    await fs.ensureDir(testFilesDir);

    // 테스트 사용자 생성
    const client = await pool.connect();
    try {
      // 사용자 생성
      const userResult = await client.query(`
        INSERT INTO users (email, password, name, phone)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [
        'doctest@test.com',
        'hashedpassword',
        '문서테스트',
        '010-1234-5678'
      ]);
      userId = userResult.rows[0].id;

      // 사업장 생성
      const businessResult = await client.query(`
        INSERT INTO businesses (name, address, business_number, owner_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [
        '테스트 사업장',
        '서울시 강남구',
        '123-45-67890',
        userId
      ]);
      businessId = businessResult.rows[0].id;

      // 사용자 역할 설정
      await client.query(`
        INSERT INTO user_roles (user_id, business_id, role_type)
        VALUES ($1, $2, $3)
      `, [userId, businessId, 'owner']);

      // JWT 토큰 생성 (실제로는 로그인 API를 통해 받아야 함)
      // 여기서는 테스트용 토큰 생성
      const jwt = require('jsonwebtoken');
      authToken = jwt.sign(
        { id: userId, email: 'doctest@test.com' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    // 테스트 파일 및 디렉토리 정리
    await fs.remove(testFilesDir);

    // 테스트 데이터 정리
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM documents WHERE owner_id = $1', [userId]);
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM businesses WHERE owner_id = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    } finally {
      client.release();
    }
  });

  describe('파일 크기 제한 테스트', () => {
    test('10MB 이하 파일은 성공적으로 업로드되어야 함', async () => {
      // 9MB 테스트 파일 생성
      const testFile = await createTestFile('test-9mb.pdf', 9);

      const response = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFile)
        .field('business_id', businessId)
        .field('document_type', 'contract')
        .field('description', '9MB 테스트 파일');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('documentId');
      expect(response.body.data.size).toBeLessThanOrEqual(10 * 1024 * 1024);
    });

    test('정확히 10MB 파일은 성공적으로 업로드되어야 함', async () => {
      // 정확히 10MB 테스트 파일 생성
      const testFile = await createTestFile('test-10mb.pdf', 10);

      const response = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFile)
        .field('business_id', businessId)
        .field('document_type', 'contract');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.size).toBe(10 * 1024 * 1024);
    });

    test('10MB 초과 파일은 거부되어야 함', async () => {
      // 11MB 테스트 파일 생성
      const testFile = await createTestFile('test-11mb.pdf', 11);

      const response = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFile)
        .field('business_id', businessId)
        .field('document_type', 'contract');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('FILE_TOO_LARGE');
      expect(response.body.message).toContain('10MB');
    });

    test('매우 큰 파일(50MB)도 적절히 거부되어야 함', async () => {
      // 50MB 테스트 파일 생성
      const testFile = await createTestFile('test-50mb.pdf', 50);

      const response = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFile)
        .field('business_id', businessId);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('FILE_TOO_LARGE');
    });
  });

  describe('파일 타입 검증 테스트', () => {
    test('허용된 파일 타입(pdf, jpg, png, doc, docx)은 업로드 가능', async () => {
      const allowedTypes = [
        { name: 'test.pdf', type: 'application/pdf' },
        { name: 'test.jpg', type: 'image/jpeg' },
        { name: 'test.png', type: 'image/png' },
        { name: 'test.doc', type: 'application/msword' },
        { name: 'test.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
      ];

      for (const fileInfo of allowedTypes) {
        // 1MB 테스트 파일 생성
        const testFile = await createTestFile(fileInfo.name, 1);

        const response = await request(app)
          .post('/api/v1/documents')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', testFile)
          .field('business_id', businessId);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      }
    });

    test('허용되지 않은 파일 타입은 거부되어야 함', async () => {
      const notAllowedTypes = [
        'test.exe',
        'test.zip',
        'test.mp4',
        'test.txt',
        'test.html'
      ];

      for (const filename of notAllowedTypes) {
        // 1MB 테스트 파일 생성
        const testFile = await createTestFile(filename, 1);

        const response = await request(app)
          .post('/api/v1/documents')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', testFile)
          .field('business_id', businessId);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('허용되지 않는 파일 형식');
      }
    });
  });

  describe('일괄 업로드 제한 테스트', () => {
    test('5개 파일까지는 일괄 업로드 가능', async () => {
      // 5개의 1MB 파일 생성
      const files = [];
      for (let i = 1; i <= 5; i++) {
        files.push(await createTestFile(`bulk-${i}.pdf`, 1));
      }

      const req = request(app)
        .post('/api/v1/documents/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .field('business_id', businessId);

      // 모든 파일 첨부
      for (const file of files) {
        req.attach('files', file);
      }

      const response = await req;

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.uploaded).toHaveLength(5);
      expect(response.body.data.totalFiles).toBe(5);
    });

    test('6개 파일은 일괄 업로드 거부', async () => {
      // 6개의 1MB 파일 생성
      const files = [];
      for (let i = 1; i <= 6; i++) {
        files.push(await createTestFile(`bulk-exceed-${i}.pdf`, 1));
      }

      const req = request(app)
        .post('/api/v1/documents/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .field('business_id', businessId);

      // 모든 파일 첨부
      for (const file of files) {
        req.attach('files', file);
      }

      const response = await req;

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('TOO_MANY_FILES');
      expect(response.body.message).toContain('최대 5개');
    });

    test('일괄 업로드에서도 개별 파일 10MB 제한 적용', async () => {
      // 3개 파일: 5MB, 11MB(초과), 3MB
      const files = [
        await createTestFile('bulk-5mb.pdf', 5),
        await createTestFile('bulk-11mb.pdf', 11),
        await createTestFile('bulk-3mb.pdf', 3)
      ];

      const req = request(app)
        .post('/api/v1/documents/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .field('business_id', businessId);

      for (const file of files) {
        req.attach('files', file);
      }

      const response = await req;

      // 11MB 파일 때문에 전체 요청이 실패해야 함
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('FILE_TOO_LARGE');
    });
  });

  describe('권한 검증 테스트', () => {
    test('인증되지 않은 요청은 거부', async () => {
      const testFile = await createTestFile('unauth.pdf', 1);

      const response = await request(app)
        .post('/api/v1/documents')
        .attach('file', testFile);

      expect(response.status).toBe(401);
    });

    test('다른 사업장에 업로드 시도시 거부', async () => {
      const testFile = await createTestFile('wrong-business.pdf', 1);

      // 존재하지 않는 사업장 ID
      const response = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFile)
        .field('business_id', '99999');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('권한');
    });
  });

  describe('파일 만료 테스트', () => {
    test('기본 만료 기간은 3년', async () => {
      const testFile = await createTestFile('expiry-default.pdf', 1);

      const response = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFile)
        .field('business_id', businessId);

      expect(response.status).toBe(201);

      const expiresAt = new Date(response.body.data.expiresAt);
      const now = new Date();
      const threeYearsLater = new Date(now.setFullYear(now.getFullYear() + 3));

      // 3년 후 ± 1일 범위 내
      expect(Math.abs(expiresAt - threeYearsLater)).toBeLessThan(24 * 60 * 60 * 1000);
    });

    test('커스텀 만료 날짜 설정 가능', async () => {
      const testFile = await createTestFile('expiry-custom.pdf', 1);
      const customExpiry = new Date();
      customExpiry.setMonth(customExpiry.getMonth() + 6); // 6개월 후

      const response = await request(app)
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFile)
        .field('business_id', businessId)
        .field('expires_at', customExpiry.toISOString());

      expect(response.status).toBe(201);
      expect(new Date(response.body.data.expiresAt)).toEqual(customExpiry);
    });
  });

  describe('동시성 테스트', () => {
    test('동시에 여러 파일 업로드 처리', async () => {
      // 5개의 동시 업로드 준비
      const uploads = [];
      for (let i = 1; i <= 5; i++) {
        const testFile = await createTestFile(`concurrent-${i}.pdf`, 2);
        uploads.push(
          request(app)
            .post('/api/v1/documents')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('file', testFile)
            .field('business_id', businessId)
            .field('document_type', 'test')
        );
      }

      // 동시 실행
      const responses = await Promise.all(uploads);

      // 모든 업로드가 성공해야 함
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // 각 문서는 고유한 ID를 가져야 함
      const documentIds = responses.map(r => r.body.data.documentId);
      const uniqueIds = new Set(documentIds);
      expect(uniqueIds.size).toBe(5);
    });
  });
});

describe('Document Download Tests', () => {
  let authToken;
  let documentId;
  let userId;
  let otherUserId;
  let businessId;

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      // 테스트 사용자들 생성
      const userResult = await client.query(`
        INSERT INTO users (email, password, name, phone)
        VALUES
          ('download-test@test.com', 'hash', '다운로드테스트', '010-1111-1111'),
          ('other-user@test.com', 'hash', '다른사용자', '010-2222-2222')
        RETURNING id
      `);
      userId = userResult.rows[0].id;
      otherUserId = userResult.rows[1].id;

      // 사업장 생성
      const businessResult = await client.query(`
        INSERT INTO businesses (name, address, business_number, owner_id)
        VALUES ('다운로드테스트사업장', '서울', '999-99-99999', $1)
        RETURNING id
      `, [userId]);
      businessId = businessResult.rows[0].id;

      // 테스트 문서 생성
      const docResult = await client.query(`
        INSERT INTO documents (
          filename, original_name, file_path, file_size, mime_type,
          owner_id, business_id, is_public, expires_at
        ) VALUES (
          'test-doc.pdf', '테스트문서.pdf', '/tmp/test-doc.pdf', 1048576, 'application/pdf',
          $1, $2, false, NOW() + INTERVAL '1 year'
        ) RETURNING id
      `, [userId, businessId]);
      documentId = docResult.rows[0].id;

      // JWT 토큰 생성
      const jwt = require('jsonwebtoken');
      authToken = jwt.sign(
        { id: userId, email: 'download-test@test.com' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM documents WHERE id = $1', [documentId]);
      await client.query('DELETE FROM businesses WHERE id = $1', [businessId]);
      await client.query('DELETE FROM users WHERE id IN ($1, $2)', [userId, otherUserId]);
    } finally {
      client.release();
    }
  });

  test('소유자는 자신의 문서를 다운로드할 수 있음', async () => {
    const response = await request(app)
      .get(`/api/v1/documents/${documentId}/info`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(documentId);
  });

  test('권한 없는 사용자는 비공개 문서에 접근 불가', async () => {
    // 다른 사용자의 토큰 생성
    const jwt = require('jsonwebtoken');
    const otherToken = jwt.sign(
      { id: otherUserId, email: 'other-user@test.com' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    const response = await request(app)
      .get(`/api/v1/documents/${documentId}/info`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('ACCESS_DENIED');
  });

  test('만료된 문서는 다운로드 불가', async () => {
    const client = await pool.connect();
    try {
      // 만료된 문서 생성
      const expiredDocResult = await client.query(`
        INSERT INTO documents (
          filename, original_name, file_path, file_size, mime_type,
          owner_id, expires_at
        ) VALUES (
          'expired.pdf', '만료문서.pdf', '/tmp/expired.pdf', 1024, 'application/pdf',
          $1, NOW() - INTERVAL '1 day'
        ) RETURNING id
      `, [userId]);
      const expiredDocId = expiredDocResult.rows[0].id;

      const response = await request(app)
        .get(`/api/v1/documents/${expiredDocId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(410); // Gone
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('DOCUMENT_EXPIRED');

      // 정리
      await client.query('DELETE FROM documents WHERE id = $1', [expiredDocId]);
    } finally {
      client.release();
    }
  });
});