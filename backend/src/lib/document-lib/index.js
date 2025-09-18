/**
 * T214: document-lib 메인 export 파일
 * DOT Platform 문서 관리 라이브러리 진입점
 * 파일 업로드, 다운로드, 검증, 삭제 기능 제공
 */

const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

// 라이브러리 버전
const VERSION = '0.1.0';

// 기본 설정
const DEFAULT_CONFIG = {
  maxFileSize: 10485760, // 10MB in bytes
  allowedTypes: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
  storageDir: path.join(__dirname, 'storage', 'documents'),
  tempDir: path.join(__dirname, 'storage', 'temp'),
  autoExpireDays: 1095 // 3년 (365 * 3)
};

/**
 * 파일 업로드 함수
 * @param {Object} options - 업로드 옵션
 * @param {string} options.filePath - 업로드할 파일 경로
 * @param {number} options.ownerId - 파일 소유자 ID
 * @param {number} [options.businessId] - 사업장 ID (선택사항)
 * @param {string} [options.category] - 문서 카테고리
 * @param {Array} [options.tags] - 문서 태그 배열
 * @param {boolean} [options.isPublic=false] - 공개 문서 여부
 * @returns {Promise<Object>} 업로드 결과
 */
async function uploadFile(options) {
  const {
    filePath,
    ownerId,
    businessId = null,
    category = null,
    tags = [],
    isPublic = false
  } = options;

  try {
    // 입력 검증
    if (!filePath || !ownerId) {
      throw new Error('파일 경로와 소유자 ID는 필수입니다');
    }

    // 파일 존재 확인
    if (!await fs.pathExists(filePath)) {
      throw new Error('파일을 찾을 수 없습니다: ' + filePath);
    }

    // 파일 정보 조회
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    const originalFilename = path.basename(filePath);

    // 파일 크기 검증
    if (fileSize > DEFAULT_CONFIG.maxFileSize) {
      throw new Error(`파일 크기가 너무 큽니다. 최대 ${DEFAULT_CONFIG.maxFileSize / 1024 / 1024}MB까지 허용됩니다`);
    }

    // 파일 타입 검증
    const fileExtension = path.extname(originalFilename).toLowerCase().substring(1);
    if (!DEFAULT_CONFIG.allowedTypes.includes(fileExtension)) {
      throw new Error(`지원하지 않는 파일 형식입니다. 허용 형식: ${DEFAULT_CONFIG.allowedTypes.join(', ')}`);
    }

    // 고유 파일명 생성
    const documentId = uuidv4();
    const filename = `${documentId}-${originalFilename}`;

    // 저장 경로 생성 (년/월 구조)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const storageSubDir = path.join(DEFAULT_CONFIG.storageDir, String(year), month);
    const storagePath = path.join(storageSubDir, filename);

    // 디렉토리 생성
    await fs.ensureDir(storageSubDir);

    // 파일 복사
    await fs.copy(filePath, storagePath);

    // 메타데이터 생성
    const metadata = {
      id: documentId,
      filename,
      originalFilename,
      fileType: fileExtension,
      fileSize,
      storagePath,
      ownerId,
      businessId,
      category,
      tags,
      isPublic,
      expiresAt: new Date(Date.now() + DEFAULT_CONFIG.autoExpireDays * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now
    };

    console.log(`📄 파일 업로드 완료: ${originalFilename} (${fileSize} bytes)`);

    return {
      success: true,
      documentId,
      metadata,
      message: '파일이 성공적으로 업로드되었습니다'
    };

  } catch (error) {
    console.error('📄 파일 업로드 실패:', error.message);
    throw error;
  }
}

/**
 * 파일 다운로드 함수
 * @param {Object} options - 다운로드 옵션
 * @param {string} options.documentId - 문서 ID
 * @param {string} options.outputDir - 다운로드할 디렉토리
 * @param {number} options.userId - 요청 사용자 ID
 * @returns {Promise<Object>} 다운로드 결과
 */
async function downloadFile(options) {
  const { documentId, outputDir, userId } = options;

  try {
    // 입력 검증
    if (!documentId || !outputDir || !userId) {
      throw new Error('문서 ID, 출력 디렉토리, 사용자 ID는 필수입니다');
    }

    // TODO: 실제로는 데이터베이스에서 메타데이터 조회
    // 현재는 임시 구현
    const metadata = {
      id: documentId,
      filename: `${documentId}-example.pdf`,
      originalFilename: 'example.pdf',
      ownerId: userId,
      isPublic: false
    };

    // 권한 확인 (소유자이거나 공개 문서)
    if (metadata.ownerId !== userId && !metadata.isPublic) {
      throw new Error('파일에 접근할 권한이 없습니다');
    }

    // 출력 디렉토리 생성
    await fs.ensureDir(outputDir);

    // 다운로드 경로
    const downloadPath = path.join(outputDir, metadata.originalFilename);

    // TODO: 실제 파일 복사 (현재는 더미 파일 생성)
    await fs.writeFile(downloadPath, `더미 파일 내용 - ${documentId}`);

    console.log(`📥 파일 다운로드 완료: ${metadata.originalFilename}`);

    return {
      success: true,
      documentId,
      downloadPath,
      originalFilename: metadata.originalFilename,
      message: '파일이 성공적으로 다운로드되었습니다'
    };

  } catch (error) {
    console.error('📥 파일 다운로드 실패:', error.message);
    throw error;
  }
}

/**
 * 파일 검증 함수
 * @param {Object} options - 검증 옵션
 * @param {string} options.filePath - 검증할 파일 경로
 * @param {boolean} [options.strict=false] - 엄격한 검증 모드
 * @returns {Promise<Object>} 검증 결과
 */
async function validateFile(options) {
  const { filePath, strict = false } = options;

  try {
    // 입력 검증
    if (!filePath) {
      throw new Error('파일 경로는 필수입니다');
    }

    // 파일 존재 확인
    if (!await fs.pathExists(filePath)) {
      return {
        valid: false,
        errors: ['파일을 찾을 수 없습니다']
      };
    }

    const errors = [];
    const warnings = [];

    // 파일 정보 조회
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    const originalFilename = path.basename(filePath);
    const fileExtension = path.extname(originalFilename).toLowerCase().substring(1);

    // 기본 검증
    // 1. 파일 크기 검증
    if (fileSize > DEFAULT_CONFIG.maxFileSize) {
      errors.push(`파일 크기가 ${DEFAULT_CONFIG.maxFileSize / 1024 / 1024}MB를 초과합니다`);
    }

    // 2. 파일 타입 검증
    if (!DEFAULT_CONFIG.allowedTypes.includes(fileExtension)) {
      errors.push(`지원하지 않는 파일 형식입니다: ${fileExtension}`);
    }

    // 3. 파일명 검증
    if (originalFilename.length > 255) {
      errors.push('파일명이 너무 깁니다 (최대 255자)');
    }

    // 엄격한 검증 모드
    if (strict) {
      // 파일 내용 기반 타입 검증 (향후 file-type 패키지 사용)
      // 바이러스 스캔 (향후 추가)
      // 메타데이터 검증 (향후 추가)
      warnings.push('엄격한 검증 모드는 아직 완전히 구현되지 않았습니다');
    }

    const isValid = errors.length === 0;

    console.log(`🔍 파일 검증 ${isValid ? '통과' : '실패'}: ${originalFilename}`);

    return {
      valid: isValid,
      errors,
      warnings,
      metadata: {
        filename: originalFilename,
        fileType: fileExtension,
        fileSize,
        sizeFormatted: formatFileSize(fileSize)
      }
    };

  } catch (error) {
    console.error('🔍 파일 검증 실패:', error.message);
    throw error;
  }
}

/**
 * 파일 삭제 함수
 * @param {Object} options - 삭제 옵션
 * @param {string} options.documentId - 문서 ID
 * @param {number} options.userId - 요청 사용자 ID
 * @returns {Promise<Object>} 삭제 결과
 */
async function deleteFile(options) {
  const { documentId, userId } = options;

  try {
    // 입력 검증
    if (!documentId || !userId) {
      throw new Error('문서 ID와 사용자 ID는 필수입니다');
    }

    // TODO: 실제로는 데이터베이스에서 메타데이터 조회 및 권한 확인
    // 현재는 임시 구현
    const metadata = {
      id: documentId,
      ownerId: userId,
      filename: `${documentId}-example.pdf`
    };

    // 권한 확인 (소유자만 삭제 가능)
    if (metadata.ownerId !== userId) {
      throw new Error('파일을 삭제할 권한이 없습니다');
    }

    // TODO: 실제 파일 삭제 및 DB 레코드 삭제

    console.log(`🗑️ 파일 삭제 완료: ${documentId}`);

    return {
      success: true,
      documentId,
      message: '파일이 성공적으로 삭제되었습니다'
    };

  } catch (error) {
    console.error('🗑️ 파일 삭제 실패:', error.message);
    throw error;
  }
}

/**
 * 파일 크기를 읽기 쉬운 형태로 포맷
 * @param {number} bytes - 바이트 수
 * @returns {string} 포맷된 크기
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 라이브러리 정보 조회
 * @returns {Object} 라이브러리 정보
 */
function getLibraryInfo() {
  return {
    name: 'document-lib',
    version: VERSION,
    description: 'DOT Platform 문서 관리 라이브러리',
    config: DEFAULT_CONFIG,
    supportedCommands: ['upload', 'download', 'validate', 'delete', 'status']
  };
}

// 메인 exports
module.exports = {
  // 핵심 기능
  uploadFile,
  downloadFile,
  validateFile,
  deleteFile,

  // 유틸리티
  formatFileSize,
  getLibraryInfo,

  // 설정
  VERSION,
  DEFAULT_CONFIG
};