#!/usr/bin/env node
/**
 * T235: auth-lib CLI 인터페이스
 * 비밀번호 해싱, JWT 검증 등 명령어 제공
 */

/**
 * 명령어 인수 파싱 함수
 * @returns {object} 파싱된 인수들
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    command: args[0],
    options: {}
  };

  // 옵션 파싱 (--key value 형태)
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      parsed.options[key] = value;
      i++; // 다음 인수는 값이므로 건너뛰기
    }
  }

  return parsed;
}

/**
 * 도움말 출력
 */
function showHelp() {
  console.log(`
auth-lib CLI v0.1.0

사용법: node cli.js <command> [options]

명령어:
  hash-password       비밀번호를 bcrypt로 해싱
  verify-password     비밀번호와 해시 비교 검증
  verify-token        JWT 토큰 검증
  generate-token      JWT 토큰 생성
  create-session      Redis 세션 생성
  get-session         Redis 세션 조회
  delete-session      Redis 세션 삭제

옵션:
  --password <value>  비밀번호
  --hash <value>      검증할 해시
  --token <value>     JWT 토큰
  --payload <json>    토큰 페이로드 (JSON 형태)
  --secret <value>    JWT 시크릿
  --userId <value>    사용자 ID
  --sessionId <value> 세션 ID
  --data <json>       세션 데이터 (JSON 형태)
  --ttl <number>      TTL (초)
  --format <format>   출력 형식 (json|text, 기본값: text)
  --help, -h          이 도움말 출력
  --version, -v       버전 정보 출력

예시:
  node cli.js hash-password --password "mypassword"
  node cli.js verify-token --token "eyJ..." --secret "secret"
  node cli.js create-session --userId "user123" --data '{"role":"admin"}'
`);
}

/**
 * 버전 정보 출력
 */
function showVersion() {
  console.log('auth-lib CLI v0.1.0');
}

/**
 * 비밀번호 해싱 명령어
 */
