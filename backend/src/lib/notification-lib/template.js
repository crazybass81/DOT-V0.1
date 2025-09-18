/**
 * T283: 알림 템플릿 관리 모듈
 * 템플릿 등록, 렌더링, 변수 치환
 */

// 템플릿 저장소 (실제로는 DB에 저장)
const templates = new Map();

// 기본 템플릿
const DEFAULT_TEMPLATES = {
  // 인증 관련
  'auth.welcome': {
    id: 'auth.welcome',
    name: '회원가입 환영',
    category: 'auth',
    subject: 'DOT Platform에 오신 것을 환영합니다!',
    body: `
안녕하세요 {{userName}}님,

DOT Platform에 가입해주셔서 감사합니다.
이메일 인증을 완료하시면 모든 서비스를 이용하실 수 있습니다.

인증 코드: {{verificationCode}}

감사합니다.
DOT Platform 팀
    `,
    variables: ['userName', 'verificationCode']
  },

  'auth.password-reset': {
    id: 'auth.password-reset',
    name: '비밀번호 재설정',
    category: 'auth',
    subject: '[DOT] 비밀번호 재설정 안내',
    body: `
{{userName}}님,

비밀번호 재설정을 요청하셨습니다.
아래 코드를 입력하여 새 비밀번호를 설정하세요.

재설정 코드: {{resetCode}}
유효시간: {{expiryTime}}

본인이 요청하지 않으셨다면 이 메일을 무시하세요.
    `,
    variables: ['userName', 'resetCode', 'expiryTime']
  },

  // 근태 관련
  'attendance.check-in': {
    id: 'attendance.check-in',
    name: '출근 확인',
    category: 'attendance',
    subject: '[{{businessName}}] 출근이 확인되었습니다',
    body: `
{{userName}}님의 출근이 확인되었습니다.

출근 시간: {{checkInTime}}
위치: {{location}}
사업장: {{businessName}}

오늘도 좋은 하루 되세요!
    `,
    variables: ['userName', 'checkInTime', 'location', 'businessName']
  },

  'attendance.check-out': {
    id: 'attendance.check-out',
    name: '퇴근 확인',
    category: 'attendance',
    subject: '[{{businessName}}] 퇴근이 확인되었습니다',
    body: `
{{userName}}님의 퇴근이 확인되었습니다.

퇴근 시간: {{checkOutTime}}
근무 시간: {{workHours}}시간 {{workMinutes}}분
사업장: {{businessName}}

수고하셨습니다!
    `,
    variables: ['userName', 'checkOutTime', 'workHours', 'workMinutes', 'businessName']
  },

  // 스케줄 관련
  'schedule.assigned': {
    id: 'schedule.assigned',
    name: '스케줄 할당',
    category: 'schedule',
    subject: '[{{businessName}}] 새로운 근무 스케줄',
    body: `
{{userName}}님께 새로운 근무가 할당되었습니다.

날짜: {{date}}
시간: {{startTime}} ~ {{endTime}}
사업장: {{businessName}}
비고: {{notes}}

스케줄을 확인하고 준비해주세요.
    `,
    variables: ['userName', 'date', 'startTime', 'endTime', 'businessName', 'notes']
  },

  'schedule.reminder': {
    id: 'schedule.reminder',
    name: '스케줄 리마인더',
    category: 'schedule',
    subject: '[알림] {{hoursUntil}}시간 후 근무 예정',
    body: `
{{userName}}님,

{{hoursUntil}}시간 후 근무가 예정되어 있습니다.

날짜: {{date}}
시간: {{startTime}} ~ {{endTime}}
사업장: {{businessName}}

미리 준비해주세요.
    `,
    variables: ['userName', 'hoursUntil', 'date', 'startTime', 'endTime', 'businessName']
  },

  'schedule.swap-request': {
    id: 'schedule.swap-request',
    name: '교대 요청',
    category: 'schedule',
    subject: '[{{businessName}}] 근무 교대 요청',
    body: `
{{targetUserName}}님,

{{requesterName}}님이 근무 교대를 요청하셨습니다.

요청자 근무: {{requesterSchedule}}
대상자 근무: {{targetSchedule}}
사유: {{reason}}

앱에서 수락 또는 거절해주세요.
    `,
    variables: ['targetUserName', 'requesterName', 'requesterSchedule', 'targetSchedule', 'reason', 'businessName']
  },

  // 급여 관련
  'payroll.statement': {
    id: 'payroll.statement',
    name: '급여명세서',
    category: 'payroll',
    subject: '[{{businessName}}] {{month}}월 급여명세서',
    body: `
{{userName}}님의 {{month}}월 급여명세서입니다.

총 근무시간: {{totalHours}}시간
기본급: {{basePay}}원
수당: {{allowance}}원
공제: {{deduction}}원
실수령액: {{netPay}}원

자세한 내용은 앱에서 확인하세요.
    `,
    variables: ['userName', 'month', 'totalHours', 'basePay', 'allowance', 'deduction', 'netPay', 'businessName']
  }
};

