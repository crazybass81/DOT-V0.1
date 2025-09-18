/**
 * T282: 이메일 발송 모듈
 * nodemailer를 사용한 이메일 발송 기능
 */

const nodemailer = require('nodemailer');

// 이메일 설정 (환경변수에서 로드)
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  from: process.env.SMTP_FROM || 'DOT Platform <noreply@dotplatform.com>'
};

// 트랜스포터 생성
let transporter = null;

/**
 * 트랜스포터 초기화
 * @returns {Object} nodemailer 트랜스포터
 */
function initializeTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransporter(EMAIL_CONFIG);
  }
  return transporter;
}

/**
 * 이메일 주소 검증
 * @param {string} email - 검증할 이메일 주소
 * @returns {boolean} 유효성 여부
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 이메일 발송
 * @param {Object} options - 발송 옵션
 * @returns {Promise<Object>} 발송 결과
 */
async function send(options) {
  try {
    const {
      to,
      cc = null,
      bcc = null,
      subject,
      html,
      text,
      attachments = [],
      from = EMAIL_CONFIG.from
    } = options;

    // 수신자 검증
    if (!to || !validateEmail(to)) {
      return {
        success: false,
        error: 'INVALID_EMAIL',
        message: '유효하지 않은 이메일 주소입니다.'
      };
    }

    // 제목 검증
    if (!subject) {
      return {
        success: false,
        error: 'MISSING_SUBJECT',
        message: '이메일 제목이 필요합니다.'
      };
    }

    // 내용 검증
    if (!html && !text) {
      return {
        success: false,
        error: 'MISSING_CONTENT',
        message: '이메일 내용이 필요합니다.'
      };
    }

    // 트랜스포터 초기화
    const transport = initializeTransporter();

    // 이메일 옵션 구성
    const mailOptions = {
      from,
      to,
      subject,
      html,
      text
    };

    // CC 추가
    if (cc && validateEmail(cc)) {
      mailOptions.cc = cc;
    }

    // BCC 추가
    if (bcc && validateEmail(bcc)) {
      mailOptions.bcc = bcc;
    }

    // 첨부파일 추가
    if (attachments.length > 0) {
      mailOptions.attachments = attachments.map(attachment => ({
        filename: attachment.filename,
        path: attachment.path,
        content: attachment.content
      }));
    }

    // 이메일 발송
    const info = await transport.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response
    };

  } catch (error) {
    console.error('이메일 발송 오류:', error);
    return {
      success: false,
      error: 'SEND_FAILED',
      message: error.message,
      details: error
    };
  }
}

/**
 * 대량 이메일 발송
 * @param {Array} recipients - 수신자 목록
 * @param {Object} content - 이메일 내용
 * @param {Object} options - 발송 옵션
 * @returns {Promise<Object>} 발송 결과
 */
async function sendBulk(recipients, content, options = {}) {
  const {
    batchSize = 10,
    delayBetween = 1000,
    personalizeCallback = null
  } = options;

  const results = {
    total: recipients.length,
    sent: 0,
    failed: 0,
    errors: []
  };

  try {
    // 배치 처리
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchPromises = batch.map(async (recipient) => {
        try {
          // 개인화 콜백 적용
          let personalizedContent = content;
          if (personalizeCallback) {
            personalizedContent = await personalizeCallback(recipient, content);
          }

          const result = await send({
            to: recipient.email || recipient,
            subject: personalizedContent.subject || content.subject,
            html: personalizedContent.html || content.html,
            text: personalizedContent.text || content.text
          });

          if (result.success) {
            results.sent++;
          } else {
            results.failed++;
            results.errors.push({
              recipient,
              error: result.error
            });
          }

          return result;
        } catch (error) {
          results.failed++;
          results.errors.push({
            recipient,
            error: error.message
          });
          return { success: false, error: error.message };
        }
      });

      await Promise.all(batchPromises);

      // 배치 간 딜레이
      if (i + batchSize < recipients.length && delayBetween > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetween));
      }
    }

    return {
      success: true,
      data: results
    };

  } catch (error) {
    console.error('대량 이메일 발송 오류:', error);
    return {
      success: false,
      error: error.message,
      data: results
    };
  }
}

