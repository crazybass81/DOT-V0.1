-- T026-T030: UserRoles 테이블 생성 및 RLS 정책
-- Migration: 003_create_user_roles_table
-- Date: 2025-09-16

-- T027: user_roles 테이블 생성
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    role_type VARCHAR(20) NOT NULL CHECK (role_type IN ('owner', 'manager', 'worker', 'seeker')),
    is_active BOOLEAN DEFAULT true,
    permissions TEXT[] DEFAULT '{}',  -- 권한 배열
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),

    -- 복합 유니크 제약: 한 사용자가 한 사업장에서 여러 역할을 가질 수 없음
    CONSTRAINT unique_user_business_role UNIQUE (user_id, business_id, role_type)
);

-- T028: 복합 인덱스 추가
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_business_id ON user_roles(business_id);
CREATE INDEX idx_user_roles_role_type ON user_roles(role_type);
CREATE INDEX idx_user_roles_is_active ON user_roles(is_active);
CREATE INDEX idx_user_roles_composite ON user_roles(user_id, business_id, is_active);
CREATE INDEX idx_user_roles_dates ON user_roles(start_date, end_date);

-- 업데이트 트리거
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE
    ON user_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- T030: Row Level Security 정책 구현
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 정책: 사용자는 자신의 역할만 조회 가능, Owner/Manager는 사업장 직원 역할 조회 가능
CREATE POLICY user_roles_select_policy ON user_roles
    FOR SELECT
    USING (
        user_id = current_setting('app.current_user_id', true)::INTEGER
        OR current_setting('app.current_user_id', true) IS NULL
        OR EXISTS (
            SELECT 1 FROM user_roles ur2
            WHERE ur2.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur2.business_id = user_roles.business_id
            AND ur2.role_type IN ('owner', 'manager')
            AND ur2.is_active = true
        )
    );

-- 정책: Owner만 역할 생성 가능 (자동 Seeker 역할 제외)
CREATE POLICY user_roles_insert_policy ON user_roles
    FOR INSERT
    WITH CHECK (
        -- Seeker 역할은 누구나 자동 생성 가능
        (role_type = 'seeker' AND business_id IS NULL)
        OR current_setting('app.current_user_id', true) IS NULL
        OR EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.business_id = user_roles.business_id
            AND ur.role_type = 'owner'
            AND ur.is_active = true
        )
    );

-- 정책: Owner/Manager만 역할 수정 가능
CREATE POLICY user_roles_update_policy ON user_roles
    FOR UPDATE
    USING (
        current_setting('app.current_user_id', true) IS NULL
        OR EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.business_id = user_roles.business_id
            AND ur.role_type IN ('owner', 'manager')
            AND ur.is_active = true
        )
    );

-- 정책: Owner만 역할 삭제 가능
CREATE POLICY user_roles_delete_policy ON user_roles
    FOR DELETE
    USING (
        current_setting('app.current_user_id', true) IS NULL
        OR EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.business_id = user_roles.business_id
            AND ur.role_type = 'owner'
            AND ur.is_active = true
        )
    );

-- 사용자 역할 조회 함수
CREATE OR REPLACE FUNCTION get_user_active_roles(p_user_id INTEGER)
RETURNS TABLE (
    role_id INTEGER,
    business_id INTEGER,
    business_name VARCHAR,
    role_type VARCHAR,
    permissions TEXT[],
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ur.id,
        ur.business_id,
        b.name,
        ur.role_type,
        ur.permissions,
        ur.is_active
    FROM user_roles ur
    LEFT JOIN businesses b ON ur.business_id = b.id
    WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    AND (ur.end_date IS NULL OR ur.end_date >= CURRENT_DATE)
    ORDER BY
        CASE ur.role_type
            WHEN 'owner' THEN 1
            WHEN 'manager' THEN 2
            WHEN 'worker' THEN 3
            WHEN 'seeker' THEN 4
        END;
END;
$$ LANGUAGE plpgsql STABLE;

-- 회원가입 시 자동으로 Seeker 역할 부여 트리거
CREATE OR REPLACE FUNCTION auto_assign_seeker_role()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_roles (user_id, business_id, role_type, is_active)
    VALUES (NEW.id, NULL, 'seeker', true);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assign_seeker_role_on_signup
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_seeker_role();

-- 이제 users 테이블의 RLS 정책을 업데이트
DROP POLICY IF EXISTS users_select_policy ON users;
CREATE POLICY users_select_policy ON users
    FOR SELECT
    USING (
        id = current_setting('app.current_user_id', true)::INTEGER
        OR current_setting('app.current_user_id', true) IS NULL
        OR EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = current_setting('app.current_user_id', true)::INTEGER
            AND ur.role_type IN ('owner', 'manager')
            AND ur.is_active = true
        )
    );

-- 코멘트 추가
COMMENT ON TABLE user_roles IS '사용자 역할 정보';
COMMENT ON COLUMN user_roles.id IS '역할 고유 ID';
COMMENT ON COLUMN user_roles.user_id IS '사용자 ID (users.id 참조)';
COMMENT ON COLUMN user_roles.business_id IS '사업장 ID (businesses.id 참조, NULL이면 Seeker)';
COMMENT ON COLUMN user_roles.role_type IS '역할 유형 (owner, manager, worker, seeker)';
COMMENT ON COLUMN user_roles.is_active IS '활성 상태';
COMMENT ON COLUMN user_roles.permissions IS '권한 배열';
COMMENT ON COLUMN user_roles.start_date IS '역할 시작일';
COMMENT ON COLUMN user_roles.end_date IS '역할 종료일';
COMMENT ON COLUMN user_roles.created_by IS '역할 생성자';
COMMENT ON FUNCTION get_user_active_roles IS '사용자의 활성 역할 조회';
COMMENT ON FUNCTION auto_assign_seeker_role IS '회원가입 시 Seeker 역할 자동 부여';