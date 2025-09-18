-- T146 전제조건: employees 테이블 생성
-- 직원 정보 관리

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),

    -- 직원 정보
    employee_code VARCHAR(50),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),

    -- 고용 정보
    role VARCHAR(50) NOT NULL CHECK (role IN ('full_time', 'part_time', 'intern', 'contract')),
    position VARCHAR(100), -- 직책/직급
    department VARCHAR(100), -- 부서

    -- 급여 정보
    hourly_rate DECIMAL(10, 2),
    salary DECIMAL(12, 2),
    pay_type VARCHAR(20) DEFAULT 'hourly' CHECK (pay_type IN ('hourly', 'salary', 'commission')),

    -- 상태
    employment_status VARCHAR(20) DEFAULT 'active' CHECK (
        employment_status IN ('active', 'inactive', 'on_leave', 'terminated')
    ),

    -- 날짜
    joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
    terminated_at DATE,

    -- 추가 정보
    notes TEXT,
    emergency_contact JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 제약조건
    CONSTRAINT unique_employee_code UNIQUE (business_id, employee_code),
    CONSTRAINT unique_employee_email UNIQUE (business_id, email)
);

-- 인덱스 생성
CREATE INDEX idx_employees_business ON employees(business_id);
CREATE INDEX idx_employees_user ON employees(user_id);
CREATE INDEX idx_employees_status ON employees(employment_status);

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER update_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();