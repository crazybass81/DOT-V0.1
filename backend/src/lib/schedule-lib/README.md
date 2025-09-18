# Schedule Library

근무 스케줄 관리를 위한 독립적인 라이브러리입니다.

## 주요 기능

- 주간/월간 스케줄 생성 및 관리
- 근무 패턴 템플릿 지원
- 스케줄 충돌 검증
- 근무 시간 계산
- 스케줄 변경 이력 관리

## 디렉터리 구조

```
schedule-lib/
├── src/
│   ├── index.js          # 라이브러리 진입점
│   ├── schedule.js       # 스케줄 핵심 로직
│   ├── patterns.js       # 근무 패턴 관리
│   ├── validator.js      # 스케줄 유효성 검증
│   └── calculator.js     # 근무 시간 계산
├── tests/
│   ├── schedule.test.js  # 스케줄 테스트
│   ├── patterns.test.js  # 패턴 테스트
│   └── integration.test.js # 통합 테스트
└── package.json
```

## 사용 방법

```javascript
const { ScheduleManager } = require('./schedule-lib');

// 스케줄 매니저 초기화
const manager = new ScheduleManager(dbPool);

// 주간 스케줄 생성
const weeklySchedule = await manager.createWeeklySchedule({
  businessId: 1,
  startDate: '2024-01-01',
  endDate: '2024-01-07',
  employeeSchedules: [
    {
      employeeId: 1,
      shifts: [
        { date: '2024-01-01', startTime: '09:00', endTime: '18:00' }
      ]
    }
  ]
});
```

## 테스트

```bash
npm test
```