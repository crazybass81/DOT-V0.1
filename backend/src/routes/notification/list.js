/**
 * T289: Notification List API 엔드포인트
 * GET /api/v1/notifications
 *
 * 알림 목록 조회
 * - 사용자별 알림 조회
 * - 상태, 타입, 날짜 필터링
 * - 페이지네이션 지원
 * - 읽음 상태 관리
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const pool = require('../../db');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');

/**
 * GET /api/v1/notifications
 * 알림 목록 조회
 */
router.get('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        status,         // sent, scheduled, failed, cancelled
        type,          // email, sms, push, in_app
        from_date,
        to_date,
        recipient_id,
        business_id,
        page = 1,
        limit = 20,
        sort = 'desc'  // desc: 최신순, asc: 오래된순
      } = req.query;

      // 기본 쿼리
      let query = `
        SELECT
          nl.id,
          nl.type,
          nl.recipient_id,
          nl.recipient_address,
          nl.template_id,
          nl.subject,
          nl.content,
          nl.status,
          nl.sent_by,
          nl.business_id,
          nl.scheduled_at,
          nl.sent_at,
          nl.created_at,
          nl.message_id,
          nl.error_message,
          nl.is_read,
          nl.read_at,
          u.name as sent_by_name,
          r.name as recipient_name,
          b.name as business_name
        FROM notification_logs nl
        LEFT JOIN users u ON nl.sent_by = u.id
        LEFT JOIN users r ON nl.recipient_id = r.id
        LEFT JOIN businesses b ON nl.business_id = b.id
        WHERE 1=1
      `;

      const queryParams = [];
      let paramCounter = 1;

      // 권한 필터 - 일반 사용자는 자신의 알림만 조회
      if (!req.user.isAdmin) {
        // 관리자가 아닌 경우
        if (recipient_id && recipient_id !== req.user.id) {
          // 다른 사용자의 알림 조회 시도
          if (business_id) {
            // 사업장 관리자/소유자 확인
            const roleCheck = await client.query(`
              SELECT role_type FROM user_roles
              WHERE user_id = $1 AND business_id = $2
                AND role_type IN ('owner', 'manager')
                AND is_active = true
            `, [req.user.id, business_id]);

            if (roleCheck.rows.length === 0) {
              return res.status(403).json({
                success: false,
                error: '다른 사용자의 알림을 조회할 권한이 없습니다.'
              });
            }
          } else {
            return res.status(403).json({
              success: false,
              error: '다른 사용자의 알림을 조회할 권한이 없습니다.'
            });
          }
        } else {
          // 자신의 알림만 조회
          query += ` AND (nl.recipient_id = $${paramCounter} OR nl.sent_by = $${paramCounter})`;
          queryParams.push(req.user.id);
          paramCounter++;
        }
      }

      // 수신자 필터
      if (recipient_id) {
        query += ` AND nl.recipient_id = $${paramCounter}`;
        queryParams.push(recipient_id);
        paramCounter++;
      }

      // 상태 필터
      if (status) {
        const statuses = status.split(',');
        query += ` AND nl.status = ANY($${paramCounter})`;
        queryParams.push(statuses);
        paramCounter++;
      }

      // 타입 필터
      if (type) {
        const types = type.split(',');
        query += ` AND nl.type = ANY($${paramCounter})`;
        queryParams.push(types);
        paramCounter++;
      }

      // 사업장 필터
      if (business_id) {
        query += ` AND nl.business_id = $${paramCounter}`;
        queryParams.push(business_id);
        paramCounter++;
      }

      // 날짜 필터
      if (from_date) {
        query += ` AND nl.created_at >= $${paramCounter}`;
        queryParams.push(from_date);
        paramCounter++;
      }

      if (to_date) {
        query += ` AND nl.created_at <= $${paramCounter}`;
        queryParams.push(to_date);
        paramCounter++;
      }

      // 정렬
      const sortOrder = sort.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      query += ` ORDER BY nl.created_at ${sortOrder}, nl.id ${sortOrder}`;

      // 페이지네이션
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query += ` LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
      queryParams.push(parseInt(limit), offset);

      // 쿼리 실행
      const result = await client.query(query, queryParams);

      // 전체 개수 조회
      let countQuery = query.replace(
        /SELECT[\s\S]*FROM/,
        'SELECT COUNT(*) as total FROM'
      ).replace(/ORDER BY[\s\S]*$/, '');

      const countParams = queryParams.slice(0, -2); // LIMIT, OFFSET 제외
      const countResult = await client.query(countQuery, countParams);

      // 응답 데이터 가공
      const notifications = result.rows.map(row => ({
        id: row.id,
        type: row.type,
        recipient: {
          id: row.recipient_id,
          name: row.recipient_name,
          address: row.recipient_address
        },
        templateId: row.template_id,
        subject: row.subject,
        content: row.content ? (
          row.content.length > 100
            ? row.content.substring(0, 100) + '...'
            : row.content
        ) : null,
        status: row.status,
        sentBy: {
          id: row.sent_by,
          name: row.sent_by_name
        },
        business: row.business_id ? {
          id: row.business_id,
          name: row.business_name
        } : null,
        isRead: row.is_read,
        readAt: row.read_at,
        scheduledAt: row.scheduled_at,
        sentAt: row.sent_at,
        createdAt: row.created_at,
        messageId: row.message_id,
        errorMessage: row.error_message
      }));

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            total: parseInt(countResult.rows[0].total),
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(countResult.rows[0].total / limit)
          }
        }
      });

    } catch (error) {
      logger.error('알림 목록 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '알림 목록 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/notifications/stats
 * 알림 통계 조회
 */
router.get('/stats',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const { business_id, from_date, to_date } = req.query;

      // 권한 확인
      if (business_id) {
        const roleCheck = await client.query(`
          SELECT role_type FROM user_roles
          WHERE user_id = $1 AND business_id = $2
            AND role_type IN ('owner', 'manager')
            AND is_active = true
        `, [req.user.id, business_id]);

        if (roleCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            error: '통계를 조회할 권한이 없습니다.'
          });
        }
      }

      // 기본 조건
      let whereClause = business_id ? 'WHERE business_id = $1' : 'WHERE 1=1';
      const params = business_id ? [business_id] : [];

      // 날짜 필터
      if (from_date) {
        const paramNum = params.length + 1;
        whereClause += ` AND created_at >= $${paramNum}`;
        params.push(from_date);
      }

      if (to_date) {
        const paramNum = params.length + 1;
        whereClause += ` AND created_at <= $${paramNum}`;
        params.push(to_date);
      }

      // 통계 조회
      const statsQuery = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
          COUNT(CASE WHEN type = 'email' THEN 1 END) as email_count,
          COUNT(CASE WHEN type = 'sms' THEN 1 END) as sms_count,
          COUNT(CASE WHEN type = 'push' THEN 1 END) as push_count,
          COUNT(CASE WHEN type = 'in_app' THEN 1 END) as in_app_count,
          COUNT(CASE WHEN is_read = true THEN 1 END) as read_count,
          COUNT(CASE WHEN is_read = false OR is_read IS NULL THEN 1 END) as unread_count
        FROM notification_logs
        ${whereClause}
      `;

      const statsResult = await client.query(statsQuery, params);

      // 시간대별 통계
      const hourlyQuery = `
        SELECT
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as count,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count
        FROM notification_logs
        ${whereClause}
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
        LIMIT 24
      `;

      const hourlyResult = await client.query(hourlyQuery, params);

      // 템플릿별 통계
      const templateQuery = `
        SELECT
          template_id,
          COUNT(*) as usage_count,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as success_count
        FROM notification_logs
        ${whereClause} AND template_id IS NOT NULL
        GROUP BY template_id
        ORDER BY usage_count DESC
        LIMIT 10
      `;

      const templateResult = await client.query(templateQuery, params);

      const stats = statsResult.rows[0];

      res.json({
        success: true,
        data: {
          overview: {
            total: parseInt(stats.total),
            sent: parseInt(stats.sent),
            scheduled: parseInt(stats.scheduled),
            failed: parseInt(stats.failed),
            cancelled: parseInt(stats.cancelled),
            successRate: stats.total > 0
              ? ((parseInt(stats.sent) / parseInt(stats.total)) * 100).toFixed(2) + '%'
              : '0%'
          },
          byType: {
            email: parseInt(stats.email_count),
            sms: parseInt(stats.sms_count),
            push: parseInt(stats.push_count),
            inApp: parseInt(stats.in_app_count)
          },
          readStatus: {
            read: parseInt(stats.read_count),
            unread: parseInt(stats.unread_count)
          },
          hourlyTrend: hourlyResult.rows.map(row => ({
            hour: row.hour,
            total: parseInt(row.count),
            sent: parseInt(row.sent_count)
          })),
          topTemplates: templateResult.rows.map(row => ({
            templateId: row.template_id,
            usageCount: parseInt(row.usage_count),
            successCount: parseInt(row.success_count),
            successRate: ((parseInt(row.success_count) / parseInt(row.usage_count)) * 100).toFixed(2) + '%'
          }))
        }
      });

    } catch (error) {
      logger.error('알림 통계 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '알림 통계 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * PUT /api/v1/notifications/:id/read
 * 알림 읽음 처리
 */
router.put('/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const notificationId = req.params.id;

      // 알림 조회 및 권한 확인
      const notificationQuery = `
        SELECT * FROM notification_logs
        WHERE id = $1 AND recipient_id = $2
      `;
      const notificationResult = await client.query(notificationQuery, [
        notificationId,
        req.user.id
      ]);

      if (notificationResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '알림을 찾을 수 없습니다.'
        });
      }

      // 읽음 처리
      const updateQuery = `
        UPDATE notification_logs
        SET is_read = true, read_at = NOW()
        WHERE id = $1 AND is_read = false
        RETURNING *
      `;
      const updateResult = await client.query(updateQuery, [notificationId]);

      if (updateResult.rows.length === 0) {
        // 이미 읽음 상태
        return res.json({
          success: true,
          message: '이미 읽은 알림입니다.'
        });
      }

      res.json({
        success: true,
        message: '알림을 읽음 처리했습니다.',
        data: {
          notificationId: updateResult.rows[0].id,
          readAt: updateResult.rows[0].read_at
        }
      });

    } catch (error) {
      logger.error('알림 읽음 처리 오류:', error);
      res.status(500).json({
        success: false,
        error: '알림 읽음 처리 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * PUT /api/v1/notifications/read-all
 * 모든 알림 읽음 처리
 */
router.put('/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const { business_id } = req.body;

      let query = `
        UPDATE notification_logs
        SET is_read = true, read_at = NOW()
        WHERE recipient_id = $1 AND is_read = false
      `;
      const params = [req.user.id];

      // 사업장 필터
      if (business_id) {
        query += ` AND business_id = $2`;
        params.push(business_id);
      }

      const result = await client.query(query, params);

      res.json({
        success: true,
        message: `${result.rowCount}개의 알림을 읽음 처리했습니다.`,
        data: {
          updatedCount: result.rowCount
        }
      });

    } catch (error) {
      logger.error('전체 알림 읽음 처리 오류:', error);
      res.status(500).json({
        success: false,
        error: '전체 알림 읽음 처리 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * GET /api/v1/notifications/unread-count
 * 읽지 않은 알림 개수
 */
router.get('/unread-count',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const countQuery = `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN type = 'email' THEN 1 END) as email,
          COUNT(CASE WHEN type = 'sms' THEN 1 END) as sms,
          COUNT(CASE WHEN type = 'push' THEN 1 END) as push,
          COUNT(CASE WHEN type = 'in_app' THEN 1 END) as in_app
        FROM notification_logs
        WHERE recipient_id = $1 AND (is_read = false OR is_read IS NULL)
      `;

      const result = await client.query(countQuery, [req.user.id]);

      res.json({
        success: true,
        data: {
          total: parseInt(result.rows[0].total),
          byType: {
            email: parseInt(result.rows[0].email),
            sms: parseInt(result.rows[0].sms),
            push: parseInt(result.rows[0].push),
            inApp: parseInt(result.rows[0].in_app)
          }
        }
      });

    } catch (error) {
      logger.error('읽지 않은 알림 개수 조회 오류:', error);
      res.status(500).json({
        success: false,
        error: '읽지 않은 알림 개수 조회 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

module.exports = router;