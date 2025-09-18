-- T016-T020: Users 테이블 생성 및 RLS 정책
-- Migration: 001_create_users_table
-- Date: 2025-09-16

-- T017: users 테이블 생성
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    profile_image_url TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- T018: 인덱스 추가
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- 업데이트 시간 자동 갱신 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 업데이트 트리거
CREATE TRIGGER update_users_updated_at BEFORE UPDATE
    ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- T020: Row Level Security 정책 구현
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 정책: 사용자는 자신의 정보만 조회 가능 (user_roles 테이블 생성 전이므로 단순화)
CREATE POLICY users_select_policy ON users
    FOR SELECT
    USING (id = current_setting('app.current_user_id', true)::INTEGER
           OR current_setting('app.current_user_id', true) IS NULL);

-- 정책: 사용자는 자신의 정보만 수정 가능
CREATE POLICY users_update_policy ON users
    FOR UPDATE
    USING (id = current_setting('app.current_user_id', true)::INTEGER)
    WITH CHECK (id = current_setting('app.current_user_id', true)::INTEGER);

-- 정책: 누구나 회원가입 가능 (INSERT)
CREATE POLICY users_insert_policy ON users
    FOR INSERT
    WITH CHECK (true);

-- 정책: 사용자는 자신의 계정만 삭제 가능
CREATE POLICY users_delete_policy ON users
    FOR DELETE
    USING (id = current_setting('app.current_user_id', true)::INTEGER);

-- 코멘트 추가
COMMENT ON TABLE users IS 'DOT 플랫폼 사용자 정보';
COMMENT ON COLUMN users.id IS '사용자 고유 ID';
COMMENT ON COLUMN users.email IS '이메일 (로그인 ID)';
COMMENT ON COLUMN users.password_hash IS 'bcrypt로 해싱된 비밀번호';
COMMENT ON COLUMN users.name IS '사용자 이름';
COMMENT ON COLUMN users.phone IS '휴대폰 번호';
COMMENT ON COLUMN users.profile_image_url IS '프로필 이미지 URL';
COMMENT ON COLUMN users.status IS '계정 상태 (active, inactive, suspended)';
COMMENT ON COLUMN users.email_verified IS '이메일 인증 여부';
COMMENT ON COLUMN users.phone_verified IS '휴대폰 인증 여부';
COMMENT ON COLUMN users.last_login_at IS '마지막 로그인 시간';
COMMENT ON COLUMN users.created_at IS '계정 생성 시간';
COMMENT ON COLUMN users.updated_at IS '정보 수정 시간';