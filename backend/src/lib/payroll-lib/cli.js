#!/usr/bin/env node
/**
 * T178-T180: payroll-lib CLI 인터페이스
 * 급여 계산 명령행 도구
 */

const PayrollManager = require('./src/index');

const commands = {
  '--help': showHelp,
  '--version': showVersion,
  '--calculate': calculatePay,
  '--weekly-allowance': calculateWeeklyAllowance,
  '--overtime': calculateOvertime,
  '--deductions': calculateDeductions,
  '--net-pay': calculateNetPay
};

function showHelp() {
  console.log(`
payroll-lib CLI - 급여 계산 도구

사용법:
  payroll [옵션] [인자...]

옵션:
  --help                    도움말 표시
  --version                 버전 정보 표시
  --calculate               기본급 계산
    인자: <hourlyRate> <hoursWorked>

  --weekly-allowance        주휴수당 계산
    인자: <hourlyRate> <weeklyHours>

  --overtime                연장근로수당 계산
    인자: <hourlyRate> <overtimeHours>

  --deductions              4대보험 공제 계산
    인자: <grossPay>

  --net-pay                 실수령액 계산
    인자: <grossPay>

예제:
  payroll --calculate 10000 176
  payroll --weekly-allowance 10000 40
  payroll --overtime 10000 10
  payroll --net-pay 2500000
  `);
}

function showVersion() {
  const pkg = require('./package.json');
  console.log(`payroll-lib v${pkg.version}`);
}

function calculatePay(args) {
  if (args.length < 2) {
    console.error('오류: 시급과 근무시간을 입력해주세요');
    console.log('사용법: payroll --calculate <시급> <근무시간>');
    process.exit(1);
  }

  const hourlyRate = parseFloat(args[0]);
  const hoursWorked = parseFloat(args[1]);

  if (isNaN(hourlyRate) || isNaN(hoursWorked)) {
    console.error('오류: 유효한 숫자를 입력해주세요');
    process.exit(1);
  }

  const manager = new PayrollManager();
  const result = manager.calculateBasePay(hourlyRate, hoursWorked);

  console.log('\n=== 기본급 계산 결과 ===');
  console.log(`시급: ${hourlyRate.toLocaleString()}원`);
  console.log(`근무시간: ${hoursWorked}시간`);
  console.log(`기본급: ${result.toLocaleString()}원`);
}

function calculateWeeklyAllowance(args) {
  if (args.length < 2) {
    console.error('오류: 시급과 주간 근무시간을 입력해주세요');
    process.exit(1);
  }

  const hourlyRate = parseFloat(args[0]);
  const weeklyHours = parseFloat(args[1]);

  const manager = new PayrollManager();
  const result = manager.calculateWeeklyAllowance(hourlyRate, weeklyHours);

  console.log('\n=== 주휴수당 계산 결과 ===');
  console.log(`시급: ${hourlyRate.toLocaleString()}원`);
  console.log(`주간 근무시간: ${weeklyHours}시간`);
  console.log(`주휴수당: ${result.toLocaleString()}원`);
}

function calculateOvertime(args) {
  if (args.length < 2) {
    console.error('오류: 시급과 연장 근무시간을 입력해주세요');
    process.exit(1);
  }

  const hourlyRate = parseFloat(args[0]);
  const overtimeHours = parseFloat(args[1]);

  const manager = new PayrollManager();
  const result = manager.calculateOvertimePay(hourlyRate, overtimeHours);

  console.log('\n=== 연장근로수당 계산 결과 ===');
  console.log(`시급: ${hourlyRate.toLocaleString()}원`);
  console.log(`연장 근무시간: ${overtimeHours}시간`);
  console.log(`연장근로수당: ${result.toLocaleString()}원`);
  console.log('(연장근로 가산율 50% 적용)');
}

function calculateDeductions(args) {
  if (args.length < 1) {
    console.error('오류: 총 급여를 입력해주세요');
    process.exit(1);
  }

  const grossPay = parseFloat(args[0]);

  const manager = new PayrollManager();
  const result = manager.calculateDeductions(grossPay);

  console.log('\n=== 4대보험 공제 내역 ===');
  console.log(`총 급여: ${grossPay.toLocaleString()}원`);
  console.log('--- 공제 항목 ---');
  console.log(`국민연금 (4.5%): ${result.nationalPension.toLocaleString()}원`);
  console.log(`건강보험 (3.545%): ${result.healthInsurance.toLocaleString()}원`);
  console.log(`장기요양보험 (12.81%): ${result.longTermCare.toLocaleString()}원`);
  console.log(`고용보험 (0.9%): ${result.employmentInsurance.toLocaleString()}원`);
  console.log(`총 공제액: ${result.total.toLocaleString()}원`);
}

function calculateNetPay(args) {
  if (args.length < 1) {
    console.error('오류: 총 급여를 입력해주세요');
    process.exit(1);
  }

  const grossPay = parseFloat(args[0]);

  const manager = new PayrollManager();
  const deductions = manager.calculateDeductions(grossPay);
  const netPay = manager.calculateNetPay(grossPay, deductions.total);

  console.log('\n=== 실수령액 계산 ===');
  console.log(`총 급여: ${grossPay.toLocaleString()}원`);
  console.log(`공제액: ${deductions.total.toLocaleString()}원`);
  console.log(`실수령액: ${netPay.toLocaleString()}원`);
}

// 메인 실행
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  if (commands[command]) {
    commands[command](commandArgs);
  } else {
    console.error(`오류: 알 수 없는 명령어 '${command}'`);
    showHelp();
    process.exit(1);
  }
}

// CLI로 실행될 때만 실행
if (require.main === module) {
  main();
}

module.exports = { commands };