/**
 * 이메일 템플릿 발송
 * @param {Object} options - 발송 옵션
 * @returns {Promise<Object>} 발송 결과
 */
async function sendTemplate(options) {
  const {
    to,
    templateName,
    variables = {},
    attachments = []
  } = options;

  try {
    // 템플릿 로드
    const template = await loadTemplate(templateName);
    if (!template) {
      return {
        success: false,
        error: 'TEMPLATE_NOT_FOUND',
        message: `템플릿을 찾을 수 없습니다: ${templateName}`
      };
    }

    // 변수 치환
    let html = template.html;
    let text = template.text || '';
    let subject = template.subject;

    Object.keys(variables).forEach(key => {
      const value = variables[key];
      const placeholder = `{{${key}}}`;
      html = html.replace(new RegExp(placeholder, 'g'), value);
      text = text.replace(new RegExp(placeholder, 'g'), value);
      subject = subject.replace(new RegExp(placeholder, 'g'), value);
    });

    // 발송
    return await send({
      to,
      subject,
      html,
      text,
      attachments
    });

  } catch (error) {
    console.error('템플릿 이메일 발송 오류:', error);
    return {
      success: false,
      error: 'TEMPLATE_SEND_FAILED',
      message: error.message
    };
  }
}

/**
 * 템플릿 로드 (임시 구현)
 * @param {string} templateName - 템플릿 이름
 * @returns {Promise<Object>} 템플릿 데이터
 */
async function loadTemplate(templateName) {
  // TODO: 실제 템플릿 저장소에서 로드
  const templates = {
    'welcome': {
      subject: 'DOT Platform에 오신 것을 환영합니다!',
      html: `
        <h1>환영합니다, {{name}}님!</h1>
        <p>DOT Platform에 가입해주셔서 감사합니다.</p>
        <p>이메일 인증을 위해 아래 링크를 클릭해주세요:</p>
        <a href="{{verificationLink}}">이메일 인증하기</a>
      `,
      text: 'DOT Platform에 오신 것을 환영합니다. 이메일 인증을 완료해주세요.'
    },
    'schedule-notification': {
      subject: '새로운 스케줄이 할당되었습니다',
      html: `
        <h2>스케줄 알림</h2>
        <p>{{name}}님, 새로운 근무 스케줄이 할당되었습니다.</p>
        <ul>
          <li>날짜: {{date}}</li>
          <li>시간: {{startTime}} - {{endTime}}</li>
          <li>장소: {{location}}</li>
        </ul>
      `,
      text: '새로운 근무 스케줄이 할당되었습니다. 앱에서 확인해주세요.'
    },
    'password-reset': {
      subject: '비밀번호 재설정 안내',
      html: `
        <h2>비밀번호 재설정</h2>
        <p>{{name}}님, 비밀번호 재설정을 요청하셨습니다.</p>
        <p>아래 링크를 클릭하여 새 비밀번호를 설정해주세요:</p>
        <a href="{{resetLink}}">비밀번호 재설정</a>
        <p>이 링크는 24시간 동안 유효합니다.</p>
      `,
      text: '비밀번호 재설정 링크가 발송되었습니다. 24시간 이내에 재설정해주세요.'
    }
  };

  return templates[templateName] || null;
}

/**
 * 연결 테스트
 * @returns {Promise<Object>} 테스트 결과
 */
async function testConnection() {
  try {
    const transport = initializeTransporter();
    await transport.verify();

    return {
      success: true,
      message: 'SMTP 서버 연결 성공'
    };

  } catch (error) {
    console.error('SMTP 연결 테스트 실패:', error);
    return {
      success: false,
      error: 'CONNECTION_FAILED',
      message: error.message
    };
  }
}

module.exports = {
  send,
  sendBulk,
  sendTemplate,
  validateEmail,
  testConnection,
  initializeTransporter
};