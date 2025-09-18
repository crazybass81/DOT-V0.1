/**
 * T184-T185: pay_statements 테이블 RLS 정책
 * Row Level Security 정책 설정
 */

-- RLS 활성화
ALTER TABLE pay_statements ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- pay_statements 테이블 RLS 정책
-- ==========================================

-- SELECT: 본인 명세서 또는 사업장 관리자/소유자
DROP POLICY IF EXISTS pay_statements_select_policy ON pay_statements;
CREATE POLICY pay_statements_select_policy ON pay_statements
  FOR SELECT
  USING (
    -- 본인의 급여명세서
    user_id = current_setting('app.user_id', true)::INTEGER
    OR EXISTS (
      -- 사업장 관리자/소유자
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = pay_statements.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- INSERT: 관리자/소유자만 생성 가능
DROP POLICY IF EXISTS pay_statements_insert_policy ON pay_statements;
CREATE POLICY pay_statements_insert_policy ON pay_statements
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = pay_statements.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- UPDATE: 관리자/소유자만 수정 가능, draft 상태만
DROP POLICY IF EXISTS pay_statements_update_policy ON pay_statements;
CREATE POLICY pay_statements_update_policy ON pay_statements
  FOR UPDATE
  USING (
    -- draft 상태인 경우에만 수정 가능
    status = 'draft'
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = pay_statements.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- DELETE: Owner만 삭제 가능, draft 상태만
DROP POLICY IF EXISTS pay_statements_delete_policy ON pay_statements;
CREATE POLICY pay_statements_delete_policy ON pay_statements
  FOR DELETE
  USING (
    -- draft 상태인 경우에만 삭제 가능
    status = 'draft'
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = pay_statements.business_id
      AND ur.role_type = 'owner'
      AND ur.is_active = true
    )
  );

-- ==========================================
-- pay_statement_details 테이블 생성 (상세 내역 저장용)
-- ==========================================

CREATE TABLE IF NOT EXISTS pay_statement_details (
  id SERIAL PRIMARY KEY,
  statement_id INTEGER NOT NULL REFERENCES pay_statements(id) ON DELETE CASCADE,

  -- 상세 내역 타입
  detail_type VARCHAR(20) NOT NULL,
  -- attendance: 근태 기록, schedule: 스케줄 기록, adjustment: 조정 사항

  -- 참조 데이터
  reference_date DATE,
  reference_id INTEGER, -- attendance_id, schedule_id 등

  -- 계산 내역
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2),
  rate INTEGER,
  amount INTEGER NOT NULL,

  -- 타임스탬프
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_pay_statement_details_statement_id ON pay_statement_details(statement_id);
CREATE INDEX idx_pay_statement_details_type ON pay_statement_details(detail_type);

-- RLS 활성화
ALTER TABLE pay_statement_details ENABLE ROW LEVEL SECURITY;

-- SELECT: pay_statements 테이블과 동일한 정책
DROP POLICY IF EXISTS pay_statement_details_select_policy ON pay_statement_details;
CREATE POLICY pay_statement_details_select_policy ON pay_statement_details
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pay_statements ps
      WHERE ps.id = pay_statement_details.statement_id
      AND (
        ps.user_id = current_setting('app.user_id', true)::INTEGER
        OR EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
          AND ur.business_id = ps.business_id
          AND ur.role_type IN ('owner', 'manager')
          AND ur.is_active = true
        )
      )
    )
  );

-- INSERT: 관리자/소유자만 생성 가능
DROP POLICY IF EXISTS pay_statement_details_insert_policy ON pay_statement_details;
CREATE POLICY pay_statement_details_insert_policy ON pay_statement_details
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pay_statements ps
      JOIN user_roles ur ON ur.business_id = ps.business_id
      WHERE ps.id = pay_statement_details.statement_id
      AND ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
      AND ps.status = 'draft'
    )
  );

-- UPDATE: 불가 (상세 내역은 수정 불가, 삭제 후 재생성)
DROP POLICY IF EXISTS pay_statement_details_update_policy ON pay_statement_details;
CREATE POLICY pay_statement_details_update_policy ON pay_statement_details
  FOR UPDATE
  USING (false);

