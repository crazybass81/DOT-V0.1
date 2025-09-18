-- T181-T183: pay_statements 테이블 생성
-- 급여명세서 저장 및 관리

-- 1. 급여명세서 메인 테이블
CREATE TABLE IF NOT EXISTS pay_statements (
    id SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    -- 급여 기간
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    payment_date DATE NOT NULL,

    -- 근무 시간 정보
    regular_hours DECIMAL(10, 2) DEFAULT 0,
    overtime_hours DECIMAL(10, 2) DEFAULT 0,
    night_hours DECIMAL(10, 2) DEFAULT 0,
    holiday_hours DECIMAL(10, 2) DEFAULT 0,
    total_hours DECIMAL(10, 2) GENERATED ALWAYS AS (
        regular_hours + overtime_hours + night_hours + holiday_hours
    ) STORED,

    -- 급여 항목 (원 단위)
    base_pay DECIMAL(12, 0) DEFAULT 0, -- 기본급
    overtime_pay DECIMAL(12, 0) DEFAULT 0, -- 연장수당
    night_pay DECIMAL(12, 0) DEFAULT 0, -- 야간수당
    holiday_pay DECIMAL(12, 0) DEFAULT 0, -- 휴일수당
    weekly_allowance DECIMAL(12, 0) DEFAULT 0, -- 주휴수당
    bonus DECIMAL(12, 0) DEFAULT 0, -- 상여금
    other_allowances DECIMAL(12, 0) DEFAULT 0, -- 기타수당

    -- 총급여 (자동 계산)
    gross_pay DECIMAL(12, 0) GENERATED ALWAYS AS (
        base_pay + overtime_pay + night_pay + holiday_pay +
        weekly_allowance + bonus + other_allowances
    ) STORED,

    -- 공제 항목
    national_pension DECIMAL(12, 0) DEFAULT 0, -- 국민연금
    health_insurance DECIMAL(12, 0) DEFAULT 0, -- 건강보험
    long_term_care DECIMAL(12, 0) DEFAULT 0, -- 장기요양보험
    employment_insurance DECIMAL(12, 0) DEFAULT 0, -- 고용보험
    income_tax DECIMAL(12, 0) DEFAULT 0, -- 소득세
    local_income_tax DECIMAL(12, 0) DEFAULT 0, -- 지방소득세
    other_deductions DECIMAL(12, 0) DEFAULT 0, -- 기타공제

    -- 총공제액 (자동 계산)
    total_deductions DECIMAL(12, 0) GENERATED ALWAYS AS (
        national_pension + health_insurance + long_term_care +
        employment_insurance + income_tax + local_income_tax + other_deductions
    ) STORED,

    -- 실수령액 (자동 계산)
    net_pay DECIMAL(12, 0) GENERATED ALWAYS AS (
        (base_pay + overtime_pay + night_pay + holiday_pay +
        weekly_allowance + bonus + other_allowances) -
        (national_pension + health_insurance + long_term_care +
        employment_insurance + income_tax + local_income_tax + other_deductions)
    ) STORED,

    -- 상태 관리
    status VARCHAR(20) DEFAULT 'draft' CHECK (
        status IN ('draft', 'confirmed', 'paid', 'cancelled', 'revised')
    ),

    -- 메모 및 비고
    notes TEXT,

    -- PDF 파일 경로 (생성된 경우)
    pdf_path VARCHAR(500),

    -- 승인 정보
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,

    -- 지급 정보
    paid_at TIMESTAMP,
    payment_method VARCHAR(20) CHECK (
        payment_method IN ('bank_transfer', 'cash', 'check', NULL)
    ),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 제약조건
    CONSTRAINT valid_pay_period CHECK (pay_period_end >= pay_period_start),
    CONSTRAINT valid_payment_date CHECK (payment_date >= pay_period_end),
    CONSTRAINT positive_hours CHECK (
        regular_hours >= 0 AND overtime_hours >= 0 AND
        night_hours >= 0 AND holiday_hours >= 0
    ),
    CONSTRAINT non_negative_amounts CHECK (
        base_pay >= 0
    )
);

