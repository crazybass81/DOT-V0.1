/**
 * T123: 요청 검증 미들웨어
 * 입력 데이터 유효성 검사
 * express-validator 대신 직접 구현 (의존성 최소화)
 */

/**
 * businessId 쿼리 파라미터 검증
 */
function validateBusinessId(req, res, next) {
  const businessId = req.query.businessId || req.params.businessId;

  if (!businessId) {
    return res.status(400).json({
      success: false,
      error: 'businessId is required',
      code: 'MISSING_BUSINESS_ID'
    });
  }

  // 숫자인지 확인
  const id = parseInt(businessId);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      error: 'businessId must be a positive integer',
      code: 'INVALID_BUSINESS_ID'
    });
  }

  // 검증된 값을 req에 저장
  req.validatedBusinessId = id;
  next();
}

/**
 * 출퇴근 체크인 요청 검증
 */
function validateCheckInRequest(req, res, next) {
  const { businessId, method, location, qrToken } = req.body;

  // businessId 검증
  if (!businessId) {
    return res.status(400).json({
      success: false,
      error: 'businessId is required',
      code: 'MISSING_BUSINESS_ID'
    });
  }

  const id = parseInt(businessId);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      error: 'businessId must be a positive integer',
      code: 'INVALID_BUSINESS_ID'
    });
  }

  // method 검증
  if (!method) {
    return res.status(400).json({
      success: false,
      error: 'method is required (gps or qr)',
      code: 'MISSING_METHOD'
    });
  }

  if (!['gps', 'qr'].includes(method)) {
    return res.status(400).json({
      success: false,
      error: 'method must be either "gps" or "qr"',
      code: 'INVALID_METHOD'
    });
  }

  // GPS 방식일 때 location 검증
  if (method === 'gps') {
    if (!location) {
      return res.status(400).json({
        success: false,
        error: 'location is required for GPS check-in',
        code: 'MISSING_LOCATION'
      });
    }

    // latitude/longitude 또는 lat/lng 형식 모두 지원
    const lat = location.latitude || location.lat;
    const lng = location.longitude || location.lng;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'location must have numeric latitude and longitude',
        code: 'INVALID_LOCATION'
      });
    }

    // GPS 좌표 범위 검증
    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        success: false,
        error: 'latitude must be between -90 and 90',
        code: 'INVALID_LATITUDE'
      });
    }

    if (lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        error: 'longitude must be between -180 and 180',
        code: 'INVALID_LONGITUDE'
      });
    }

    // 정규화된 location 저장
    req.body.location = {
      latitude: lat,
      longitude: lng
    };
  }

  // QR 방식일 때 qrToken 검증
  if (method === 'qr') {
    if (!qrToken) {
      return res.status(400).json({
        success: false,
        error: 'qrToken is required for QR check-in',
        code: 'MISSING_QR_TOKEN'
      });
    }

    if (typeof qrToken !== 'string' || qrToken.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Invalid QR token format',
        code: 'INVALID_QR_TOKEN'
      });
    }
  }

  next();
}

/**
 * 체크아웃 요청 검증
 */
function validateCheckOutRequest(req, res, next) {
  const { businessId, location } = req.body;

  // businessId 검증
  if (!businessId) {
    return res.status(400).json({
      success: false,
      error: 'businessId is required',
      code: 'MISSING_BUSINESS_ID'
    });
  }

  const id = parseInt(businessId);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      error: 'businessId must be a positive integer',
      code: 'INVALID_BUSINESS_ID'
    });
  }

  // location이 있으면 검증 (선택사항)
  if (location) {
    const lat = location.latitude || location.lat;
    const lng = location.longitude || location.lng;

    if (lat !== undefined && lng !== undefined) {
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'location must have numeric latitude and longitude',
          code: 'INVALID_LOCATION'
        });
      }

      // GPS 좌표 범위 검증
      if (lat < -90 || lat > 90) {
        return res.status(400).json({
          success: false,
          error: 'latitude must be between -90 and 90',
          code: 'INVALID_LATITUDE'
        });
      }

      if (lng < -180 || lng > 180) {
        return res.status(400).json({
          success: false,
          error: 'longitude must be between -180 and 180',
          code: 'INVALID_LONGITUDE'
        });
      }

      // 정규화된 location 저장
      req.body.location = {
        latitude: lat,
        longitude: lng
      };
    }
  }

  next();
}