-- DELETE: 관리자/소유자만 삭제 가능, draft 상태만
DROP POLICY IF EXISTS pay_statement_details_delete_policy ON pay_statement_details;
CREATE POLICY pay_statement_details_delete_policy ON pay_statement_details
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM pay_statements ps
      JOIN user_roles ur ON ur.business_id = ps.business_id
      WHERE ps.id = pay_statement_details.statement_id
      AND ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
      AND ps.status = 'draft'
    )
  );

-- ==========================================
-- 급여명세서 이력 관리를 위한 감사 테이블
-- ==========================================

CREATE TABLE IF NOT EXISTS pay_statement_audit (
  id SERIAL PRIMARY KEY,
  statement_id INTEGER NOT NULL,
  business_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,

  -- 감사 정보
  action VARCHAR(20) NOT NULL, -- create, update, confirm, cancel, revise
  changed_by INTEGER NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 변경 전 데이터 (JSON)
  old_data JSONB,
  -- 변경 후 데이터 (JSON)
  new_data JSONB,

  -- 변경 사유
  change_reason TEXT,

  -- 인덱스용 필드
  year INTEGER NOT NULL,
  month INTEGER NOT NULL
);

-- 인덱스 생성
CREATE INDEX idx_pay_statement_audit_statement_id ON pay_statement_audit(statement_id);
CREATE INDEX idx_pay_statement_audit_business_id ON pay_statement_audit(business_id);
CREATE INDEX idx_pay_statement_audit_user_id ON pay_statement_audit(user_id);
CREATE INDEX idx_pay_statement_audit_action ON pay_statement_audit(action);
CREATE INDEX idx_pay_statement_audit_changed_at ON pay_statement_audit(changed_at);

-- 감사 트리거 함수
CREATE OR REPLACE FUNCTION audit_pay_statement_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pay_statement_audit (
      statement_id, business_id, user_id,
      action, changed_by, new_data, year, month
    ) VALUES (
      NEW.id, NEW.business_id, NEW.user_id,
      'create', current_setting('app.user_id', true)::INTEGER,
      row_to_json(NEW)::jsonb, NEW.year, NEW.month
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- 상태 변경에 따른 액션 구분
    IF OLD.status != NEW.status THEN
      IF NEW.status = 'confirmed' THEN
        INSERT INTO pay_statement_audit (
          statement_id, business_id, user_id,
          action, changed_by, old_data, new_data, year, month
        ) VALUES (
          NEW.id, NEW.business_id, NEW.user_id,
          'confirm', current_setting('app.user_id', true)::INTEGER,
          row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb,
          NEW.year, NEW.month
        );
      ELSIF NEW.status = 'cancelled' THEN
        INSERT INTO pay_statement_audit (
          statement_id, business_id, user_id,
          action, changed_by, old_data, new_data, year, month
        ) VALUES (
          NEW.id, NEW.business_id, NEW.user_id,
          'cancel', current_setting('app.user_id', true)::INTEGER,
          row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb,
          NEW.year, NEW.month
        );
      ELSIF NEW.status = 'revised' THEN
        INSERT INTO pay_statement_audit (
          statement_id, business_id, user_id,
          action, changed_by, old_data, new_data, year, month
        ) VALUES (
          NEW.id, NEW.business_id, NEW.user_id,
          'revise', current_setting('app.user_id', true)::INTEGER,
          row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb,
          NEW.year, NEW.month
        );
      END IF;
    ELSE
      -- 일반 업데이트
      INSERT INTO pay_statement_audit (
        statement_id, business_id, user_id,
        action, changed_by, old_data, new_data, year, month
      ) VALUES (
        NEW.id, NEW.business_id, NEW.user_id,
        'update', current_setting('app.user_id', true)::INTEGER,
        row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb,
        NEW.year, NEW.month
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 감사 트리거 생성
DROP TRIGGER IF EXISTS audit_pay_statement_trigger ON pay_statements;
CREATE TRIGGER audit_pay_statement_trigger
  AFTER INSERT OR UPDATE ON pay_statements
  FOR EACH ROW
  EXECUTE FUNCTION audit_pay_statement_changes();