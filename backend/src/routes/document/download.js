/**
 * T287: Document Download API 엔드포인트
 * GET /api/v1/documents/:id
 *
 * 문서 다운로드 및 조회
 * - 권한 확인
 * - 만료 확인
 * - 스트림 응답
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const documentLib = require('../../lib/document-lib');
const pool = require('../../db');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');

/**
 * GET /api/v1/documents/:id
 * 문서 다운로드
 */
router.get('/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const documentId = req.params.id;

      // 문서 정보 조회
      const documentQuery = `
        SELECT d.*, b.name as business_name
        FROM documents d
        LEFT JOIN businesses b ON d.business_id = b.id
        WHERE d.id = $1
      `;
      const documentResult = await client.query(documentQuery, [documentId]);

      if (documentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'DOCUMENT_NOT_FOUND',
          message: '문서를 찾을 수 없습니다.'
        });
      }

      const document = documentResult.rows[0];

      // 권한 확인
      // 1. 문서 소유자인 경우
      // 2. 같은 사업장 소속인 경우 (is_public이거나 manager/owner)
      // 3. 공개 문서인 경우
      let hasAccess = false;

      if (document.owner_id === req.user.id) {
        hasAccess = true;
      } else if (document.is_public) {
        // 공개 문서는 같은 사업장만
        if (document.business_id) {
          const roleCheck = await client.query(`
            SELECT role_type FROM user_roles
            WHERE user_id = $1 AND business_id = $2 AND is_active = true
          `, [req.user.id, document.business_id]);

          hasAccess = roleCheck.rows.length > 0;
        }
      } else if (document.business_id) {
        // 비공개 문서는 manager/owner만
        const roleCheck = await client.query(`
          SELECT role_type FROM user_roles
          WHERE user_id = $1 AND business_id = $2 AND is_active = true
            AND role_type IN ('owner', 'manager')
        `, [req.user.id, document.business_id]);

        hasAccess = roleCheck.rows.length > 0;
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'ACCESS_DENIED',
          message: '문서에 대한 접근 권한이 없습니다.'
        });
      }

      // 만료 확인
      if (document.expires_at && new Date(document.expires_at) < new Date()) {
        return res.status(410).json({
          success: false,
          error: 'DOCUMENT_EXPIRED',
          message: '만료된 문서입니다.',
          expiredAt: document.expires_at
        });
      }

      // 파일 존재 확인
      const filePath = document.file_path;
      if (!await fs.pathExists(filePath)) {
        logger.error(`파일 없음: ${filePath}`);
        return res.status(404).json({
          success: false,
          error: 'FILE_NOT_FOUND',
          message: '파일을 찾을 수 없습니다.'
        });
      }

      // 다운로드 이력 기록
      await client.query(`
        INSERT INTO document_access_logs (
          document_id,
          user_id,
          action,
          accessed_at,
          ip_address
        ) VALUES ($1, $2, 'download', NOW(), $3)
      `, [documentId, req.user.id, req.ip]);

      // 파일 스트림 응답
      const stat = await fs.stat(filePath);
      const filename = document.original_name || document.filename;

      // 헤더 설정
      res.set({
        'Content-Type': document.mime_type || 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'private, max-age=3600',
        'Last-Modified': stat.mtime.toUTCString()
      });

      // 스트림 전송
      const stream = fs.createReadStream(filePath);
      stream.on('error', (error) => {
        logger.error('파일 스트림 오류:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: '파일 전송 중 오류가 발생했습니다.'
          });
        }
      });

      stream.pipe(res);

      logger.info(`문서 다운로드: id=${documentId}, user=${req.user.id}`);

    } catch (error) {
      logger.error('문서 다운로드 오류:', error);
      res.status(500).json({
        success: false,
        error: '문서 다운로드 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/documents/:id/info
 * 문서 정보 조회 (다운로드 없이)
 */
router.get('/:id/info',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const documentId = req.params.id;

      // 문서 정보 조회
      const documentQuery = `
        SELECT
          d.id,
          d.filename,
          d.original_name,
          d.file_size,
          d.mime_type,
          d.document_type,
          d.description,
          d.is_public,
          d.expires_at,
          d.created_at,
          u.name as owner_name,
          b.name as business_name
        FROM documents d
        JOIN users u ON d.owner_id = u.id
        LEFT JOIN businesses b ON d.business_id = b.id
        WHERE d.id = $1
      `;
      const documentResult = await client.query(documentQuery, [documentId]);

      if (documentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'DOCUMENT_NOT_FOUND',
          message: '문서를 찾을 수 없습니다.'
        });
      }

      const document = documentResult.rows[0];

      // 권한 확인 (다운로드와 동일)
      let hasAccess = false;
      const userId = req.user.id;

      if (document.business_id) {
        const roleCheck = await client.query(`
          SELECT role_type FROM user_roles
          WHERE user_id = $1 AND business_id = $2 AND is_active = true
        `, [userId, document.business_id]);

        if (roleCheck.rows.length > 0) {
          const role = roleCheck.rows[0].role_type;
          hasAccess = document.is_public || role === 'owner' || role === 'manager';
        }
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'ACCESS_DENIED',
          message: '문서 정보에 대한 접근 권한이 없습니다.'
        });
      }

      // 접근 이력 조회
      const accessLogQuery = `
        SELECT COUNT(*) as download_count,
               MAX(accessed_at) as last_accessed
        FROM document_access_logs
        WHERE document_id = $1 AND action = 'download'
      `;
      const accessResult = await client.query(accessLogQuery, [documentId]);

      res.json({
        success: true,
        data: {
          id: document.id,
          filename: document.filename,
          originalName: document.original_name,
          size: document.file_size,
          sizeFormatted: formatFileSize(document.file_size),
          mimeType: document.mime_type,
          documentType: document.document_type,
          description: document.description,
          isPublic: document.is_public,
          ownerName: document.owner_name,
          businessName: document.business_name,
          createdAt: document.created_at,
          expiresAt: document.expires_at,
          isExpired: document.expires_at && new Date(document.expires_at) < new Date(),
          downloadCount: parseInt(accessResult.rows[0].download_count),
          lastAccessed: accessResult.rows[0].last_accessed,
          downloadUrl: `/api/v1/documents/${document.id}`
        }
      });

    } catch (error) {
      logger.error('문서 정보 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '문서 정보 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/documents
 * 문서 목록 조회
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        business_id,
        document_type,
        owner_id,
        page = 1,
        limit = 20,
        include_expired = false
      } = req.query;

      // 기본 쿼리
      let query = `
        SELECT
          d.id,
          d.filename,
          d.original_name,
          d.file_size,
          d.mime_type,
          d.document_type,
          d.description,
          d.is_public,
          d.expires_at,
          d.created_at,
          u.name as owner_name,
          b.name as business_name
        FROM documents d
        JOIN users u ON d.owner_id = u.id
        LEFT JOIN businesses b ON d.business_id = b.id
        WHERE 1=1
      `;

      const queryParams = [];
      let paramCounter = 1;

      // 사업장 필터
      if (business_id) {
        // 사업장 권한 확인
        const roleCheck = await client.query(`
          SELECT role_type FROM user_roles
          WHERE user_id = $1 AND business_id = $2 AND is_active = true
        `, [req.user.id, business_id]);

        if (roleCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            error: '해당 사업장에 대한 권한이 없습니다.'
          });
        }

        query += ` AND d.business_id = $${paramCounter}`;
        queryParams.push(business_id);
        paramCounter++;
      } else {
        // 사용자가 속한 모든 사업장의 문서
        query += ` AND (d.owner_id = $${paramCounter} OR d.business_id IN (
          SELECT business_id FROM user_roles
          WHERE user_id = $${paramCounter} AND is_active = true
        ))`;
        queryParams.push(req.user.id);
        paramCounter++;
      }

      // 문서 타입 필터
      if (document_type) {
        query += ` AND d.document_type = $${paramCounter}`;
        queryParams.push(document_type);
        paramCounter++;
      }

      // 소유자 필터
      if (owner_id) {
        query += ` AND d.owner_id = $${paramCounter}`;
        queryParams.push(owner_id);
        paramCounter++;
      }

      // 만료 필터
      if (!include_expired || include_expired === 'false') {
        query += ` AND (d.expires_at IS NULL OR d.expires_at > NOW())`;
      }

      // 정렬 및 페이지네이션
      query += ` ORDER BY d.created_at DESC`;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      query += ` LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
      queryParams.push(parseInt(limit), offset);

      // 실행
      const result = await client.query(query, queryParams);

      // 전체 개수 조회
      let countQuery = query.replace(
        /SELECT[\s\S]*FROM/,
        'SELECT COUNT(*) as total FROM'
      ).replace(/ORDER BY[\s\S]*$/, '');

      const countParams = queryParams.slice(0, -2); // LIMIT, OFFSET 제외
      const countResult = await client.query(countQuery, countParams);

      const documents = result.rows.map(doc => ({
        ...doc,
        sizeFormatted: formatFileSize(doc.file_size),
        isExpired: doc.expires_at && new Date(doc.expires_at) < new Date(),
        downloadUrl: `/api/v1/documents/${doc.id}`
      }));

      res.json({
        success: true,
        data: {
          documents,
          pagination: {
            total: parseInt(countResult.rows[0].total),
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(countResult.rows[0].total / limit)
          }
        }
      });

    } catch (error) {
      logger.error('문서 목록 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '문서 목록 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * DELETE /api/v1/documents/:id
 * 문서 삭제
 */
router.delete('/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const documentId = req.params.id;

      // 문서 조회
      const documentResult = await client.query(`
        SELECT * FROM documents WHERE id = $1
      `, [documentId]);

      if (documentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: '문서를 찾을 수 없습니다.'
        });
      }

      const document = documentResult.rows[0];

      // 삭제 권한 확인 (소유자 또는 관리자)
      let canDelete = document.owner_id === req.user.id;

      if (!canDelete && document.business_id) {
        const roleCheck = await client.query(`
          SELECT role_type FROM user_roles
          WHERE user_id = $1 AND business_id = $2
            AND role_type IN ('owner', 'manager')
            AND is_active = true
        `, [req.user.id, document.business_id]);

        canDelete = roleCheck.rows.length > 0;
      }

      if (!canDelete) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          error: '문서 삭제 권한이 없습니다.'
        });
      }

      // 파일 삭제
      if (document.file_path && await fs.pathExists(document.file_path)) {
        await fs.remove(document.file_path);
      }

      // DB에서 삭제
      await client.query(`
        DELETE FROM documents WHERE id = $1
      `, [documentId]);

      await client.query('COMMIT');

      logger.info(`문서 삭제: id=${documentId}, user=${req.user.id}`);

      res.json({
        success: true,
        message: '문서가 삭제되었습니다.'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('문서 삭제 오류:', error);
      res.status(500).json({
        success: false,
        error: '문서 삭제 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * 파일 크기 포맷팅 헬퍼
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;