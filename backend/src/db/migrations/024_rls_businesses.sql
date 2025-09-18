-- 024_rls_businesses.sql
-- Businesses 테이블 RLS 정책 (역할별 접근 권한)
-- Based on data-model.md specifications

BEGIN;

-- RLS (Row Level Security) 활성화
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- 모든 기존 정책 삭제 (중복 방지)
DROP POLICY IF EXISTS businesses_select_policy ON businesses;
DROP POLICY IF EXISTS businesses_insert_policy ON businesses;
DROP POLICY IF EXISTS businesses_update_policy ON businesses;
DROP POLICY IF EXISTS businesses_delete_policy ON businesses;

-- 1. 읽기 정책: 역할이 있는 사업장만 조회 가능
CREATE POLICY businesses_select_policy ON businesses
    FOR SELECT
    USING (
        -- 해당 사업장에 역할이 있는 사용자
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.business_id = businesses.id
            AND ur.user_id = auth.uid()::integer
            AND ur.is_active = true
            AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
        ) OR
        -- 또는 시스템 관리자
        user_has_role(auth.uid()::integer, 'admin') OR
        -- 또는 구직자가 공개된 사업장 정보 조회 (제한적)
        (
            user_has_role(auth.uid()::integer, 'seeker') AND
            businesses.id IN (
                SELECT DISTINCT ur.business_id
                FROM user_roles ur
                WHERE ur.role_type IN ('owner', 'manager')
                AND ur.is_active = true
            )
        )
    );

-- 2. 삽입 정책: 인증된 사용자만 사업장 생성 가능
CREATE POLICY businesses_insert_policy ON businesses
    FOR INSERT
    WITH CHECK (
        -- 인증된 사용자
        auth.uid() IS NOT NULL
    );

-- 3. 업데이트 정책: owner 또는 manager만 수정 가능
CREATE POLICY businesses_update_policy ON businesses
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.business_id = businesses.id
            AND ur.user_id = auth.uid()::integer
            AND ur.role_type IN ('owner', 'manager')
            AND ur.is_active = true
            AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
        ) OR
        user_has_role(auth.uid()::integer, 'admin')
    )
    WITH CHECK (
        -- 수정 후에도 동일한 조건
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.business_id = businesses.id
            AND ur.user_id = auth.uid()::integer
            AND ur.role_type IN ('owner', 'manager')
            AND ur.is_active = true
            AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
        ) OR
        user_has_role(auth.uid()::integer, 'admin')
    );

-- 4. 삭제 정책: owner만 삭제 가능
CREATE POLICY businesses_delete_policy ON businesses
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.business_id = businesses.id
            AND ur.user_id = auth.uid()::integer
            AND ur.role_type = 'owner'
            AND ur.is_active = true
            AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
        ) OR
        user_has_role(auth.uid()::integer, 'admin')
    );

-- 사업장 권한 확인 함수
CREATE OR REPLACE FUNCTION user_has_business_role(business_id INTEGER, required_roles TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.business_id = $1
        AND ur.user_id = auth.uid()::integer
        AND ur.role_type = ANY($2)
        AND ur.is_active = true
        AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 사업장 접근 가능 여부 확인 함수
CREATE OR REPLACE FUNCTION can_access_business(business_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.business_id = $1
        AND ur.user_id = auth.uid()::integer
        AND ur.is_active = true
        AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS 성능 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_businesses_rls_user_roles
ON user_roles(business_id, user_id, role_type, is_active)
WHERE is_active = true;

-- 한글 주석
COMMENT ON POLICY businesses_select_policy ON businesses IS '역할이 있는 사업장만 조회 가능';
COMMENT ON POLICY businesses_insert_policy ON businesses IS '인증된 사용자만 사업장 생성 가능';
COMMENT ON POLICY businesses_update_policy ON businesses IS 'owner/manager만 사업장 정보 수정 가능';
COMMENT ON POLICY businesses_delete_policy ON businesses IS 'owner만 사업장 삭제 가능';

COMMIT;