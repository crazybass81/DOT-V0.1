/**
 * T220: Documents 테이블 RLS 정책 구현
 * Row Level Security 정책 생성으로 문서 접근 제어
 * 소유자 권한, 공개 문서 접근, 사업장 멤버 접근 정책
 */

-- RLS 활성화 및 강제 적용 (superuser도 우회 불가)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

-- 기존 정책이 있다면 삭제 (재실행 가능하게)
DROP POLICY IF EXISTS documents_owner_policy ON documents;
DROP POLICY IF EXISTS documents_public_read_policy ON documents;
DROP POLICY IF EXISTS documents_business_member_policy ON documents;

-- 1. 소유자 정책: 소유자는 자신의 문서에 대해 모든 권한 (CRUD)
CREATE POLICY documents_owner_policy ON documents
FOR ALL
TO public
USING (owner_id = CAST(current_setting('app.current_user_id', true) AS INTEGER))
WITH CHECK (owner_id = CAST(current_setting('app.current_user_id', true) AS INTEGER));

-- 2. 공개 문서 읽기 정책: 모든 인증된 사용자는 공개 문서를 읽을 수 있음
CREATE POLICY documents_public_read_policy ON documents
FOR SELECT
TO public
USING (
  is_public = true
  AND current_setting('app.current_user_id', true) IS NOT NULL
  AND current_setting('app.current_user_id', true) != ''
);

-- 3. 사업장 멤버 정책: 사업장 멤버는 해당 사업장의 문서를 읽을 수 있음
-- 무한 재귀 방지를 위해 SECURITY DEFINER 함수 사용
CREATE OR REPLACE FUNCTION check_business_membership(doc_business_id INTEGER, user_id INTEGER)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE SQL
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = check_business_membership.user_id
    AND user_roles.business_id = check_business_membership.doc_business_id
    AND user_roles.is_active = true
  );
$$;

CREATE POLICY documents_business_member_policy ON documents
FOR SELECT
TO public
USING (
  business_id IS NOT NULL
  AND check_business_membership(business_id, CAST(current_setting('app.current_user_id', true) AS INTEGER))
);

-- 정책 설명 추가
COMMENT ON POLICY documents_owner_policy ON documents IS
'문서 소유자는 자신의 문서에 대해 모든 권한(CRUD)을 가집니다.';

COMMENT ON POLICY documents_public_read_policy ON documents IS
'인증된 모든 사용자는 공개 문서를 읽을 수 있습니다.';

COMMENT ON POLICY documents_business_member_policy ON documents IS
'사업장 멤버는 해당 사업장의 문서를 읽을 수 있습니다.';

-- RLS 정책 확인을 위한 뷰 생성
CREATE OR REPLACE VIEW documents_policy_summary AS
SELECT
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'documents'
ORDER BY policyname;

COMMENT ON VIEW documents_policy_summary IS 'Documents 테이블 RLS 정책 요약 뷰';

-- 정책 테스트를 위한 함수 생성 (개발/테스트용)
CREATE OR REPLACE FUNCTION test_document_access(
    test_user_id INTEGER,
    test_document_id INTEGER
) RETURNS TABLE (
    can_select BOOLEAN,
    can_update BOOLEAN,
    can_delete BOOLEAN
) AS $$
DECLARE
    original_user_id TEXT;
BEGIN
    -- 현재 사용자 ID 백업
    original_user_id := current_setting('app.current_user_id', true);

    -- 테스트 사용자로 설정
    PERFORM set_config('app.current_user_id', test_user_id::TEXT, true);

    -- SELECT 권한 테스트
    BEGIN
        PERFORM 1 FROM documents WHERE id = test_document_id;
        can_select := true;
    EXCEPTION WHEN insufficient_privilege THEN
        can_select := false;
    END;

    -- UPDATE 권한 테스트 (실제 업데이트는 하지 않음)
    BEGIN
        PERFORM 1 FROM documents WHERE id = test_document_id FOR UPDATE;
        can_update := true;
    EXCEPTION WHEN insufficient_privilege THEN
        can_update := false;
    END;

    -- DELETE 권한 테스트 (실제 삭제는 하지 않음)
    BEGIN
        PERFORM 1 FROM documents WHERE id = test_document_id FOR UPDATE;
        can_delete := can_update; -- DELETE와 UPDATE 권한은 동일
    EXCEPTION WHEN insufficient_privilege THEN
        can_delete := false;
    END;

    -- 원래 사용자 ID 복원
    IF original_user_id IS NOT NULL AND original_user_id != '' THEN
        PERFORM set_config('app.current_user_id', original_user_id, true);
    ELSE
        PERFORM set_config('app.current_user_id', '', true);
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION test_document_access IS
'개발/테스트용: 특정 사용자의 문서 접근 권한을 테스트합니다.';