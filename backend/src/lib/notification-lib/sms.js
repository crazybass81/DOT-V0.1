/**
 * SMS 발송 모듈 (준비)
 * 향후 Twilio, AWS SNS 등 연동 예정
 */

/**
 * 전화번호 검증
 * @param {string} phone - 전화번호
 * @returns {boolean} 유효성 여부
 */
function validatePhone(phone) {
  // 한국 전화번호 형식 검증
  const phoneRegex = /^01[0-9]{1}-?[0-9]{3,4}-?[0-9]{4}$/;
  const cleaned = phone.replace(/-/g, '');
  return phoneRegex.test(phone) || phoneRegex.test(cleaned);
}

/**
 * 전화번호 정규화
 * @param {string} phone - 전화번호
 * @returns {string} 정규화된 전화번호
 */
function normalizePhone(phone) {
  // 하이픈 제거
  let normalized = phone.replace(/-/g, '');

  // 국가번호 추가 (한국)
  if (normalized.startsWith('01')) {
    normalized = '+82' + normalized.substring(1);
  }

  return normalized;
}

/**
 * SMS 발송
 * @param {Object} options - 발송 옵션
 * @returns {Promise<Object>} 발송 결과
 */
async function send(options) {
  try {
    const {
      to,
      message,
      from = process.env.SMS_FROM || 'DOT'
    } = options;

    // 수신자 검증
    if (!to || !validatePhone(to)) {
      return {
        success: false,
        error: 'INVALID_PHONE',
        message: '유효하지 않은 전화번호입니다.'
      };
    }

    // 메시지 검증
    if (!message) {
      return {
        success: false,
        error: 'MISSING_MESSAGE',
        message: 'SMS 메시지가 필요합니다.'
      };
    }

    // 메시지 길이 확인 (SMS는 80자, LMS는 2000자)
    if (message.length > 2000) {
      return {
        success: false,
        error: 'MESSAGE_TOO_LONG',
        message: 'SMS 메시지는 2000자를 초과할 수 없습니다.'
      };
    }

    const normalizedPhone = normalizePhone(to);
    const messageType = message.length > 80 ? 'LMS' : 'SMS';

    // TODO: 실제 SMS 서비스 연동
    // 현재는 시뮬레이션
    console.log(`[SMS 시뮬레이션] To: ${normalizedPhone}, Type: ${messageType}, Message: ${message}`);

    // 시뮬레이션 결과
    return {
      success: true,
      messageId: `SMS_${Date.now()}`,
      to: normalizedPhone,
      from,
      type: messageType,
      length: message.length,
      segments: Math.ceil(message.length / 80),
      simulationMode: true
    };

  } catch (error) {
    console.error('SMS 발송 오류:', error);
    return {
      success: false,
      error: 'SEND_FAILED',
      message: error.message
    };
  }
}

/**
 * 대량 SMS 발송
 * @param {Array} recipients - 수신자 목록
 * @param {string} message - 메시지
 * @param {Object} options - 발송 옵션
 * @returns {Promise<Object>} 발송 결과
 */
async function sendBulk(recipients, message, options = {}) {
  const {
    batchSize = 10,
    delayBetween = 500
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
          const phone = typeof recipient === 'string' ? recipient : recipient.phone;
          const result = await send({
            to: phone,
            message
          });

          if (result.success) {
            results.sent++;
          } else {
            results.failed++;
            results.errors.push({
              recipient: phone,
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
    console.error('대량 SMS 발송 오류:', error);
    return {
      success: false,
      error: error.message,
      data: results
    };
  }
}

/**
 * SMS 비용 계산 (예상)
 * @param {string} message - 메시지
 * @param {number} count - 발송 수
 * @returns {Object} 비용 정보
 */
function calculateCost(message, count = 1) {
  const messageLength = message.length;
  const messageType = messageLength > 80 ? 'LMS' : 'SMS';
  const segments = Math.ceil(messageLength / 80);

  // 가상의 요금 (실제 서비스 요금으로 변경 필요)
  const rates = {
    SMS: 20, // 원 per segment
    LMS: 50  // 원 per message
  };

  const unitCost = messageType === 'SMS' ? rates.SMS * segments : rates.LMS;
  const totalCost = unitCost * count;

  return {
    messageType,
    segments,
    unitCost,
    totalCost,
    count,
    currency: 'KRW'
  };
}

/**
 * 발송 가능 여부 확인
 * @returns {Object} 서비스 상태
 */
async function checkService() {
  // TODO: 실제 SMS 서비스 상태 확인
  return {
    available: false,
    provider: 'None',
    balance: 0,
    message: 'SMS 서비스가 아직 구성되지 않았습니다.',
    simulationMode: true
  };
}

module.exports = {
  send,
  sendBulk,
  validatePhone,
  normalizePhone,
  calculateCost,
  checkService
};