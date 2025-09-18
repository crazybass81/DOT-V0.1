-- 020_create_user_roles.sql
-- 사용자 역할 테이블 생성 (복합 유니크 인덱스 포함)
-- Based on data-model.md specifications

BEGIN;

-- user_roles 테이블 생성
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    role_type VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    permissions JSONB DEFAULT '[]',
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 복합 유니크 제약조건
    UNIQUE(user_id, business_id, role_type),

    -- CHECK 제약조건
    CONSTRAINT chk_role_type CHECK (
        role_type IN ('owner', 'manager', 'worker', 'seeker')
    ),
    CONSTRAINT chk_seeker_no_business CHECK (
        (role_type = 'seeker' AND business_id IS NULL) OR
        (role_type != 'seeker' AND business_id IS NOT NULL)
    ),
    CONSTRAINT chk_valid_period CHECK (
        valid_until IS NULL OR valid_until >= valid_from
    )
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_business ON user_roles(business_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_type ON user_roles(role_type);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(business_id, is_active) WHERE is_active = TRUE;

-- 한글 주석 추가
COMMENT ON TABLE user_roles IS '사용자와 사업장 간의 역할 매핑';
COMMENT ON COLUMN user_roles.id IS '역할 고유 식별자';
COMMENT ON COLUMN user_roles.user_id IS '사용자 ID (외래키)';
COMMENT ON COLUMN user_roles.business_id IS '사업장 ID (외래키, seeker는 NULL)';
COMMENT ON COLUMN user_roles.role_type IS '역할 유형 (owner/manager/worker/seeker)';
COMMENT ON COLUMN user_roles.is_active IS '활성 상태';
COMMENT ON COLUMN user_roles.permissions IS 'JSON 형태의 권한 목록';
COMMENT ON COLUMN user_roles.valid_from IS '역할 시작일';
COMMENT ON COLUMN user_roles.valid_until IS '역할 종료일 (NULL이면 무기한)';
COMMENT ON COLUMN user_roles.created_at IS '역할 생성 시간';
COMMENT ON COLUMN user_roles.updated_at IS '마지막 수정 시간';

-- updated_at 자동 업데이트 트리거 생성
CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;