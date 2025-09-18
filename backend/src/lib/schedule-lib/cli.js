#!/usr/bin/env node

/**
 * T143, T145: schedule-lib CLI 인터페이스
 * 스케줄 관리 기능을 명령줄에서 사용
 */

const scheduleLib = require('./index');

// 명령줄 인자 파싱
const args = process.argv.slice(2);
const command = args[0];

// 도움말 표시
function showHelp() {
  console.log(`
스케줄 관리 라이브러리 CLI

사용법:
  schedule-lib <command> [options]

명령어:
  create        스케줄 생성
  update        스케줄 수정
  delete        스케줄 삭제
  validate      스케줄 유효성 검증
  conflict      충돌 체크
  work-hours    근무시간 계산

옵션:
  --user-id     사용자 ID
  --business-id 사업장 ID
  --date        날짜 (YYYY-MM-DD)
  --start       시작 시간 (HH:mm)
  --end         종료 시간 (HH:mm)
  --type        스케줄 타입 (shift, break, leave, etc.)
  --recurring   반복 설정 (daily, weekly, monthly)

예제:
  schedule-lib create --user-id 1 --date 2024-01-01 --start 09:00 --end 18:00
  schedule-lib conflict --business-id 1 --date 2024-01-01
  schedule-lib work-hours --user-id 1 --date 2024-01-01
`);
}

// 명령어별 처리
async function execute() {
  try {
    switch (command) {
      case 'create':
        await handleCreate();
        break;

      case 'update':
        await handleUpdate();
        break;

      case 'delete':
        await handleDelete();
        break;

      case 'validate':
        await handleValidate();
        break;

      case 'conflict':
        await handleConflict();
        break;

      case 'work-hours':
        await handleWorkHours();
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// 스케줄 생성 처리
async function handleCreate() {
  const options = parseOptions();

  if (!options.userId || !options.date || !options.start || !options.end) {
    throw new Error('Required: --user-id, --date, --start, --end');
  }

  const schedule = {
    userId: parseInt(options.userId),
    date: options.date,
    startTime: options.start,
    endTime: options.end,
    type: options.type || 'shift',
    businessId: options.businessId ? parseInt(options.businessId) : null
  };

  // 유효성 검증
  const validation = await scheduleLib.validateSchedule(schedule);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  console.log('Schedule created:', JSON.stringify(schedule, null, 2));
}

// 스케줄 수정 처리
async function handleUpdate() {
  const options = parseOptions();

  if (!options.id) {
    throw new Error('Required: --id');
  }

  const updates = {};
  if (options.date) updates.date = options.date;
  if (options.start) updates.startTime = options.start;
  if (options.end) updates.endTime = options.end;
  if (options.type) updates.type = options.type;

  console.log(`Updating schedule ${options.id}:`, JSON.stringify(updates, null, 2));
}

// 스케줄 삭제 처리
async function handleDelete() {
  const options = parseOptions();

  if (!options.id) {
    throw new Error('Required: --id');
  }

  console.log(`Deleting schedule ${options.id}`);
}

// 유효성 검증 처리
async function handleValidate() {
  const options = parseOptions();

  const schedule = {
    userId: options.userId ? parseInt(options.userId) : null,
    date: options.date,
    startTime: options.start,
    endTime: options.end,
    type: options.type || 'shift'
  };

  const result = await scheduleLib.validateSchedule(schedule);

  if (result.valid) {
    console.log('✅ Schedule is valid');
  } else {
    console.log('❌ Schedule is invalid:');
    result.errors.forEach(error => console.log(`  - ${error}`));
  }
}

// 충돌 체크 처리
async function handleConflict() {
  const options = parseOptions();

  if (!options.businessId || !options.date) {
    throw new Error('Required: --business-id, --date');
  }

  const conflicts = await scheduleLib.findConflicts({
    businessId: parseInt(options.businessId),
    date: options.date
  });

  if (conflicts.length === 0) {
    console.log('✅ No conflicts found');
  } else {
    console.log(`⚠️  Found ${conflicts.length} conflict(s):`);
    conflicts.forEach(conflict => {
      console.log(`  - User ${conflict.userId}: ${conflict.details}`);
    });
  }
}

// 근무시간 계산 처리
async function handleWorkHours() {
  const options = parseOptions();

  if (!options.userId || !options.date) {
    throw new Error('Required: --user-id, --date');
  }

  const hours = await scheduleLib.calculateWorkHours({
    userId: parseInt(options.userId),
    date: options.date
  });

  console.log(`Total work hours: ${hours.total}`);
  console.log(`Regular hours: ${hours.regular}`);
  console.log(`Overtime hours: ${hours.overtime}`);
  console.log(`Break hours: ${hours.break}`);
}

// 옵션 파싱 헬퍼
function parseOptions() {
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-/g, '');
      const value = args[i + 1];

      if (value && !value.startsWith('--')) {
        options[key] = value;
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  return options;
}

// CLI 실행
if (require.main === module) {
  execute();
}

module.exports = {
  execute,
  parseOptions
};