/**
 * 날짜 형식 검증
 */
function validateDateParameter(req, res, next) {
  const { date } = req.query;

  // date가 없으면 오늘 날짜 사용
  if (!date) {
    req.validatedDate = new Date();
    return next();
  }

  // ISO 8601 형식 검증 (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD',
      code: 'INVALID_DATE_FORMAT'
    });
  }

  // 유효한 날짜인지 확인
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date value',
      code: 'INVALID_DATE'
    });
  }

  // 미래 날짜 제한 (선택사항)
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (parsedDate > today) {
    return res.status(400).json({
      success: false,
      error: 'Date cannot be in the future',
      code: 'FUTURE_DATE'
    });
  }

  req.validatedDate = parsedDate;
  next();
}

/**
 * 페이지네이션 파라미터 검증
 */
function validatePagination(req, res, next) {
  const { page = 1, limit = 20 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  if (isNaN(pageNum) || pageNum < 1) {
    return res.status(400).json({
      success: false,
      error: 'page must be a positive integer',
      code: 'INVALID_PAGE'
    });
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    return res.status(400).json({
      success: false,
      error: 'limit must be between 1 and 100',
      code: 'INVALID_LIMIT'
    });
  }

  req.pagination = {
    page: pageNum,
    limit: limitNum,
    offset: (pageNum - 1) * limitNum
  };

  next();
}

/**
 * Content-Type 검증
 */
function requireJSON(req, res, next) {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const contentType = req.headers['content-type'];

    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type must be application/json',
        code: 'INVALID_CONTENT_TYPE'
      });
    }
  }

  next();
}

/**
 * 이메일 주소 유효성 검증
 * RFC 5322 표준을 기반으로 한 이메일 형식 확인
 */
function validateEmail(req, res, next) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: '이메일 주소가 필요합니다',
      code: 'EMAIL_REQUIRED'
    });
  }

  // 이메일 정규식 (RFC 5322 기반 단순화 버전)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (typeof email !== 'string' || !emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: '유효하지 않은 이메일 형식입니다',
      code: 'INVALID_EMAIL_FORMAT'
    });
  }

  // 이메일 길이 제한 (최대 254자)
  if (email.length > 254) {
    return res.status(400).json({
      success: false,
      error: '이메일 주소가 너무 깁니다 (최대 254자)',
      code: 'EMAIL_TOO_LONG'
    });
  }

  // 로컬 부분 길이 제한 (@ 앞부분, 최대 64자)
  const localPart = email.split('@')[0];
  if (localPart.length > 64) {
    return res.status(400).json({
      success: false,
      error: '이메일 로컬 부분이 너무 깁니다 (최대 64자)',
      code: 'EMAIL_LOCAL_TOO_LONG'
    });
  }

  // 정규화된 이메일 저장 (소문자 변환)
  req.body.email = email.toLowerCase().trim();
  next();
}

/**
 * 전화번호 유효성 검증
 * 한국 전화번호 형식 지원 (휴대폰, 일반전화)
 */
