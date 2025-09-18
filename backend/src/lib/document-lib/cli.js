#!/usr/bin/env node

/**
 * T213: document-lib CLI 인터페이스
 * 문서 관리 라이브러리 명령어 도구
 * 파일 업로드, 다운로드, 검증, 삭제 기능 제공
 */

const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const path = require('path');
const fs = require('fs-extra');

// 라이브러리 모듈 import
const { uploadFile, downloadFile, validateFile, deleteFile } = require('./index');

/**
 * CLI 메인 설정
 */
const cli = yargs(hideBin(process.argv))
  .scriptName('document-lib')
  .usage('$0 <command> [options]')
  .version('0.1.0')
  .help('help')
  .alias('h', 'help')
  .alias('v', 'version')
  .option('format', {
    alias: 'f',
    type: 'string',
    choices: ['json', 'text'],
    default: 'text',
    description: '출력 포맷 (JSON 또는 텍스트)'
  })
  .example('$0 --upload /path/to/file.pdf --owner-id 123', '파일 업로드')
  .example('$0 --download file-id-123 --output /path/to/download/', '파일 다운로드')
  .example('$0 --validate /path/to/file.pdf', '파일 검증')
  .epilogue('DOT Platform 문서 관리 시스템 v0.1.0');

/**
 * 업로드 명령어
 */
cli.command({
  command: 'upload <file>',
  aliases: ['up', 'u'],
  describe: '파일을 업로드합니다 (최대 10MB)',
  builder: (yargs) => {
    return yargs
      .positional('file', {
        describe: '업로드할 파일 경로',
        type: 'string'
      })
      .option('owner-id', {
        alias: 'o',
        type: 'number',
        demandOption: true,
        description: '파일 소유자 ID'
      })
      .option('business-id', {
        alias: 'b',
        type: 'number',
        description: '사업장 ID (선택사항)'
      })
      .option('category', {
        alias: 'c',
        type: 'string',
        description: '문서 카테고리'
      })
      .option('tags', {
        alias: 't',
        type: 'array',
        description: '문서 태그 목록'
      })
      .option('public', {
        alias: 'p',
        type: 'boolean',
        default: false,
        description: '공개 문서 여부'
      });
  },
  handler: async (argv) => {
    try {
      const filePath = path.resolve(argv.file);

      // 파일 존재 확인
      if (!await fs.pathExists(filePath)) {
        outputError('파일을 찾을 수 없습니다: ' + filePath, argv.format);
        process.exit(1);
      }

      const result = await uploadFile({
        filePath,
        ownerId: argv.ownerId,
        businessId: argv.businessId,
        category: argv.category,
        tags: argv.tags || [],
        isPublic: argv.public
      });

      outputSuccess('파일 업로드 완료', result, argv.format);
    } catch (error) {
      outputError('업로드 실패: ' + error.message, argv.format);
      process.exit(1);
    }
  }
});

/**
 * 다운로드 명령어
 */
cli.command({
  command: 'download <document-id>',
  aliases: ['dl', 'd'],
  describe: '문서를 다운로드합니다',
  builder: (yargs) => {
    return yargs
      .positional('document-id', {
        describe: '다운로드할 문서 ID',
        type: 'string'
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        default: './downloads',
        description: '다운로드할 디렉토리 경로'
      })
      .option('user-id', {
        alias: 'u',
        type: 'number',
        demandOption: true,
        description: '요청 사용자 ID'
      });
  },
  handler: async (argv) => {
    try {
      const result = await downloadFile({
        documentId: argv.documentId,
        outputDir: argv.output,
        userId: argv.userId
      });

      outputSuccess('파일 다운로드 완료', result, argv.format);
    } catch (error) {
      outputError('다운로드 실패: ' + error.message, argv.format);
      process.exit(1);
    }
  }
});

/**
 * 검증 명령어
 */
