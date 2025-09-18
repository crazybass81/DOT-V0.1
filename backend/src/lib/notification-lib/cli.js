#!/usr/bin/env node

/**
 * T285: Notification Library CLI
 * 알림 발송 테스트 및 관리 도구
 *
 * 사용법:
 * ./cli.js --send-email --to user@example.com --subject "Test" --body "Test message"
 * ./cli.js --send-sms --to 010-1234-5678 --message "Test SMS"
 * ./cli.js --list-templates
 * ./cli.js --queue-status
 * ./cli.js --process-queue
 */

const notificationLib = require('./index');
const email = require('./email');
const sms = require('./sms');
const template = require('./template');
const queue = require('./queue');

// 명령줄 인자 파싱
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  return options;
}

// 도움말 출력
function showHelp() {
  console.log(`
Notification Library CLI - 알림 발송 및 관리 도구

사용법:
  ./cli.js [명령] [옵션]

명령어:
  --send-email              이메일 발송
    --to <email>           수신자 이메일
    --subject <subject>    제목
    --body <body>          본문

  --send-sms               SMS 발송
    --to <phone>          수신자 전화번호
    --message <message>   메시지

  --send-template          템플릿 기반 발송
    --template <id>       템플릿 ID
    --to <recipient>      수신자
    --data <json>         변수 데이터 (JSON)

  --list-templates         템플릿 목록 조회
    --category <category> 카테고리 필터 (선택)

  --queue-status          큐 상태 조회
  --process-queue         큐 처리 실행
  --clean-queue           오래된 큐 정리
    --days <days>        보관 일수 (기본: 30)

  --test-email            이메일 연결 테스트
  --test-sms             SMS 서비스 상태 확인

  --help                 도움말 표시

예제:
  # 이메일 발송
  ./cli.js --send-email --to user@example.com --subject "안녕하세요" --body "테스트 메시지입니다."

  # SMS 발송
  ./cli.js --send-sms --to 010-1234-5678 --message "테스트 SMS"

  # 템플릿으로 이메일 발송
  ./cli.js --send-template --template auth.welcome --to user@example.com --data '{"userName":"홍길동","verificationCode":"123456"}'

  # 템플릿 목록 조회
  ./cli.js --list-templates --category auth

  # 큐 상태 확인
  ./cli.js --queue-status
  `);
}

// 이메일 발송 명령
async function sendEmailCommand(options) {
  const { to, subject, body, cc, bcc } = options;

  if (!to || !subject || !body) {
    console.error('❌ 오류: 수신자(--to), 제목(--subject), 본문(--body)은 필수입니다.');
    return;
  }

  console.log('📧 이메일 발송 중...');
  const result = await email.send({
    to,
    subject,
    html: body,
    text: body,
    cc,
    bcc
  });

  if (result.success) {
    console.log('✅ 이메일 발송 성공');
    console.log('Message ID:', result.messageId);
  } else {
    console.error('❌ 이메일 발송 실패:', result.error);
    console.error('상세:', result.message);
  }
}

// SMS 발송 명령
async function sendSmsCommand(options) {
  const { to, message } = options;

  if (!to || !message) {
    console.error('❌ 오류: 수신자(--to)와 메시지(--message)는 필수입니다.');
    return;
  }

  console.log('📱 SMS 발송 중...');
  const result = await sms.send({ to, message });

  if (result.success) {
    console.log('✅ SMS 발송 성공');
    console.log('Message ID:', result.messageId);
    console.log('타입:', result.type);
    console.log('세그먼트:', result.segments);
    if (result.simulationMode) {
      console.log('⚠️  시뮬레이션 모드 (실제 발송되지 않음)');
    }
  } else {
    console.error('❌ SMS 발송 실패:', result.error);
    console.error('상세:', result.message);
  }
}

// 템플릿 발송 명령
async function sendTemplateCommand(options) {
  const { template: templateId, to, data } = options;

  if (!templateId || !to) {
    console.error('❌ 오류: 템플릿 ID(--template)와 수신자(--to)는 필수입니다.');
    return;
  }

  let variables = {};
  if (data) {
    try {
      variables = JSON.parse(data);
    } catch (error) {
      console.error('❌ 데이터 파싱 오류:', error.message);
      return;
    }
  }

  console.log('📨 템플릿 발송 중...');
  const renderResult = template.render(templateId, variables);

  if (!renderResult.success) {
    console.error('❌ 템플릿 렌더링 실패:', renderResult.error);
    if (renderResult.missingVariables) {
      console.error('누락된 변수:', renderResult.missingVariables.join(', '));
    }
    return;
  }

  const sendResult = await notificationLib.sendNotification({
    type: 'email',
    recipient: to,
    content: renderResult.content
  });

  if (sendResult.success) {
    console.log('✅ 템플릿 발송 성공');
  } else {
    console.error('❌ 템플릿 발송 실패:', sendResult.error);
  }
}