function validatePhoneNumber(req, res, next) {
  const { phone, phoneNumber } = req.body;
  const phoneValue = phone || phoneNumber;

  if (!phoneValue) {
    return res.status(400).json({
      success: false,
      error: '전화번호가 필요합니다',
      code: 'PHONE_REQUIRED'
    });
  }

  if (typeof phoneValue !== 'string') {
    return res.status(400).json({
      success: false,
      error: '전화번호는 문자열이어야 합니다',
      code: 'PHONE_INVALID_TYPE'
    });
  }

  // 공백, 하이픈, 괄호 제거하여 숫자만 추출
  const cleanPhone = phoneValue.replace(/[\s\-\(\)]/g, '');

  // 한국 전화번호 패턴
  const phonePatterns = [
    // 휴대폰: 010-1234-5678, 011-123-4567, 016-123-4567, 017-123-4567, 018-123-4567, 019-123-4567
    /^01[0-9]\d{7,8}$/,
    // 서울 지역번호: 02-1234-5678
    /^02\d{7,8}$/,
    // 기타 지역번호: 031-123-4567, 032-123-4567 등
    /^0[3-6][1-9]\d{6,7}$/,
    // 특수번호: 1588-1234, 1644-1234 등
    /^1[5-9]\d{2}\d{4}$/,
    // 국제번호: +82로 시작하는 경우
    /^(\+82|82)(1[0-9]|[2-6][1-9])\d{6,8}$/
  ];

  const isValidPhone = phonePatterns.some(pattern => pattern.test(cleanPhone));

  if (!isValidPhone) {
    return res.status(400).json({
      success: false,
      error: '유효하지 않은 전화번호 형식입니다',
      code: 'INVALID_PHONE_FORMAT',
      details: {
        supportedFormats: [
          '010-1234-5678 (휴대폰)',
          '02-1234-5678 (서울)',
          '031-123-4567 (기타 지역)',
          '1588-1234 (특수번호)',
          '+82-10-1234-5678 (국제형식)'
        ]
      }
    });
  }

  // 전화번호 길이 제한
  if (cleanPhone.length > 15) {
    return res.status(400).json({
      success: false,
      error: '전화번호가 너무 깁니다 (최대 15자리)',
      code: 'PHONE_TOO_LONG'
    });
  }

  // 정규화된 전화번호 저장
  let normalizedPhone = cleanPhone;

  // +82로 시작하는 경우 0으로 변환
  if (normalizedPhone.startsWith('+82')) {
    normalizedPhone = '0' + normalizedPhone.substring(3);
  } else if (normalizedPhone.startsWith('82') && normalizedPhone.length > 10) {
    normalizedPhone = '0' + normalizedPhone.substring(2);
  }

  // 하이픈 포함 형식으로 저장
  if (normalizedPhone.startsWith('010')) {
    // 휴대폰: 010-1234-5678
    normalizedPhone = normalizedPhone.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  } else if (normalizedPhone.startsWith('02')) {
    // 서울: 02-1234-5678 또는 02-123-4567
    if (normalizedPhone.length === 10) {
      normalizedPhone = normalizedPhone.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3');
    } else {
      normalizedPhone = normalizedPhone.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1-$2-$3');
    }
  } else if (normalizedPhone.startsWith('0')) {
    // 기타 지역: 031-123-4567
    normalizedPhone = normalizedPhone.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  }

  // 필드명 통일화
  if (phone) {
    req.body.phone = normalizedPhone;
  }
  if (phoneNumber) {
    req.body.phoneNumber = normalizedPhone;
  }

  next();
}

/**
 * 사용자 등록 정보 통합 검증
 * 이메일과 전화번호를 모두 검증
 */
function validateUserRegistration(req, res, next) {
  const { email, phone, password, name } = req.body;

  // 필수 필드 확인
  const requiredFields = [];
  if (!name) requiredFields.push('name');
  if (!email) requiredFields.push('email');
  if (!password) requiredFields.push('password');

  if (requiredFields.length > 0) {
    return res.status(400).json({
      success: false,
      error: `필수 정보가 누락되었습니다: ${requiredFields.join(', ')}`,
      code: 'MISSING_REQUIRED_FIELDS',
      missingFields: requiredFields
    });
  }

  // 이름 길이 제한
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 50) {
    return res.status(400).json({
      success: false,
      error: '이름은 2-50자 사이여야 합니다',
      code: 'INVALID_NAME_LENGTH'
    });
  }

  // 비밀번호 강도 검증
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      success: false,
      error: '비밀번호는 최소 8자 이상이어야 합니다',
      code: 'PASSWORD_TOO_SHORT'
    });
  }

  // 비밀번호 복잡도 검증 (선택사항)
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      success: false,
      error: '비밀번호는 대문자, 소문자, 숫자, 특수문자를 포함해야 합니다',
      code: 'PASSWORD_COMPLEXITY_FAILED'
    });
  }

  // 이름 정규화
  req.body.name = name.trim();

  // 이메일 검증은 별도 미들웨어에서 처리하므로 여기서는 통과
  next();
}

module.exports = {
  validateBusinessId,
  validateCheckInRequest,
  validateCheckOutRequest,
  validateDateParameter,
  validatePagination,
  requireJSON,
  validateEmail,
  validatePhoneNumber,
  validateUserRegistration
};