async function handleHashPassword(options) {
  const { hashPassword } = require('./password');

  if (!options.password) {
    console.error('오류: --password 옵션이 필요합니다');
    process.exit(1);
  }

  try {
    const hash = await hashPassword(options.password);
    if (options.format === 'json') {
      console.log(JSON.stringify({ hash }, null, 2));
    } else {
      console.log(`해싱된 비밀번호: ${hash}`);
    }
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

/**
 * 비밀번호 검증 명령어
 */
async function handleVerifyPassword(options) {
  const { verifyPassword } = require('./password');

  if (!options.password || !options.hash) {
    console.error('오류: --password와 --hash 옵션이 모두 필요합니다');
    process.exit(1);
  }

  try {
    const isValid = await verifyPassword(options.password, options.hash);
    if (options.format === 'json') {
      console.log(JSON.stringify({ isValid }, null, 2));
    } else {
      console.log(`비밀번호는 ${isValid ? '유효' : '무효'}합니다`);
    }
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

/**
 * JWT 토큰 검증 명령어
 */
async function handleVerifyToken(options) {
  const { verifyToken } = require('./token');

  if (!options.token) {
    console.error('오류: --token 옵션이 필요합니다');
    process.exit(1);
  }

  try {
    const decoded = await verifyToken(options.token, options.secret);
    if (options.format === 'json') {
      console.log(JSON.stringify({ valid: true, decoded }, null, 2));
    } else {
      console.log('토큰이 유효합니다');
      console.log('디코딩된 데이터:', JSON.stringify(decoded, null, 2));
    }
  } catch (error) {
    if (options.format === 'json') {
      console.log(JSON.stringify({ valid: false, error: error.message }, null, 2));
    } else {
      console.error('토큰이 무효합니다:', error.message);
    }
    process.exit(1);
  }
}

/**
 * JWT 토큰 생성 명령어
 */
async function handleGenerateToken(options) {
  const { generateToken } = require('./token');

  if (!options.payload) {
    console.error('오류: --payload 옵션이 필요합니다');
    process.exit(1);
  }

  try {
    const payload = JSON.parse(options.payload);
    const token = await generateToken(payload, options.secret);
    if (options.format === 'json') {
      console.log(JSON.stringify({ token }, null, 2));
    } else {
      console.log(token);
    }
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  }
}

/**
 * Redis 세션 생성 명령어
 */
async function handleCreateSession(options) {
  const { createSession, closeRedisConnection } = require('./session');

  if (!options.userId) {
    console.error('오류: --userId 옵션이 필요합니다');
    process.exit(1);
  }

  try {
    const sessionData = options.data ? JSON.parse(options.data) : {};
    const ttl = options.ttl ? parseInt(options.ttl) : 86400;
    const sessionId = await createSession(options.userId, sessionData, ttl);

    if (options.format === 'json') {
      console.log(JSON.stringify({ sessionId }, null, 2));
    } else {
      console.log(`세션 생성됨: ${sessionId}`);
    }
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Redis 세션 조회 명령어
 */
async function handleGetSession(options) {
  const { getSession, closeRedisConnection } = require('./session');

  if (!options.sessionId) {
    console.error('오류: --sessionId 옵션이 필요합니다');
    process.exit(1);
  }

  try {
    const session = await getSession(options.sessionId);
    if (session) {
      if (options.format === 'json') {
        console.log(JSON.stringify({ found: true, session }, null, 2));
      } else {
        console.log('세션을 찾았습니다:');
        console.log(JSON.stringify(session, null, 2));
      }
    } else {
      if (options.format === 'json') {
        console.log(JSON.stringify({ found: false }, null, 2));
      } else {
        console.log('세션을 찾을 수 없습니다');
      }
    }
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  } finally {
    await closeRedisConnection();
  }
}

/**
 * Redis 세션 삭제 명령어
 */
async function handleDeleteSession(options) {
  const { deleteSession, closeRedisConnection } = require('./session');

  if (!options.sessionId) {
    console.error('오류: --sessionId 옵션이 필요합니다');
    process.exit(1);
  }

  try {
    const result = await deleteSession(options.sessionId);
    if (options.format === 'json') {
      console.log(JSON.stringify({ deleted: result }, null, 2));
    } else {
      console.log(result ? '세션이 삭제되었습니다' : '세션을 찾을 수 없습니다');
    }
  } catch (error) {
    console.error('오류:', error.message);
    process.exit(1);
  } finally {
    await closeRedisConnection();
  }
}

/**
 * 메인 CLI 진입점
 */
async function main() {
  const { command, options } = parseArgs();

  // 도움말 또는 버전 출력
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    showHelp();
    return;
  }

  if (command === '--version' || command === '-v' || command === 'version') {
    showVersion();
    return;
  }

  // 명령어 실행
  switch (command) {
    case 'hash-password':
      await handleHashPassword(options);
      break;
    case 'verify-password':
      await handleVerifyPassword(options);
      break;
    case 'verify-token':
      await handleVerifyToken(options);
      break;
    case 'generate-token':
      await handleGenerateToken(options);
      break;
    case 'create-session':
      await handleCreateSession(options);
      break;
    case 'get-session':
      await handleGetSession(options);
      break;
    case 'delete-session':
      await handleDeleteSession(options);
      break;
    default:
      console.error(`알 수 없는 명령어: ${command}`);
      console.error('도움말을 보려면 --help를 사용하세요');
      process.exit(1);
  }
}

// CLI로 직접 실행될 때만 main 함수 호출
if (require.main === module) {
  main().catch(error => {
    console.error('치명적 오류:', error.message);
    process.exit(1);
  });
}

// 모듈로 사용될 때는 함수들을 export
module.exports = {
  parseArgs,
  showHelp,
  showVersion,
  handleHashPassword,
  handleVerifyPassword,
  handleVerifyToken,
  handleGenerateToken,
  handleCreateSession,
  handleGetSession,
  handleDeleteSession,
  main
};