// 초기화 - 기본 템플릿 로드
function initialize() {
  Object.values(DEFAULT_TEMPLATES).forEach(template => {
    templates.set(template.id, template);
  });
}

/**
 * 템플릿 등록
 * @param {Object} templateData - 템플릿 데이터
 * @returns {Object} 등록 결과
 */
function register(templateData) {
  try {
    const {
      id,
      name,
      category,
      subject,
      body,
      variables = []
    } = templateData;

    // 필수 필드 검증
    if (!id || !name || !subject || !body) {
      return {
        success: false,
        error: 'MISSING_FIELDS',
        message: 'ID, 이름, 제목, 본문은 필수입니다.'
      };
    }

    // 변수 추출
    const extractedVars = extractVariables(subject + ' ' + body);
    const allVariables = [...new Set([...variables, ...extractedVars])];

    // 템플릿 저장
    const template = {
      id,
      name,
      category: category || 'custom',
      subject,
      body,
      variables: allVariables,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    templates.set(id, template);

    return {
      success: true,
      data: template
    };

  } catch (error) {
    console.error('템플릿 등록 오류:', error);
    return {
      success: false,
      error: 'REGISTER_FAILED',
      message: error.message
    };
  }
}

/**
 * 템플릿 렌더링
 * @param {string} templateId - 템플릿 ID
 * @param {Object} data - 치환할 데이터
 * @returns {Object} 렌더링 결과
 */
function render(templateId, data = {}) {
  try {
    const template = templates.get(templateId);

    if (!template) {
      return {
        success: false,
        error: 'TEMPLATE_NOT_FOUND',
        message: `템플릿을 찾을 수 없습니다: ${templateId}`
      };
    }

    // 변수 치환
    let subject = template.subject;
    let body = template.body;

    // 필수 변수 확인
    const missingVars = [];
    template.variables.forEach(variable => {
      if (!(variable in data)) {
        missingVars.push(variable);
      }
    });

    if (missingVars.length > 0) {
      return {
        success: false,
        error: 'MISSING_VARIABLES',
        message: `필수 변수가 누락되었습니다: ${missingVars.join(', ')}`,
        missingVariables: missingVars
      };
    }

    // 변수 치환 수행
    Object.keys(data).forEach(key => {
      const value = data[key] || '';
      const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      subject = subject.replace(pattern, value);
      body = body.replace(pattern, value);
    });

    return {
      success: true,
      content: {
        subject,
        body,
        text: body // 텍스트 버전 (HTML 태그 제거된 버전 필요시 처리)
      }
    };

  } catch (error) {
    console.error('템플릿 렌더링 오류:', error);
    return {
      success: false,
      error: 'RENDER_FAILED',
      message: error.message
    };
  }
}

/**
 * 변수 추출
 * @param {string} content - 컨텐츠
 * @returns {Array} 변수 목록
 */
function extractVariables(content) {
  const pattern = /{{\\s*([^}]+)\\s*}}/g;
  const variables = [];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    variables.push(match[1].trim());
  }

  return [...new Set(variables)];
}

/**
 * 템플릿 조회
 * @param {string} templateId - 템플릿 ID
 * @returns {Object} 템플릿
 */
function getTemplate(templateId) {
  return templates.get(templateId) || null;
}

/**
 * 템플릿 목록 조회
 * @param {string} category - 카테고리 (선택)
 * @returns {Array} 템플릿 목록
 */
function listTemplates(category = null) {
  const templateList = Array.from(templates.values());

  if (category) {
    return templateList.filter(t => t.category === category);
  }

  return templateList;
}

/**
 * 템플릿 삭제
 * @param {string} templateId - 템플릿 ID
 * @returns {boolean} 삭제 성공 여부
 */
function deleteTemplate(templateId) {
  // 기본 템플릿은 삭제 불가
  if (DEFAULT_TEMPLATES[templateId]) {
    return false;
  }

  return templates.delete(templateId);
}

/**
 * 템플릿 업데이트
 * @param {string} templateId - 템플릿 ID
 * @param {Object} updates - 업데이트 내용
 * @returns {Object} 업데이트 결과
 */
function updateTemplate(templateId, updates) {
  try {
    const template = templates.get(templateId);

    if (!template) {
      return {
        success: false,
        error: 'TEMPLATE_NOT_FOUND'
      };
    }

    // 업데이트 적용
    const updatedTemplate = {
      ...template,
      ...updates,
      id: templateId, // ID는 변경 불가
      updatedAt: new Date()
    };

    // 변수 재추출
    if (updates.subject || updates.body) {
      const content = (updatedTemplate.subject || '') + ' ' + (updatedTemplate.body || '');
      updatedTemplate.variables = extractVariables(content);
    }

    templates.set(templateId, updatedTemplate);

    return {
      success: true,
      data: updatedTemplate
    };

  } catch (error) {
    console.error('템플릿 업데이트 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 초기화 실행
initialize();

module.exports = {
  register,
  render,
  getTemplate,
  listTemplates,
  deleteTemplate,
  updateTemplate,
  extractVariables,
  DEFAULT_TEMPLATES
};