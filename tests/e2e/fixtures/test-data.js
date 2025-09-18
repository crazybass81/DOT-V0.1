/**
 * T129: 테스트 데이터 시드 스크립트
 * E2E 테스트에서 사용할 일관된 테스트 데이터 관리
 * 실제 데이터베이스와 동기화된 테스트 피클쳐
 */

/**
 * 테스트 사용자 데이터
 * ID는 9000번대를 사용하여 실제 데이터와 구분
 */
const testUsers = {
  owner: {
    id: 9001,
    name: 'E2E 사업주',
    email: 'owner@e2e.test',
    phone: '010-0001-0001',
    password: 'test123!@#',
    status: 'active',
    roles: ['owner']
  },
  admin: {
    id: 9002,
    name: 'E2E 관리자',
    email: 'admin@e2e.test',
    phone: '010-0002-0002',
    password: 'test123!@#',
    status: 'active',
    roles: ['admin']
  },
  worker: {
    id: 9003,
    name: 'E2E 직원',
    email: 'worker@e2e.test',
    phone: '010-0003-0003',
    password: 'test123!@#',
    status: 'active',
    roles: ['worker']
  },
  seeker: {
    id: 9004,
    name: 'E2E 구직자',
    email: 'seeker@e2e.test',
    phone: '010-0004-0004',
    password: 'test123!@#',
    status: 'active',
    roles: ['seeker']
  },
  manager: {
    id: 9005,
    name: 'E2E 매니저',
    email: 'manager@e2e.test',
    phone: '010-0005-0005',
    password: 'test123!@#',
    status: 'active',
    roles: ['manager']
  }
};

/**
 * 테스트 사업장 데이터
 */
const testBusinesses = {
  cafe: {
    id: 9001,
    ownerId: 9001,
    name: 'E2E 테스트 카페',
    registrationNumber: '123-45-67890',
    businessType: 'corporation',
    industryType: 'food_service',
    address: '서울시 강남구 테스트로 123',
    phone: '02-0001-0001',
    email: 'test@cafe.e2e',
    status: 'active',
    location: {
      latitude: 37.4979,
      longitude: 127.0276
    },
    gpsRadiusMeters: 50,
    workingHours: {
      start: '09:00',
      end: '18:00',
      breakStart: '12:00',
      breakEnd: '13:00'
    }
  },
  restaurant: {
    id: 9002,
    ownerId: 9002,
    name: 'E2E 테스트 레스토랑',
    registrationNumber: '987-65-43210',
    businessType: 'corporation',
    industryType: 'food_service',
    address: '서울시 서초구 테스트길 456',
    phone: '02-0002-0002',
    email: 'test@restaurant.e2e',
    status: 'active',
    location: {
      latitude: 37.4833,
      longitude: 127.0322
    },
    gpsRadiusMeters: 100,
    workingHours: {
      start: '10:00',
      end: '22:00',
      breakStart: '15:00',
      breakEnd: '16:00'
    }
  }
};

/**
 * 테스트 사용자 역할 매핑
 */
const testUserRoles = [
  {
    userId: 9001,
    businessId: 9001,
    role: 'owner',
    permissions: { all: true },
    isActive: true
  },
  {
    userId: 9002,
    businessId: 9001,
    role: 'admin',
    permissions: { manage_staff: true, view_reports: true },
    isActive: true
  },
  {
    userId: 9003,
    businessId: 9001,
    role: 'worker',
    permissions: { clock_in: true, view_schedule: true },
    isActive: true
  },
  {
    userId: 9005,
    businessId: 9001,
    role: 'manager',
    permissions: { manage_staff: true, create_schedule: true },
    isActive: true
  }
];

/**
 * 테스트 스케줄 데이터
 */
const testSchedules = [
  {
    id: 9001,
    businessId: 9001,
    title: 'E2E 아침 근무',
    startDate: new Date().toISOString().split('T')[0], // 오늘
    endDate: new Date().toISOString().split('T')[0],
    startTime: '09:00:00',
    endTime: '18:00:00',
    description: 'E2E 테스트용 아침 근무 스케줄',
    createdBy: 9001,
    assignments: [
      { userId: 9003, status: 'approved' },
      { userId: 9005, status: 'approved' }
    ]
  },
  {
    id: 9002,
    businessId: 9001,
    title: 'E2E 저녁 근무',
    startDate: getTomorrowDate(),
    endDate: getTomorrowDate(),
    startTime: '18:00:00',
    endTime: '24:00:00',
    description: 'E2E 테스트용 저녁 근무 스케줄',
    createdBy: 9001,
    assignments: [
      { userId: 9003, status: 'pending' }
    ]
  }
];

/**
 * 테스트 출근 데이터 (과거 기록)
 */
const testAttendanceRecords = [
  {
    userId: 9003,
    businessId: 9001,
    date: getYesterdayDate(),
    checkInTime: '09:15:00',
    checkOutTime: '18:30:00',
    breakMinutes: 60,
    status: 'completed',
    checkInMethod: 'gps',
    checkInLocation: { latitude: 37.4979, longitude: 127.0276 }
  },
  {
    userId: 9005,
    businessId: 9001,
    date: getYesterdayDate(),
    checkInTime: '08:55:00',
    checkOutTime: '18:00:00',
    breakMinutes: 45,
    status: 'completed',
    checkInMethod: 'qr'
  }
];

/**
 * 테스트 문서 데이터
 */
