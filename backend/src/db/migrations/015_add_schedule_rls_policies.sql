/**
 * T150: 스케줄 테이블 RLS 정책 구현
 * Row Level Security 정책 설정
 */

-- RLS 활성화
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- schedules 테이블 RLS 정책
-- ==========================================

-- SELECT: 본인 스케줄 또는 같은 사업장 관리자
DROP POLICY IF EXISTS schedules_select_policy ON schedules;
CREATE POLICY schedules_select_policy ON schedules
  FOR SELECT
  USING (
    user_id = current_setting('app.user_id', true)::INTEGER
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = schedules.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
    OR EXISTS (
      -- 같은 사업장의 다른 직원들도 스케줄 조회 가능 (읽기만)
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = schedules.business_id
      AND ur.is_active = true
    )
  );

-- INSERT: 관리자만 생성 가능
DROP POLICY IF EXISTS schedules_insert_policy ON schedules;
CREATE POLICY schedules_insert_policy ON schedules
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = schedules.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- UPDATE: 관리자만 수정 가능
DROP POLICY IF EXISTS schedules_update_policy ON schedules;
CREATE POLICY schedules_update_policy ON schedules
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = schedules.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- DELETE: Owner만 삭제 가능
DROP POLICY IF EXISTS schedules_delete_policy ON schedules;
CREATE POLICY schedules_delete_policy ON schedules
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = schedules.business_id
      AND ur.role_type = 'owner'
      AND ur.is_active = true
    )
  );

-- ==========================================
-- schedule_assignments 테이블 RLS 정책
-- ==========================================

-- SELECT: 본인 관련 요청 또는 관리자
DROP POLICY IF EXISTS assignments_select_policy ON schedule_assignments;
CREATE POLICY assignments_select_policy ON schedule_assignments
  FOR SELECT
  USING (
    requester_id = current_setting('app.user_id', true)::INTEGER
    OR assignee_id = current_setting('app.user_id', true)::INTEGER
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = schedule_assignments.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- INSERT: 본인 요청 또는 관리자 할당
DROP POLICY IF EXISTS assignments_insert_policy ON schedule_assignments;
CREATE POLICY assignments_insert_policy ON schedule_assignments
  FOR INSERT
  WITH CHECK (
    requester_id = current_setting('app.user_id', true)::INTEGER
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = schedule_assignments.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- UPDATE: 관리자만 상태 변경 가능
DROP POLICY IF EXISTS assignments_update_policy ON schedule_assignments;
CREATE POLICY assignments_update_policy ON schedule_assignments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = schedule_assignments.business_id
      AND ur.role_type IN ('owner', 'manager')
      AND ur.is_active = true
    )
  );

-- DELETE: Owner만 삭제 가능
DROP POLICY IF EXISTS assignments_delete_policy ON schedule_assignments;
CREATE POLICY assignments_delete_policy ON schedule_assignments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = current_setting('app.user_id', true)::INTEGER
      AND ur.business_id = schedule_assignments.business_id
      AND ur.role_type = 'owner'
      AND ur.is_active = true
    )
  );