// 템플릿 목록 명령
function listTemplatesCommand(options) {
  const { category } = options;

  const templates = template.listTemplates(category);

  if (templates.length === 0) {
    console.log('템플릿이 없습니다.');
    return;
  }

  console.log('\n📋 템플릿 목록');
  console.log('═'.repeat(60));

  templates.forEach(t => {
    console.log(`\nID: ${t.id}`);
    console.log(`이름: ${t.name}`);
    console.log(`카테고리: ${t.category}`);
    console.log(`제목: ${t.subject}`);
    console.log(`변수: ${t.variables.join(', ')}`);
    console.log('─'.repeat(60));
  });

  console.log(`\n총 ${templates.length}개의 템플릿`);
}

// 큐 상태 명령
async function queueStatusCommand() {
  const status = await queue.getQueueStatus();

  console.log('\n📊 큐 상태');
  console.log('═'.repeat(40));
  console.log(`대기 중: ${status.pending}개`);
  console.log(`처리 중: ${status.processing}개`);
  console.log(`예약됨: ${status.scheduled}개`);
  console.log(`전체 큐: ${status.total}개`);
  console.log(`이력: ${status.historyCount}개`);
}

// 큐 처리 명령
async function processQueueCommand() {
  console.log('⚙️  큐 처리 시작...');
  const result = await notificationLib.processQueue();

  if (result.success) {
    console.log('✅ 큐 처리 완료');
    console.log(`처리됨: ${result.data.processed}개`);
    console.log(`실패: ${result.data.failed}개`);
  } else {
    console.error('❌ 큐 처리 실패:', result.error);
  }
}

// 큐 정리 명령
async function cleanQueueCommand(options) {
  const days = parseInt(options.days || '30');

  console.log(`🧹 ${days}일 이상 된 이력 정리 중...`);
  const result = await queue.cleanupQueue(days);

  if (result.success) {
    console.log('✅ 큐 정리 완료');
    console.log(`제거됨: ${result.removed}개`);
    console.log(`남은 이력: ${result.remaining}개`);
  } else {
    console.error('❌ 큐 정리 실패:', result.error);
  }
}

// 이메일 테스트 명령
async function testEmailCommand() {
  console.log('🔌 이메일 서버 연결 테스트...');
  const result = await email.testConnection();

  if (result.success) {
    console.log('✅', result.message);
  } else {
    console.error('❌ 연결 실패:', result.message);
  }
}

// SMS 테스트 명령
async function testSmsCommand() {
  console.log('📡 SMS 서비스 상태 확인...');
  const status = await sms.checkService();

  console.log('\nSMS 서비스 상태:');
  console.log('─'.repeat(40));
  console.log(`사용 가능: ${status.available ? '예' : '아니오'}`);
  console.log(`제공자: ${status.provider}`);
  console.log(`잔액: ${status.balance}`);
  console.log(`메시지: ${status.message}`);
  if (status.simulationMode) {
    console.log('⚠️  시뮬레이션 모드로 동작 중');
  }
}

// 메인 실행
async function main() {
  const options = parseArgs();

  // 도움말
  if (options.help || Object.keys(options).length === 0) {
    showHelp();
    return;
  }

  // 명령 실행
  try {
    if (options['send-email']) {
      await sendEmailCommand(options);
    } else if (options['send-sms']) {
      await sendSmsCommand(options);
    } else if (options['send-template']) {
      await sendTemplateCommand(options);
    } else if (options['list-templates']) {
      listTemplatesCommand(options);
    } else if (options['queue-status']) {
      await queueStatusCommand();
    } else if (options['process-queue']) {
      await processQueueCommand();
    } else if (options['clean-queue']) {
      await cleanQueueCommand(options);
    } else if (options['test-email']) {
      await testEmailCommand();
    } else if (options['test-sms']) {
      await testSmsCommand();
    } else {
      console.error('❌ 알 수 없는 명령입니다. --help를 사용하여 도움말을 확인하세요.');
    }
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    console.error(error.stack);
  }
}

// 스크립트 직접 실행 시
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  parseArgs,
  sendEmailCommand,
  sendSmsCommand,
  sendTemplateCommand,
  listTemplatesCommand,
  queueStatusCommand,
  processQueueCommand,
  cleanQueueCommand
};