const testDocuments = [
  {
    id: 9001,
    ownerId: 9001,
    businessId: 9001,
    filename: 'e2e-test-contract.pdf',
    originalFilename: '근로계약서_샘플.pdf',
    fileType: 'pdf',
    fileSize: 1024000, // 1MB
    storagePath: '/test-storage/e2e-test-contract.pdf',
    category: 'contract',
    tags: ['계약서', 'E2E테스트'],
    isPublic: false,
    accessControl: { roles: ['owner', 'admin'] }
  },
  {
    id: 9002,
    ownerId: 9001,
    businessId: 9001,
    filename: 'e2e-manual.pdf',
    originalFilename: '업무매뉴얼.pdf',
    fileType: 'pdf',
    fileSize: 2048000, // 2MB
    storagePath: '/test-storage/e2e-manual.pdf',
    category: 'manual',
    tags: ['매뉴얼', '신입교육'],
    isPublic: true,
    accessControl: {}
  }
];

/**
 * 테스트 급여 데이터
 */
const testPayStatements = [
  {
    id: 9001,
    userId: 9003,
    businessId: 9001,
    payPeriodStart: getLastMonthStart(),
    payPeriodEnd: getLastMonthEnd(),
    baseSalary: 2000000,
    overtime: 150000,
    nightShift: 80000,
    holiday: 100000,
    weeklyHoliday: 120000,
    totalPay: 2450000,
    taxDeduction: 245000,
    socialInsurance: 180000,
    netPay: 2025000,
    status: 'paid',
    paidAt: new Date()
  }
];

/**
 * 테스트 알림 데이터
 */
const testNotifications = [
  {
    id: 9001,
    userId: 9003,
    type: 'schedule_assigned',
    title: '새로운 스케줄이 배정되었습니다',
    message: '내일 아침 근무가 배정되었습니다. 확인해주세요.',
    isRead: false,
    data: { scheduleId: 9002 }
  },
  {
    id: 9002,
    userId: 9003,
    type: 'pay_statement_ready',
    title: '급여명세서가 준비되었습니다',
    message: '이번 달 급여명세서를 확인하세요.',
    isRead: false,
    data: { payStatementId: 9001 }
  }
];

/**
 * 유틸리티 함수들
 */
function getTomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

function getYesterdayDate() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

function getLastMonthStart() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  date.setDate(1);
  return date.toISOString().split('T')[0];
}

function getLastMonthEnd() {
  const date = new Date();
  date.setDate(0); // 이번 달 0일 = 저번 달 마지막 날
  return date.toISOString().split('T')[0];
}

/**
 * 테스트 시나리오별 데이터 조합
 */
const testScenarios = {
  // 신규 사용자 시나리오
  newUser: {
    user: testUsers.seeker,
    businesses: [],
    roles: []
  },

  // 일반 직원 시나리오
  worker: {
    user: testUsers.worker,
    business: testBusinesses.cafe,
    role: testUserRoles.find(r => r.userId === 9003),
    todaySchedule: testSchedules[0],
    pastAttendance: testAttendanceRecords.filter(r => r.userId === 9003)
  },

  // 관리자 시나리오
  admin: {
    user: testUsers.admin,
    business: testBusinesses.cafe,
    role: testUserRoles.find(r => r.userId === 9002),
    managedUsers: [testUsers.worker, testUsers.manager],
    schedules: testSchedules,
    notifications: testNotifications
  },

  // 사업주 시나리오
  owner: {
    user: testUsers.owner,
    business: testBusinesses.cafe,
    role: testUserRoles.find(r => r.userId === 9001),
    employees: [testUsers.admin, testUsers.worker, testUsers.manager],
    documents: testDocuments,
    payStatements: testPayStatements
  }
};

/**
 * 동적 테스트 데이터 생성 함수들
 */
const dataGenerators = {
  /**
   * 랜덤 사용자 생성
   */
  createRandomUser(suffix = Date.now()) {
    return {
      id: 9000 + suffix,
      name: `테스트사용자${suffix}`,
      email: `test${suffix}@e2e.test`,
      phone: `010-${String(suffix).padStart(4, '0')}-${String(suffix).padStart(4, '0')}`,
      password: 'test123!@#',
      status: 'active'
    };
  },

  /**
   * 오늘 날짜의 스케줄 생성
   */
  createTodaySchedule(businessId, title = '임시 스케줄') {
    const today = new Date().toISOString().split('T')[0];
    return {
      id: 9000 + Date.now(),
      businessId,
      title,
      startDate: today,
      endDate: today,
      startTime: '09:00:00',
      endTime: '18:00:00',
      description: `E2E 테스트용 ${title}`,
      createdBy: 9001
    };
  },

  /**
   * 현재 시간 기준 출근 기록 생성
   */
  createCurrentAttendance(userId, businessId) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const checkInTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;

    return {
      userId,
      businessId,
      date: today,
      checkInTime,
      status: 'in_progress',
      checkInMethod: 'gps',
      checkInLocation: testBusinesses.cafe.location
    };
  }
};

/**
 * 환경별 설정
 */
const environmentConfig = {
  development: {
    databaseUrl: 'postgres://postgres:password@localhost:5432/dot_platform_dev',
    redisUrl: 'redis://localhost:6379',
    baseUrl: 'http://localhost:3000'
  },
  test: {
    databaseUrl: 'postgres://postgres:password@localhost:5432/dot_platform_test',
    redisUrl: 'redis://localhost:6379/1',
    baseUrl: 'http://localhost:3000'
  },
  staging: {
    databaseUrl: process.env.STAGING_DATABASE_URL,
    redisUrl: process.env.STAGING_REDIS_URL,
    baseUrl: process.env.STAGING_BASE_URL
  }
};

module.exports = {
  testUsers,
  testBusinesses,
  testUserRoles,
  testSchedules,
  testAttendanceRecords,
  testDocuments,
  testPayStatements,
  testNotifications,
  testScenarios,
  dataGenerators,
  environmentConfig,

  // 유틸리티 함수들도 export
  getTomorrowDate,
  getYesterdayDate,
  getLastMonthStart,
  getLastMonthEnd
};