-- 2. 급여 조정 이력 테이블
CREATE TABLE IF NOT EXISTS pay_statement_revisions (
    id SERIAL PRIMARY KEY,
    original_statement_id INTEGER NOT NULL REFERENCES pay_statements(id) ON DELETE CASCADE,
    revised_statement_id INTEGER REFERENCES pay_statements(id) ON DELETE SET NULL,

    revision_reason TEXT NOT NULL,
    revised_by INTEGER NOT NULL REFERENCES users(id),
    revised_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 조정 전 주요 값 저장
    old_gross_pay DECIMAL(12, 0),
    old_net_pay DECIMAL(12, 0),

    -- 조정 후 주요 값 저장
    new_gross_pay DECIMAL(12, 0),
    new_net_pay DECIMAL(12, 0)
);

-- 3. 급여 지급 이력 테이블
CREATE TABLE IF NOT EXISTS pay_statement_payments (
    id SERIAL PRIMARY KEY,
    pay_statement_id INTEGER NOT NULL REFERENCES pay_statements(id) ON DELETE CASCADE,

    -- 지급 정보
    payment_amount DECIMAL(12, 0) NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    payment_reference VARCHAR(100), -- 은행 거래번호 등

    -- 지급 계좌 정보 (암호화 필요)
    bank_name VARCHAR(50),
    account_number VARCHAR(50),
    account_holder VARCHAR(50),

    -- 지급 확인
    confirmed_by INTEGER REFERENCES users(id),
    confirmed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. 인덱스 생성
CREATE INDEX idx_pay_statements_business ON pay_statements(business_id);
CREATE INDEX idx_pay_statements_employee ON pay_statements(employee_id);
CREATE INDEX idx_pay_statements_period ON pay_statements(pay_period_start, pay_period_end);
CREATE INDEX idx_pay_statements_payment_date ON pay_statements(payment_date);
CREATE INDEX idx_pay_statements_status ON pay_statements(status);
CREATE INDEX idx_pay_statement_revisions_original ON pay_statement_revisions(original_statement_id);
CREATE INDEX idx_pay_statement_payments_statement ON pay_statement_payments(pay_statement_id);

-- 5. updated_at 자동 업데이트 트리거
CREATE TRIGGER update_pay_statements_updated_at
    BEFORE UPDATE ON pay_statements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. 급여명세서 변경 시 자동 이력 저장 트리거
CREATE OR REPLACE FUNCTION record_pay_statement_revision()
RETURNS TRIGGER AS $$
BEGIN
    -- 주요 금액이 변경된 경우에만 이력 저장
    IF OLD.gross_pay != NEW.gross_pay OR OLD.net_pay != NEW.net_pay THEN
        INSERT INTO pay_statement_revisions (
            original_statement_id,
            revision_reason,
            revised_by,
            old_gross_pay,
            old_net_pay,
            new_gross_pay,
            new_net_pay
        ) VALUES (
            NEW.id,
            COALESCE(NEW.notes, '시스템 자동 기록'),
            COALESCE(current_setting('app.current_user_id', true)::INTEGER, 1),
            OLD.gross_pay,
            OLD.net_pay,
            NEW.gross_pay,
            NEW.net_pay
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_record_pay_statement_revision
    AFTER UPDATE ON pay_statements
    FOR EACH ROW
    WHEN (OLD.status = 'confirmed' AND NEW.status IN ('confirmed', 'paid'))
    EXECUTE FUNCTION record_pay_statement_revision();

-- 7. 최저임금 검증 함수
CREATE OR REPLACE FUNCTION validate_minimum_wage(
    p_hourly_rate DECIMAL,
    p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)
)
RETURNS BOOLEAN AS $$
DECLARE
    minimum_wage DECIMAL;
BEGIN
    -- 년도별 최저시급 (하드코딩, 실제로는 별도 테이블 관리 권장)
    CASE p_year
        WHEN 2024 THEN minimum_wage := 9860;
        WHEN 2023 THEN minimum_wage := 9620;
        WHEN 2022 THEN minimum_wage := 9160;
        ELSE minimum_wage := 9860; -- 기본값
    END CASE;

    RETURN p_hourly_rate >= minimum_wage;
END;
$$ LANGUAGE plpgsql;