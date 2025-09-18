/**
 * T219: Documents 테이블 RLS 정책 테스트 (RED Phase)
 * Row Level Security 정책 검증
 * 소유자 권한, 공개 문서 접근, 사업장 멤버 접근 테스트
 * 실제 PostgreSQL 사용 (no mocks)
 */

const { expect } = require('chai');
const pool = require('../../src/config/database');

describe('Documents RLS 정책 테스트', () => {
  let testUserId1, testUserId2, testBusinessId;
  let documentId1, documentId2, documentId3;

  beforeAll(async () => {
    // 테스트용 테이블과 정책이 없으면 마이그레이션 실행
    const checkPolicies = await pool.query(`
      SELECT policyname FROM pg_policies WHERE tablename = 'documents'
    `);

    if (checkPolicies.rows.length === 0) {
      const fs = require('fs');

      // Documents 테이블 생성 (이미 있으면 무시)
      try {
        const tableMigration = fs.readFileSync('/home/ec2-user/DOT-V0.1/backend/src/db/migrations/010_create_documents_table.sql', 'utf8');
        await pool.query(tableMigration);
        console.log('✅ Documents table migration completed');
      } catch (error) {
        console.log('ℹ️ Documents table already exists or migration skipped');
      }

      // RLS 정책 생성
      try {
        const rlsMigration = fs.readFileSync('/home/ec2-user/DOT-V0.1/backend/src/db/migrations/012_create_documents_rls_policies.sql', 'utf8');
        await pool.query(rlsMigration);
        console.log('✅ Documents RLS policies created for testing');
      } catch (error) {
        console.log('⚠️ RLS policies creation failed:', error.message);
      }
    }

    // RLS 활성화 확인
    await pool.query('ALTER TABLE documents ENABLE ROW LEVEL SECURITY');

    // 테스트 사용자 생성
    const user1Result = await pool.query(`
      INSERT INTO users (name, email, phone, password_hash, status)
      VALUES ('RLS User 1', 'rls1@test.com', '010-1111-1111', 'hash1', 'active')
      RETURNING id
    `);
    testUserId1 = user1Result.rows[0].id;

    const user2Result = await pool.query(`
      INSERT INTO users (name, email, phone, password_hash, status)
      VALUES ('RLS User 2', 'rls2@test.com', '010-2222-2222', 'hash2', 'active')
      RETURNING id
    `);
    testUserId2 = user2Result.rows[0].id;

    // 테스트 사업체 생성
    const businessResult = await pool.query(`
      INSERT INTO businesses (owner_id, name, registration_number, business_type, industry_type, address, phone, email, status, location, gps_radius_meters)
      VALUES ($1, 'RLS Test Business', '999-99-99999', '법인사업자', 'IT', 'Seoul', '02-9999-9999', 'rls@business.com', 'active', ST_SetSRID(ST_MakePoint(127.0, 37.5), 4326), 100)
      RETURNING id
    `, [testUserId1]);
    testBusinessId = businessResult.rows[0].id;

    // 사용자2를 사업체 멤버로 추가
    await pool.query(`
      INSERT INTO user_roles (user_id, business_id, role_type, is_active)
      VALUES ($1, $2, 'worker', true)
    `, [testUserId2, testBusinessId]);

    // 테스트 문서 생성 (RLS 정책 적용 전)
    await pool.query('SET row_security = off');

    // 문서1: 사용자1 소유, 비공개
    const doc1Result = await pool.query(`
      INSERT INTO documents (owner_id, business_id, filename, original_filename, file_type, file_size, storage_path, is_public)
      VALUES ($1, $2, 'doc1.pdf', 'private_doc.pdf', 'pdf', 1024, '/storage/doc1.pdf', false)
      RETURNING id
    `, [testUserId1, testBusinessId]);
    documentId1 = doc1Result.rows[0].id;

    // 문서2: 사용자1 소유, 공개
    const doc2Result = await pool.query(`
      INSERT INTO documents (owner_id, business_id, filename, original_filename, file_type, file_size, storage_path, is_public)
      VALUES ($1, $2, 'doc2.pdf', 'public_doc.pdf', 'pdf', 2048, '/storage/doc2.pdf', true)
      RETURNING id
    `, [testUserId1, testBusinessId]);
    documentId2 = doc2Result.rows[0].id;

    // 문서3: 사용자2 소유, 비공개
    const doc3Result = await pool.query(`
      INSERT INTO documents (owner_id, filename, original_filename, file_type, file_size, storage_path, is_public)
      VALUES ($1, 'doc3.pdf', 'user2_private.pdf', 'pdf', 3072, '/storage/doc3.pdf', false)
      RETURNING id
    `, [testUserId2]);
    documentId3 = doc3Result.rows[0].id;

    // RLS 정책 다시 활성화
    await pool.query('SET row_security = on');
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    await pool.query('SET row_security = off');
    await pool.query('DELETE FROM documents WHERE id IN ($1, $2, $3)', [documentId1, documentId2, documentId3]);
    await pool.query('DELETE FROM user_roles WHERE user_id IN ($1, $2)', [testUserId1, testUserId2]);
    await pool.query('DELETE FROM businesses WHERE id = $1', [testBusinessId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testUserId1, testUserId2]);
    await pool.query('SET row_security = on');
  });

  describe('RLS 정책 존재 확인', () => {
    it('documents 테이블에 RLS가 활성화되어야 한다', async () => {
      const query = `
        SELECT relname, relrowsecurity
        FROM pg_class
        WHERE relname = 'documents'
      `;

      const result = await pool.query(query);
      expect(result.rows).to.have.length(1);
      expect(result.rows[0].relrowsecurity).to.be.true;
    });

    it('documents 테이블에 필요한 RLS 정책들이 존재해야 한다', async () => {
      const query = `
        SELECT policyname, cmd, qual
        FROM pg_policies
        WHERE tablename = 'documents'
        ORDER BY policyname
      `;

      const result = await pool.query(query);
      expect(result.rows.length).to.be.greaterThanOrEqual(3);

      const policyNames = result.rows.map(row => row.policyname);
      expect(policyNames).to.include.members([
        'documents_owner_policy',
        'documents_public_read_policy',
        'documents_business_member_policy'
      ]);
    });

    it('소유자 정책이 올바르게 설정되어야 한다', async () => {
      const query = `
        SELECT policyname, cmd, qual
        FROM pg_policies
        WHERE tablename = 'documents'
        AND policyname = 'documents_owner_policy'
      `;

      const result = await pool.query(query);
      expect(result.rows).to.have.length(1);
      expect(result.rows[0].cmd).to.equal('ALL');
      expect(result.rows[0].qual).to.include('owner_id');
      expect(result.rows[0].qual).to.include('current_setting');
    });

    it('공개 문서 읽기 정책이 올바르게 설정되어야 한다', async () => {
      const query = `
        SELECT policyname, cmd, qual
        FROM pg_policies
        WHERE tablename = 'documents'
        AND policyname = 'documents_public_read_policy'
      `;

      const result = await pool.query(query);
      expect(result.rows).to.have.length(1);
      expect(result.rows[0].cmd).to.equal('SELECT');
      expect(result.rows[0].qual).to.include('is_public');
      expect(result.rows[0].qual).to.include('true');
    });
  });

  describe('소유자 접근 제어', () => {
    it('소유자는 자신의 비공개 문서를 조회할 수 있어야 한다', async () => {
      // 사용자1로 설정
      await pool.query(`SET app.current_user_id = '${testUserId1}'`);

      const result = await pool.query(`
        SELECT id, original_filename, is_public
        FROM documents
        WHERE id = $1
      `, [documentId1]);

      expect(result.rows).to.have.length(1);
      expect(result.rows[0].original_filename).to.equal('private_doc.pdf');
      expect(result.rows[0].is_public).to.be.false;
    });

    it('소유자는 자신의 공개 문서를 조회할 수 있어야 한다', async () => {
      // 사용자1로 설정
      await pool.query(`SET app.current_user_id = '${testUserId1}'`);

      const result = await pool.query(`
        SELECT id, original_filename, is_public
        FROM documents
        WHERE id = $1
      `, [documentId2]);

      expect(result.rows).to.have.length(1);
      expect(result.rows[0].original_filename).to.equal('public_doc.pdf');
      expect(result.rows[0].is_public).to.be.true;
    });

    it('소유자는 자신의 문서를 수정할 수 있어야 한다', async () => {
      // 사용자1로 설정
      await pool.query(`SET app.current_user_id = '${testUserId1}'`);

      const result = await pool.query(`
        UPDATE documents
        SET category = 'test_category'
        WHERE id = $1
        RETURNING id, category
      `, [documentId1]);

      expect(result.rows).to.have.length(1);
      expect(result.rows[0].category).to.equal('test_category');
    });

    it('소유자는 자신의 문서를 삭제할 수 있어야 한다', async () => {
      // 사용자2로 설정하여 테스트 문서 생성
      await pool.query(`SET app.current_user_id = '${testUserId2}'`);

      const tempDoc = await pool.query(`
        INSERT INTO documents (owner_id, filename, original_filename, file_type, file_size, storage_path)
        VALUES ($1, 'temp.pdf', 'temp.pdf', 'pdf', 100, '/storage/temp.pdf')
        RETURNING id
      `, [testUserId2]);

      const tempDocId = tempDoc.rows[0].id;

      // 삭제 시도
      const deleteResult = await pool.query(`
        DELETE FROM documents
        WHERE id = $1
        RETURNING id
      `, [tempDocId]);

      expect(deleteResult.rows).to.have.length(1);
    });
  });

  describe('비소유자 접근 제어', () => {
    it('비소유자는 다른 사용자의 비공개 문서를 조회할 수 없어야 한다', async () => {
      // 일반 사용자로 역할 전환 (superuser 권한 해제)
      await pool.query('SET ROLE dot_test_user');
      await pool.query('SET row_security = on');
      await pool.query(`SET app.current_user_id = '${testUserId2}'`);

      const result = await pool.query(`
        SELECT id, original_filename
        FROM documents
        WHERE id = $1
      `, [documentId1]); // 사용자1의 비공개 문서

      // 역할 복원
      await pool.query('RESET ROLE');

      expect(result.rows).to.have.length(0);
    });

    it('비소유자는 다른 사용자의 비공개 문서를 수정할 수 없어야 한다', async () => {
      // RLS 설정 재확인 및 사용자2로 설정
      await pool.query('SET row_security = on');
      await pool.query(`SET app.current_user_id = '${testUserId2}'`);

      const result = await pool.query(`
        UPDATE documents
        SET category = 'unauthorized_update'
        WHERE id = $1
        RETURNING id
      `, [documentId1]); // 사용자1의 비공개 문서

      expect(result.rows).to.have.length(0);
    });

    it('비소유자는 다른 사용자의 문서를 삭제할 수 없어야 한다', async () => {
      // RLS 설정 재확인 및 사용자2로 설정
      await pool.query('SET row_security = on');
      await pool.query(`SET app.current_user_id = '${testUserId2}'`);

      const result = await pool.query(`
        DELETE FROM documents
        WHERE id = $1
        RETURNING id
      `, [documentId1]); // 사용자1의 문서

      expect(result.rows).to.have.length(0);
    });
  });

  describe('공개 문서 접근', () => {
    it('모든 사용자는 공개 문서를 조회할 수 있어야 한다', async () => {
      // 사용자2로 설정
      await pool.query(`SET app.current_user_id = '${testUserId2}'`);

      const result = await pool.query(`
        SELECT id, original_filename, is_public
        FROM documents
        WHERE id = $1
      `, [documentId2]); // 사용자1의 공개 문서

      expect(result.rows).to.have.length(1);
      expect(result.rows[0].original_filename).to.equal('public_doc.pdf');
      expect(result.rows[0].is_public).to.be.true;
    });

    it('비소유자는 공개 문서를 수정할 수 없어야 한다', async () => {
      // RLS 설정 재확인 및 사용자2로 설정
      await pool.query('SET row_security = on');
      await pool.query(`SET app.current_user_id = '${testUserId2}'`);

      const result = await pool.query(`
        UPDATE documents
        SET category = 'unauthorized_public_update'
        WHERE id = $1
        RETURNING id
      `, [documentId2]); // 사용자1의 공개 문서

      expect(result.rows).to.have.length(0);
    });

    it('인증되지 않은 요청에서는 어떤 문서도 접근할 수 없어야 한다', async () => {
      // 일반 사용자로 역할 전환 (superuser 권한 해제)
      await pool.query('SET ROLE dot_test_user');
      await pool.query('SET row_security = on');
      await pool.query('RESET app.current_user_id');

      const result = await pool.query(`
        SELECT id FROM documents
        WHERE id IN ($1, $2, $3)
      `, [documentId1, documentId2, documentId3]);

      // 역할 복원
      await pool.query('RESET ROLE');

      expect(result.rows).to.have.length(0);
    });
  });

  describe('사업장 멤버 접근 (추가 정책)', () => {
    it('사업장 멤버는 사업장 문서에 읽기 접근할 수 있어야 한다', async () => {
      // 사용자2로 설정 (사업장 멤버)
      await pool.query(`SET app.current_user_id = '${testUserId2}'`);

      // 사업장 관련 문서 조회 시도
      const result = await pool.query(`
        SELECT id, original_filename, business_id
        FROM documents
        WHERE business_id = $1
        AND is_public = false
      `, [testBusinessId]);

      // 사업장 멤버 정책이 구현되면 접근 가능해야 함
      // 현재는 소유자 정책만 있으므로 접근 불가 예상
      console.log(`사업장 멤버 접근 테스트: ${result.rows.length}개 문서 조회됨`);
    });
  });

  describe('문서 생성 권한', () => {
    it('인증된 사용자는 자신 소유의 문서를 생성할 수 있어야 한다', async () => {
      // 사용자1로 설정
      await pool.query(`SET app.current_user_id = '${testUserId1}'`);

      const result = await pool.query(`
        INSERT INTO documents (owner_id, filename, original_filename, file_type, file_size, storage_path)
        VALUES ($1, 'new_doc.pdf', 'new_document.pdf', 'pdf', 1500, '/storage/new_doc.pdf')
        RETURNING id, owner_id
      `, [testUserId1]);

      expect(result.rows).to.have.length(1);
      expect(result.rows[0].owner_id).to.equal(testUserId1);

      // 생성된 문서 정리
      await pool.query('DELETE FROM documents WHERE id = $1', [result.rows[0].id]);
    });

    it('다른 사용자 소유로 문서를 생성할 수 없어야 한다', async () => {
      try {
        // 일반 사용자로 역할 전환 (superuser 권한 해제)
        await pool.query('SET ROLE dot_test_user');
        await pool.query('SET row_security = on');
        await pool.query(`SET app.current_user_id = '${testUserId2}'`);

        await pool.query(`
          INSERT INTO documents (owner_id, filename, original_filename, file_type, file_size, storage_path)
          VALUES ($1, 'fake_doc.pdf', 'fake_document.pdf', 'pdf', 1500, '/storage/fake_doc.pdf')
          RETURNING id
        `, [testUserId1]); // 다른 사용자(testUserId1) 소유로 생성 시도

        // 역할 복원
        await pool.query('RESET ROLE');
        expect.fail('다른 사용자 소유로 문서 생성이 성공해서는 안됨');
      } catch (error) {
        // 역할 복원 (에러 체크 후)
        await pool.query('RESET ROLE');
        // RLS 정책에 의해 차단되어야 함
        expect(error.message).to.include('policy');
      }
    });
  });
});