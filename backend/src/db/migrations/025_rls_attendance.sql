-- 025_rls_attendance.sql
-- Attendance 테이블 RLS 정책
-- Based on data-model.md specifications

BEGIN;

-- attendances 테이블 RLS 활성화
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

-- qr_codes 테이블 RLS 활성화
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (중복 방지)
DROP POLICY IF EXISTS attendances_select_policy ON attendances;
DROP POLICY IF EXISTS attendances_insert_policy ON attendances;
DROP POLICY IF EXISTS attendances_update_policy ON attendances;
DROP POLICY IF EXISTS attendances_delete_policy ON attendances;

DROP POLICY IF EXISTS qr_codes_select_policy ON qr_codes;
DROP POLICY IF EXISTS qr_codes_insert_policy ON qr_codes;
DROP POLICY IF EXISTS qr_codes_update_policy ON qr_codes;
DROP POLICY IF EXISTS qr_codes_delete_policy ON qr_codes;

-- ATTENDANCES 정책들

-- 1. 읽기 정책: 본인 출석기록 또는 사업장 관리자
CREATE POLICY attendances_select_policy ON attendances
    FOR SELECT
    USING (
        -- 본인의 출석 기록
        user_id = auth.uid()::integer OR
        -- 또는 해당 사업장의 owner/manager
        user_has_business_role(business_id, ARRAY['owner', 'manager']) OR
        -- 또는 시스템 관리자
        user_has_role(auth.uid()::integer, 'admin')
    );

-- 2. 삽입 정책: 본인 출석기록 또는 관리자
CREATE POLICY attendances_insert_policy ON attendances
    FOR INSERT
    WITH CHECK (
        -- 본인의 출석 기록 생성
        user_id = auth.uid()::integer OR
        -- 또는 해당 사업장의 owner/manager가 직원 출석 기록 생성
        (
            user_has_business_role(business_id, ARRAY['owner', 'manager']) AND
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.id = user_role_id
                AND ur.business_id = attendances.business_id
                AND ur.is_active = true
            )
        ) OR
        -- 또는 시스템 관리자
        user_has_role(auth.uid()::integer, 'admin')
    );

-- 3. 업데이트 정책: 본인 출석기록 또는 관리자
CREATE POLICY attendances_update_policy ON attendances
    FOR UPDATE
    USING (
        -- 본인의 출석 기록 수정
        user_id = auth.uid()::integer OR
        -- 또는 해당 사업장의 owner/manager
        user_has_business_role(business_id, ARRAY['owner', 'manager']) OR
        -- 또는 시스템 관리자
        user_has_role(auth.uid()::integer, 'admin')
    )
    WITH CHECK (
        -- 수정 후에도 동일한 조건
        user_id = auth.uid()::integer OR
        user_has_business_role(business_id, ARRAY['owner', 'manager']) OR
        user_has_role(auth.uid()::integer, 'admin')
    );

-- 4. 삭제 정책: 관리자만 가능
CREATE POLICY attendances_delete_policy ON attendances
    FOR DELETE
    USING (
        -- 해당 사업장의 owner/manager
        user_has_business_role(business_id, ARRAY['owner', 'manager']) OR
        -- 또는 시스템 관리자
        user_has_role(auth.uid()::integer, 'admin')
    );

-- QR_CODES 정책들

-- 1. 읽기 정책: 해당 사업장 직원들
CREATE POLICY qr_codes_select_policy ON qr_codes
    FOR SELECT
    USING (
        -- 해당 사업장에 역할이 있는 사용자
        can_access_business(business_id) OR
        -- 또는 시스템 관리자
        user_has_role(auth.uid()::integer, 'admin')
    );

-- 2. 삽입 정책: owner/manager만 QR 코드 생성 가능
CREATE POLICY qr_codes_insert_policy ON qr_codes
    FOR INSERT
    WITH CHECK (
        user_has_business_role(business_id, ARRAY['owner', 'manager']) OR
        user_has_role(auth.uid()::integer, 'admin')
    );

-- 3. 업데이트 정책: owner/manager만 QR 코드 수정 가능
CREATE POLICY qr_codes_update_policy ON qr_codes
    FOR UPDATE
    USING (
        user_has_business_role(business_id, ARRAY['owner', 'manager']) OR
        user_has_role(auth.uid()::integer, 'admin')
    )
    WITH CHECK (
        user_has_business_role(business_id, ARRAY['owner', 'manager']) OR
        user_has_role(auth.uid()::integer, 'admin')
    );

-- 4. 삭제 정책: owner/manager만 QR 코드 삭제 가능
CREATE POLICY qr_codes_delete_policy ON qr_codes
    FOR DELETE
    USING (
        user_has_business_role(business_id, ARRAY['owner', 'manager']) OR
        user_has_role(auth.uid()::integer, 'admin')
    );

-- 출석 기록 검증 함수
CREATE OR REPLACE FUNCTION validate_attendance_record(
    p_business_id INTEGER,
    p_user_id INTEGER,
    p_user_role_id INTEGER,
    p_date DATE
) RETURNS BOOLEAN AS $$
BEGIN
    -- 사용자 역할 검증
    IF NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.id = p_user_role_id
        AND ur.user_id = p_user_id
        AND ur.business_id = p_business_id
        AND ur.is_active = true
        AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
    ) THEN
        RETURN FALSE;
    END IF;

    -- 날짜 검증 (미래 날짜는 불가)
    IF p_date > CURRENT_DATE THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS 성능 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_attendances_rls_user
ON attendances(user_id, business_id)
WHERE user_id = auth.uid()::integer;

CREATE INDEX IF NOT EXISTS idx_qr_codes_rls_business
ON qr_codes(business_id)
WHERE is_active = true;

-- 한글 주석
COMMENT ON POLICY attendances_select_policy ON attendances IS '본인 출석기록 또는 사업장 관리자만 조회 가능';
COMMENT ON POLICY attendances_insert_policy ON attendances IS '본인 출석기록 또는 관리자만 생성 가능';
COMMENT ON POLICY attendances_update_policy ON attendances IS '본인 출석기록 또는 관리자만 수정 가능';
COMMENT ON POLICY attendances_delete_policy ON attendances IS '관리자만 출석기록 삭제 가능';

COMMENT ON POLICY qr_codes_select_policy ON qr_codes IS '사업장 직원만 QR 코드 조회 가능';
COMMENT ON POLICY qr_codes_insert_policy ON qr_codes IS 'owner/manager만 QR 코드 생성 가능';
COMMENT ON POLICY qr_codes_update_policy ON qr_codes IS 'owner/manager만 QR 코드 수정 가능';
COMMENT ON POLICY qr_codes_delete_policy ON qr_codes IS 'owner/manager만 QR 코드 삭제 가능';

COMMIT;