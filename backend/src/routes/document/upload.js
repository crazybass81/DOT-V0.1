/**
 * T286: Document Upload API 엔드포인트
 * POST /api/v1/documents
 *
 * 파일 업로드 및 문서 관리
 * - 10MB 크기 제한
 * - 허용 파일: pdf, jpg, jpeg, png, doc, docx
 * - 3년 자동 만료
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { authenticate, authorize } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const documentLib = require('../../lib/document-lib');
const pool = require('../../db');
const logger = require('../../utils/logger');

// Multer 설정
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads/documents');
    await fs.ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 보안 파일명 생성
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `DOC-${uniqueSuffix}${ext}`);
  }
});

// 파일 필터 - 허용된 타입만
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`허용되지 않는 파일 형식입니다. 허용 형식: ${allowedTypes.join(', ')}`), false);
  }
};

// Multer 인스턴스 생성
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // 한 번에 최대 5개 파일
  },
  fileFilter: fileFilter
});

/**
 * POST /api/v1/documents
 * 문서 업로드
 */
router.post('/',
  authenticate,
  upload.single('file'), // 단일 파일 업로드
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      // 파일 확인
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: '업로드할 파일이 없습니다.'
        });
      }

      const {
        business_id,
        document_type,
        description,
        expires_at,
        is_public = false
      } = req.body;

      // 권한 확인 - 사업장 소속 여부
      if (business_id) {
        const roleCheck = await client.query(`
          SELECT role_type FROM user_roles
          WHERE user_id = $1 AND business_id = $2 AND is_active = true
        `, [req.user.id, business_id]);

        if (roleCheck.rows.length === 0) {
          // 업로드된 파일 삭제
          await fs.remove(req.file.path);

          return res.status(403).json({
            success: false,
            error: '해당 사업장에 대한 권한이 없습니다.'
          });
        }
      }

      // document-lib를 통한 문서 처리
      const uploadResult = await documentLib.uploadFile({
        filePath: req.file.path,
        ownerId: req.user.id,
        businessId: business_id,
        category: document_type,
        isPublic: is_public === 'true' || is_public === true
      });

      if (!uploadResult.success) {
        // 업로드 실패 시 파일 삭제
        await fs.remove(req.file.path);

        return res.status(400).json({
          success: false,
          error: uploadResult.error,
          message: uploadResult.message
        });
      }

      // DB에 문서 정보 저장
      const insertQuery = `
        INSERT INTO documents (
          id,
          filename,
          original_name,
          file_path,
          file_size,
          mime_type,
          document_type,
          description,
          owner_id,
          business_id,
          is_public,
          expires_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING *
      `;

      const expiryDate = expires_at ? new Date(expires_at) :
                        new Date(Date.now() + (365 * 3 * 24 * 60 * 60 * 1000)); // 3년 후

      const documentResult = await client.query(insertQuery, [
        uploadResult.data.documentId,
        req.file.filename,
        req.file.originalname,
        req.file.path,
        req.file.size,
        req.file.mimetype,
        document_type || 'general',
        description,
        req.user.id,
        business_id,
        is_public === 'true' || is_public === true,
        expiryDate
      ]);

      const document = documentResult.rows[0];

      logger.info(`문서 업로드 성공: id=${document.id}, user=${req.user.id}, size=${req.file.size}`);

      res.status(201).json({
        success: true,
        message: '문서가 성공적으로 업로드되었습니다.',
        data: {
          documentId: document.id,
          filename: document.filename,
          originalName: document.original_name,
          size: document.file_size,
          mimeType: document.mime_type,
          documentType: document.document_type,
          description: document.description,
          isPublic: document.is_public,
          expiresAt: document.expires_at,
          createdAt: document.created_at,
          downloadUrl: `/api/v1/documents/${document.id}`
        }
      });

    } catch (error) {
      // 오류 발생 시 업로드된 파일 삭제
      if (req.file && req.file.path) {
        await fs.remove(req.file.path).catch(err => {
          logger.error('파일 삭제 실패:', err);
        });
      }

      logger.error('문서 업로드 오류:', error);

      // Multer 에러 처리
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'FILE_TOO_LARGE',
          message: '파일 크기가 10MB를 초과합니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: '문서 업로드 중 오류가 발생했습니다.',
        message: error.message
      });
    } finally {
      client.release();
    }
  })
);

/**
 * POST /api/v1/documents/bulk
 * 여러 문서 일괄 업로드
 */
router.post('/bulk',
  authenticate,
  authorize(['owner', 'manager']),
  upload.array('files', 5), // 최대 5개 파일
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: '업로드할 파일이 없습니다.'
        });
      }

      const { business_id, document_type } = req.body;
      const uploadedDocuments = [];
      const failedUploads = [];

      // 각 파일 처리
      for (const file of req.files) {
        try {
          // document-lib를 통한 처리
          const uploadResult = await documentLib.uploadFile({
            filePath: file.path,
            ownerId: req.user.id,
            businessId: business_id,
            category: document_type
          });

          if (uploadResult.success) {
            // DB 저장
            const insertResult = await client.query(`
              INSERT INTO documents (
                id, filename, original_name, file_path, file_size,
                mime_type, document_type, owner_id, business_id,
                expires_at, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                       NOW() + INTERVAL '3 years', NOW())
              RETURNING id, filename, original_name, file_size
            `, [
              uploadResult.data.documentId,
              file.filename,
              file.originalname,
              file.path,
              file.size,
              file.mimetype,
              document_type || 'general',
              req.user.id,
              business_id
            ]);

            uploadedDocuments.push(insertResult.rows[0]);
          } else {
            failedUploads.push({
              filename: file.originalname,
              error: uploadResult.error
            });
            // 실패한 파일 삭제
            await fs.remove(file.path);
          }
        } catch (error) {
          failedUploads.push({
            filename: file.originalname,
            error: error.message
          });
          // 실패한 파일 삭제
          await fs.remove(file.path);
        }
      }

      await client.query('COMMIT');

      const totalSize = uploadedDocuments.reduce((sum, doc) => sum + doc.file_size, 0);

      logger.info(`일괄 업로드: 성공=${uploadedDocuments.length}, 실패=${failedUploads.length}`);

      res.status(201).json({
        success: true,
        message: `${uploadedDocuments.length}개 파일 업로드 완료`,
        data: {
          uploaded: uploadedDocuments,
          failed: failedUploads,
          totalFiles: req.files.length,
          totalSize: totalSize
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');

      // 모든 업로드된 파일 삭제
      for (const file of req.files) {
        await fs.remove(file.path).catch(err => {
          logger.error('파일 삭제 실패:', err);
        });
      }

      logger.error('일괄 업로드 오류:', error);
      res.status(500).json({
        success: false,
        error: '일괄 업로드 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * 에러 핸들러 미들웨어 (Multer 에러 처리)
 */
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: '파일 크기가 10MB를 초과합니다.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'TOO_MANY_FILES',
        message: '한 번에 최대 5개 파일까지 업로드 가능합니다.'
      });
    }
  }

  res.status(400).json({
    success: false,
    error: error.message
  });
});

module.exports = router;