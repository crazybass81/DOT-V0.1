/**
 * T216: documents 테이블 생성 통합 테스트 (RED Phase)
 * TDD 원칙에 따라 실패하는 테스트 먼저 작성
 * 실제 PostgreSQL 사용 (no mocks)
 */

const { expect } = require('chai');
const pool = require('../../src/config/database');

describe('Documents 테이블 통합 테스트', () => {
  beforeAll(async () => {
    // 테스트용 테이블이 없으면 마이그레이션 실행
    const checkTable = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'documents'
    `);

    if (checkTable.rows.length === 0) {
      const fs = require('fs');
      const migration = fs.readFileSync('/home/ec2-user/DOT-V0.1/backend/src/db/migrations/010_create_documents_table.sql', 'utf8');
      await pool.query(migration);
      console.log('✅ Documents table created for testing');
    }
  });

  afterAll(async () => {
    // 테스트 데이터만 정리, 테이블은 유지
    await pool.query('DELETE FROM documents WHERE owner_id >= 9999');
  });

  describe('Documents 테이블 존재 확인', () => {
    it('documents 테이블이 존재해야 한다', async () => {
      const query = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'documents'
      `;

      const result = await pool.query(query);
      expect(result.rows).to.have.length(1);
      expect(result.rows[0].table_name).to.equal('documents');
    });

    it('documents 테이블에 필수 컬럼들이 존재해야 한다', async () => {
      const query = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'documents'
        ORDER BY ordinal_position
      `;

      const result = await pool.query(query);
      const columns = result.rows;

      // 필수 컬럼들 확인
      const expectedColumns = [
        { name: 'id', type: 'integer', nullable: 'NO' },
        { name: 'owner_id', type: 'integer', nullable: 'NO' },
        { name: 'business_id', type: 'integer', nullable: 'YES' },
        { name: 'filename', type: 'character varying', nullable: 'NO' },
        { name: 'original_filename', type: 'character varying', nullable: 'NO' },
        { name: 'file_type', type: 'character varying', nullable: 'NO' },
        { name: 'file_size', type: 'integer', nullable: 'NO' },
        { name: 'storage_path', type: 'character varying', nullable: 'NO' },
        { name: 'category', type: 'character varying', nullable: 'YES' },
        { name: 'tags', type: 'jsonb', nullable: 'YES' },
        { name: 'is_public', type: 'boolean', nullable: 'YES' },
        { name: 'access_control', type: 'jsonb', nullable: 'YES' },
        { name: 'expires_at', type: 'timestamp with time zone', nullable: 'YES' },
        { name: 'created_at', type: 'timestamp with time zone', nullable: 'YES' },
        { name: 'updated_at', type: 'timestamp with time zone', nullable: 'YES' }
      ];

      expectedColumns.forEach(expectedCol => {
        const actualCol = columns.find(col => col.column_name === expectedCol.name);
        expect(actualCol, `컬럼 ${expectedCol.name}이 존재해야 함`).to.exist;
        expect(actualCol.is_nullable).to.equal(expectedCol.nullable);

        // 데이터 타입 확인 (부분 매칭)
        expect(actualCol.data_type).to.include(expectedCol.type);
      });
    });

    it('id 컬럼이 PRIMARY KEY여야 한다', async () => {
      const query = `
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND table_name = 'documents'
        AND constraint_type = 'PRIMARY KEY'
      `;

      const result = await pool.query(query);
      expect(result.rows).to.have.length(1);
    });

    it('owner_id에 FOREIGN KEY 제약조건이 있어야 한다', async () => {
      const query = `
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'documents'
        AND kcu.column_name = 'owner_id'
      `;

      const result = await pool.query(query);
      expect(result.rows).to.have.length(1);
      expect(result.rows[0].foreign_table_name).to.equal('users');
      expect(result.rows[0].foreign_column_name).to.equal('id');
    });

    it('business_id에 FOREIGN KEY 제약조건이 있어야 한다', async () => {
      const query = `
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'documents'
        AND kcu.column_name = 'business_id'
      `;

      const result = await pool.query(query);
      expect(result.rows).to.have.length(1);
      expect(result.rows[0].foreign_table_name).to.equal('businesses');
      expect(result.rows[0].foreign_column_name).to.equal('id');
    });
  });

  describe('Documents 테이블 제약조건 확인', () => {
    it('file_size에 10MB 제한 CHECK 제약조건이 있어야 한다', async () => {
      const query = `
        SELECT
          tc.constraint_name,
          cc.check_clause
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.check_constraints AS cc
          ON tc.constraint_name = cc.constraint_name
        WHERE tc.table_schema = 'public'
        AND tc.table_name = 'documents'
        AND tc.constraint_type = 'CHECK'
        AND cc.check_clause LIKE '%file_size%'
      `;

      const result = await pool.query(query);
      expect(result.rows.length).to.be.greaterThanOrEqual(1);

      // 10MB 제한 체크
      const fileSizeConstraint = result.rows.find(row =>
        row.check_clause.includes('10485760')
      );
      expect(fileSizeConstraint).to.exist;
      expect(fileSizeConstraint.check_clause).to.include('10485760'); // 10MB in bytes
    });

    it('file_type에 허용된 타입만 저장할 수 있어야 한다', async () => {
      const query = `
        SELECT
          tc.constraint_name,
          cc.check_clause
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.check_constraints AS cc
          ON tc.constraint_name = cc.constraint_name
        WHERE tc.table_schema = 'public'
        AND tc.table_name = 'documents'
        AND tc.constraint_type = 'CHECK'
        AND cc.check_clause LIKE '%file_type%'
      `;

      const result = await pool.query(query);
      expect(result.rows.length).to.be.greaterThanOrEqual(1);

      // file_type 제약조건 찾기
      const fileTypeConstraint = result.rows.find(row =>
        row.check_clause.includes('pdf') && row.check_clause.includes('jpg')
      );
      expect(fileTypeConstraint).to.exist;

      const checkClause = fileTypeConstraint.check_clause;
      expect(checkClause).to.include('pdf');
      expect(checkClause).to.include('jpg');
      expect(checkClause).to.include('jpeg');
      expect(checkClause).to.include('png');
      expect(checkClause).to.include('doc');
      expect(checkClause).to.include('docx');
    });

    it('기본값이 올바르게 설정되어야 한다', async () => {
      const query = `
        SELECT column_name, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'documents'
        AND column_default IS NOT NULL
      `;

      const result = await pool.query(query);
      const defaults = result.rows;

      // tags 기본값 확인
      const tagsDefault = defaults.find(col => col.column_name === 'tags');
      expect(tagsDefault.column_default).to.include('[]');

      // is_public 기본값 확인
      const isPublicDefault = defaults.find(col => col.column_name === 'is_public');
      expect(isPublicDefault.column_default).to.include('false');

      // access_control 기본값 확인
      const accessControlDefault = defaults.find(col => col.column_name === 'access_control');
      expect(accessControlDefault.column_default).to.include('{}');

      // expires_at 기본값 확인 (3년 후)
      const expiresAtDefault = defaults.find(col => col.column_name === 'expires_at');
      expect(expiresAtDefault.column_default).to.include('interval');
      expect(expiresAtDefault.column_default).to.include('3 years');

      // created_at, updated_at 기본값 확인
      const createdAtDefault = defaults.find(col => col.column_name === 'created_at');
      expect(createdAtDefault.column_default).to.include('now()');

      const updatedAtDefault = defaults.find(col => col.column_name === 'updated_at');
      expect(updatedAtDefault.column_default).to.include('now()');
    });
  });

  describe('Documents 테이블 데이터 삽입/조회 테스트', () => {
    beforeEach(async () => {
      // 테스트 사용자와 사업체 생성
      await pool.query(`
        INSERT INTO users (id, name, email, phone, password_hash, status)
        VALUES (9999, 'Test User', 'test@example.com', '010-1234-5678', 'hash', 'active')
        ON CONFLICT (id) DO NOTHING
      `);

      await pool.query(`
        INSERT INTO businesses (id, owner_id, name, registration_number, business_type, industry_type, address, phone, email, status, location, gps_radius_meters)
        VALUES (9999, 9999, 'Test Business', '123-45-67890', 'corporation', 'IT', 'Seoul', '02-1234-5678', 'test@business.com', 'active', ST_SetSRID(ST_MakePoint(127.0, 37.5), 4326), 100)
        ON CONFLICT (id) DO NOTHING
      `);
    });

    afterEach(async () => {
      // 테스트 데이터 정리
      await pool.query('DELETE FROM documents WHERE owner_id = 9999');
      await pool.query('DELETE FROM businesses WHERE id = 9999');
      await pool.query('DELETE FROM users WHERE id = 9999');
    });

    it('유효한 문서 데이터를 삽입할 수 있어야 한다', async () => {
      const insertQuery = `
        INSERT INTO documents (
          owner_id, business_id, filename, original_filename,
          file_type, file_size, storage_path, category
        ) VALUES (
          9999, 9999, 'uuid-test.pdf', 'test.pdf',
          'pdf', 1024, '/storage/documents/2024/09/uuid-test.pdf', 'contract'
        ) RETURNING id, created_at, expires_at
      `;

      const result = await pool.query(insertQuery);
      expect(result.rows).to.have.length(1);

      const document = result.rows[0];
      expect(document.id).to.be.a('number');
      expect(document.created_at).to.be.a('string');
      expect(document.expires_at).to.be.a('string');

      // expires_at이 created_at보다 약 3년 후인지 확인
      const createdAt = new Date(document.created_at);
      const expiresAt = new Date(document.expires_at);
      const diffYears = (expiresAt - createdAt) / (1000 * 60 * 60 * 24 * 365);
      expect(diffYears).to.be.approximately(3, 0.1);
    });

    it('10MB를 초과하는 파일은 삽입할 수 없어야 한다', async () => {
      const insertQuery = `
        INSERT INTO documents (
          owner_id, filename, original_filename,
          file_type, file_size, storage_path
        ) VALUES (
          9999, 'large-file.pdf', 'large.pdf',
          'pdf', 10485761, '/storage/documents/large-file.pdf'
        )
      `;

      try {
        await pool.query(insertQuery);
        expect.fail('10MB를 초과하는 파일 삽입이 성공해서는 안됨');
      } catch (error) {
        expect(error.message).to.include('check constraint');
      }
    });

    it('허용되지 않는 파일 타입은 삽입할 수 없어야 한다', async () => {
      const insertQuery = `
        INSERT INTO documents (
          owner_id, filename, original_filename,
          file_type, file_size, storage_path
        ) VALUES (
          9999, 'test.exe', 'test.exe',
          'exe', 1024, '/storage/documents/test.exe'
        )
      `;

      try {
        await pool.query(insertQuery);
        expect.fail('허용되지 않는 파일 타입 삽입이 성공해서는 안됨');
      } catch (error) {
        expect(error.message).to.include('check constraint');
      }
    });

    it('존재하지 않는 owner_id로는 삽입할 수 없어야 한다', async () => {
      const insertQuery = `
        INSERT INTO documents (
          owner_id, filename, original_filename,
          file_type, file_size, storage_path
        ) VALUES (
          99999, 'test.pdf', 'test.pdf',
          'pdf', 1024, '/storage/documents/test.pdf'
        )
      `;

      try {
        await pool.query(insertQuery);
        expect.fail('존재하지 않는 owner_id로 삽입이 성공해서는 안됨');
      } catch (error) {
        expect(error.message).to.include('foreign key constraint');
      }
    });
  });
});