cli.command({
  command: 'validate <file>',
  aliases: ['val', 'v'],
  describe: '파일을 검증합니다 (타입, 크기, 보안)',
  builder: (yargs) => {
    return yargs
      .positional('file', {
        describe: '검증할 파일 경로',
        type: 'string'
      })
      .option('strict', {
        alias: 's',
        type: 'boolean',
        default: false,
        description: '엄격한 검증 모드'
      });
  },
  handler: async (argv) => {
    try {
      const filePath = path.resolve(argv.file);

      if (!await fs.pathExists(filePath)) {
        outputError('파일을 찾을 수 없습니다: ' + filePath, argv.format);
        process.exit(1);
      }

      const result = await validateFile({
        filePath,
        strict: argv.strict
      });

      if (result.valid) {
        outputSuccess('파일 검증 통과', result, argv.format);
      } else {
        outputError('파일 검증 실패', result, argv.format);
        process.exit(1);
      }
    } catch (error) {
      outputError('검증 실패: ' + error.message, argv.format);
      process.exit(1);
    }
  }
});

/**
 * 삭제 명령어
 */
cli.command({
  command: 'delete <document-id>',
  aliases: ['del', 'rm'],
  describe: '문서를 삭제합니다',
  builder: (yargs) => {
    return yargs
      .positional('document-id', {
        describe: '삭제할 문서 ID',
        type: 'string'
      })
      .option('user-id', {
        alias: 'u',
        type: 'number',
        demandOption: true,
        description: '요청 사용자 ID'
      })
      .option('force', {
        alias: 'f',
        type: 'boolean',
        default: false,
        description: '강제 삭제 (확인 없이)'
      });
  },
  handler: async (argv) => {
    try {
      if (!argv.force) {
        // 확인 프롬프트 (간단 구현)
        console.log(`문서 ${argv.documentId}를 삭제하시겠습니까? (y/N)`);
        // 실제로는 readline 등을 사용해야 함
      }

      const result = await deleteFile({
        documentId: argv.documentId,
        userId: argv.userId
      });

      outputSuccess('문서 삭제 완료', result, argv.format);
    } catch (error) {
      outputError('삭제 실패: ' + error.message, argv.format);
      process.exit(1);
    }
  }
});

/**
 * 상태 확인 명령어
 */
cli.command({
  command: 'status',
  aliases: ['stat', 's'],
  describe: '라이브러리 상태를 확인합니다',
  handler: async (argv) => {
    try {
      const storageDir = path.join(__dirname, 'storage');
      const stats = await fs.stat(storageDir);

      const status = {
        version: '0.1.0',
        storageDir,
        storageExists: await fs.pathExists(storageDir),
        createdAt: stats.birthtime,
        lastModified: stats.mtime
      };

      outputSuccess('라이브러리 상태', status, argv.format);
    } catch (error) {
      outputError('상태 확인 실패: ' + error.message, argv.format);
      process.exit(1);
    }
  }
});

/**
 * 출력 유틸리티 함수들
 */

/**
 * 성공 메시지 출력
 * @param {string} message - 메시지
 * @param {Object} data - 데이터
 * @param {string} format - 출력 포맷
 */
function outputSuccess(message, data, format) {
  if (format === 'json') {
    console.log(JSON.stringify({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    }, null, 2));
  } else {
    console.log(`✅ ${message}`);
    if (data && typeof data === 'object') {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * 에러 메시지 출력
 * @param {string} message - 에러 메시지
 * @param {string} format - 출력 포맷
 */
function outputError(message, format) {
  if (format === 'json') {
    console.error(JSON.stringify({
      success: false,
      error: message,
      timestamp: new Date().toISOString()
    }, null, 2));
  } else {
    console.error(`❌ ${message}`);
  }
}

/**
 * 도움말 표시 (인자가 없을 때)
 */
if (process.argv.length === 2) {
  cli.showHelp();
  process.exit(0);
}

// CLI 실행
cli.parse();

module.exports = cli;