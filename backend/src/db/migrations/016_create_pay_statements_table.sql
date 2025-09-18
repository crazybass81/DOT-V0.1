/**
 * T181-T182: pay_statements 테이블 생성
 * 급여명세서 저장 테이블
 */

-- pay_statements 테이블: 급여명세서 메인 테이블
CREATE TABLE IF NOT EXISTS pay_statements (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 급여 기간
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- 근무 시간 정보
  total_work_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  regular_work_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  overtime_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  night_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  weekend_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  holiday_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,

  -- 급여 내역 (단위: 원)
  base_wage INTEGER NOT NULL,
  hourly_wage INTEGER NOT NULL,
  regular_pay INTEGER NOT NULL DEFAULT 0,
  overtime_pay INTEGER NOT NULL DEFAULT 0,
  night_shift_pay INTEGER NOT NULL DEFAULT 0,
  weekend_pay INTEGER NOT NULL DEFAULT 0,
  holiday_pay INTEGER NOT NULL DEFAULT 0,

  -- 수당 내역
  weekly_rest_allowance INTEGER NOT NULL DEFAULT 0,
  annual_leave_allowance INTEGER NOT NULL DEFAULT 0,
  meal_allowance INTEGER NOT NULL DEFAULT 0,
  transport_allowance INTEGER NOT NULL DEFAULT 0,
  family_allowance INTEGER NOT NULL DEFAULT 0,
  position_allowance INTEGER NOT NULL DEFAULT 0,
  longevity_allowance INTEGER NOT NULL DEFAULT 0,
  other_allowances INTEGER NOT NULL DEFAULT 0,
  total_allowances INTEGER NOT NULL DEFAULT 0,

  -- 공제 내역
  national_pension INTEGER NOT NULL DEFAULT 0,
  health_insurance INTEGER NOT NULL DEFAULT 0,
  long_term_care INTEGER NOT NULL DEFAULT 0,
  employment_insurance INTEGER NOT NULL DEFAULT 0,
  income_tax INTEGER NOT NULL DEFAULT 0,
  local_income_tax INTEGER NOT NULL DEFAULT 0,
  other_deductions INTEGER NOT NULL DEFAULT 0,
  total_deductions INTEGER NOT NULL DEFAULT 0,

  -- 총계
  gross_pay INTEGER NOT NULL,
  net_pay INTEGER NOT NULL,

  -- 상태 관리
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- draft: 임시저장, confirmed: 확정, paid: 지급완료, revised: 수정됨, cancelled: 취소

  -- 지급 정보
  payment_date DATE,
  payment_method VARCHAR(20), -- bank_transfer, cash, check
  payment_account VARCHAR(100), -- 계좌번호 (암호화 저장)

  -- 메타데이터
  notes TEXT,
  revision_number INTEGER NOT NULL DEFAULT 1,
  previous_statement_id INTEGER REFERENCES pay_statements(id),

  -- 승인 정보
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at TIMESTAMP WITH TIME ZONE,

  -- 타임스탬프
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성 (T183)
CREATE INDEX idx_pay_statements_business_id ON pay_statements(business_id);
CREATE INDEX idx_pay_statements_user_id ON pay_statements(user_id);
CREATE INDEX idx_pay_statements_year_month ON pay_statements(year, month);
CREATE INDEX idx_pay_statements_status ON pay_statements(status);
CREATE INDEX idx_pay_statements_payment_date ON pay_statements(payment_date);

-- 복합 인덱스
CREATE INDEX idx_pay_statements_business_period ON pay_statements(business_id, year, month);
CREATE INDEX idx_pay_statements_user_period ON pay_statements(user_id, year, month);

-- 유니크 제약 조건: 같은 기간에 대해 사용자당 하나의 확정된 명세서만 허용
CREATE UNIQUE INDEX unique_confirmed_statement
  ON pay_statements(user_id, year, month, status)
  WHERE status IN ('confirmed', 'paid');

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_pay_statements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pay_statements_updated_at ON pay_statements;
CREATE TRIGGER pay_statements_updated_at
  BEFORE UPDATE ON pay_statements
  FOR EACH ROW
  EXECUTE FUNCTION update_pay_statements_updated_at();

-- 급여명세서 유효성 검증 함수
CREATE OR REPLACE FUNCTION validate_pay_statement()
RETURNS TRIGGER AS $$
BEGIN
  -- 총 지급액 검증
  IF NEW.gross_pay != (
    NEW.regular_pay + NEW.overtime_pay + NEW.night_shift_pay +
    NEW.weekend_pay + NEW.holiday_pay + NEW.total_allowances
  ) THEN
    RAISE EXCEPTION '총 지급액 계산이 일치하지 않습니다';
  END IF;

  -- 실수령액 검증
  IF NEW.net_pay != (NEW.gross_pay - NEW.total_deductions) THEN
    RAISE EXCEPTION '실수령액 계산이 일치하지 않습니다';
  END IF;

  -- 최저임금 체크 (2024년 기준 시급 9,860원)
  IF NEW.hourly_wage < 9860 THEN
    RAISE WARNING '시급이 최저임금(9,860원) 미만입니다';
  END IF;

  -- 음수 값 체크
  IF NEW.net_pay < 0 THEN
    RAISE EXCEPTION '실수령액이 음수일 수 없습니다';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_pay_statement ON pay_statements;
CREATE TRIGGER validate_pay_statement
  BEFORE INSERT OR UPDATE ON pay_statements
  FOR EACH ROW
  EXECUTE FUNCTION validate_pay_statement();