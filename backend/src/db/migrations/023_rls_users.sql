-- 023_rls_users.sql
-- Users 테이블 RLS 정책 (자기 데이터만 읽기/수정 가능)
-- Based on data-model.md specifications

BEGIN;

-- RLS (Row Level Security) 활성화
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 모든 기존 정책 삭제 (중복 방지)
DROP POLICY IF EXISTS users_select_policy ON users;
DROP POLICY IF EXISTS users_insert_policy ON users;
DROP POLICY IF EXISTS users_update_policy ON users;
DROP POLICY IF EXISTS users_delete_policy ON users;

-- 1. 읽기 정책: 자기 자신의 데이터만 조회 가능
CREATE POLICY users_select_policy ON users
    FOR SELECT
    USING (
        -- 자기 자신의 데이터
        id = auth.uid()::integer OR
        -- 또는 시스템 관리자 (추후 확장용)
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()::integer
            AND ur.role_type = 'admin'
            AND ur.is_active = true
        )
    );

-- 2. 삽입 정책: 회원가입시에만 가능
CREATE POLICY users_insert_policy ON users
    FOR INSERT
    WITH CHECK (
        -- 자기 자신 생성 (회원가입)
        id = auth.uid()::integer OR
        -- 또는 인증되지 않은 상태에서 회원가입
        auth.uid() IS NULL
    );

-- 3. 업데이트 정책: 자기 자신의 데이터만 수정 가능
CREATE POLICY users_update_policy ON users
    FOR UPDATE
    USING (
        -- 자기 자신의 데이터만 수정
        id = auth.uid()::integer
    )
    WITH CHECK (
        -- 수정 후에도 자기 자신의 데이터
        id = auth.uid()::integer AND
        -- 중요 필드는 수정 불가 (이메일은 별도 프로세스 필요)
        (OLD.email = NEW.email OR auth.uid()::integer IN (
            SELECT user_id FROM user_roles
            WHERE role_type = 'admin' AND is_active = true
        ))
    );

-- 4. 삭제 정책: 자기 자신만 삭제 가능 (또는 관리자)
CREATE POLICY users_delete_policy ON users
    FOR DELETE
    USING (
        -- 자기 자신 삭제
        id = auth.uid()::integer OR
        -- 또는 시스템 관리자
        EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()::integer
            AND ur.role_type = 'admin'
            AND ur.is_active = true
        )
    );

-- 사용자 인증 관련 보안 함수 생성
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(auth.uid()::integer, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 사용자 권한 확인 함수
CREATE OR REPLACE FUNCTION user_has_role(target_user_id INTEGER, required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = target_user_id
        AND ur.role_type = required_role
        AND ur.is_active = true
        AND (ur.valid_until IS NULL OR ur.valid_until > CURRENT_TIMESTAMP)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 인덱스 추가 (RLS 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_users_rls_auth ON users(id) WHERE id = auth.uid()::integer;

-- 한글 주석
COMMENT ON POLICY users_select_policy ON users IS '사용자는 자신의 정보만 조회 가능';
COMMENT ON POLICY users_insert_policy ON users IS '회원가입 시에만 사용자 생성 가능';
COMMENT ON POLICY users_update_policy ON users IS '사용자는 자신의 정보만 수정 가능';
COMMENT ON POLICY users_delete_policy ON users IS '사용자는 자신의 계정만 삭제 가능';

COMMIT;