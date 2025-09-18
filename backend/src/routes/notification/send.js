/**
 * T288: Notification Send API 엔드포인트
 * POST /api/v1/notifications
 *
 * 알림 발송 관리
 * - 이메일, SMS, 인앱 알림
 * - 템플릿 기반 발송
 * - 예약 발송
 * - 일괄 발송
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const notificationLib = require('../../lib/notification-lib');
const pool = require('../../db');
const logger = require('../../utils/logger');
const moment = require('moment-timezone');

/**
 * POST /api/v1/notifications
 * 알림 발송
 */
router.post('/',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        type = 'email', // email, sms, push, in_app
        recipient,
        recipients, // 일괄 발송용
        template_id,
        template_data,
        subject,
        content,
        priority = 1, // 0: low, 1: normal, 2: high, 3: urgent
        scheduled_at,
        business_id
      } = req.body;

      // 입력 검증
      if (!recipient && (!recipients || recipients.length === 0)) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_RECIPIENT',
          message: '수신자 정보가 필요합니다.'
        });
      }

      if (!template_id && !content) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_CONTENT',
          message: '템플릿 ID 또는 내용이 필요합니다.'
        });
      }

      // 사업장 권한 확인
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
            error: '알림을 발송할 권한이 없습니다.'
          });
        }
      }

      // 일괄 발송
      if (recipients && recipients.length > 0) {
        // 수신자 정보 조회
        const recipientData = [];
        for (const recipientId of recipients) {
          const userQuery = `
            SELECT id, email, phone, name FROM users WHERE id = $1
          `;
          const userResult = await client.query(userQuery, [recipientId]);

          if (userResult.rows.length > 0) {
            recipientData.push(userResult.rows[0]);
          }
        }

        // 일괄 알림 생성
        const notifications = recipientData.map(user => ({
          type,
          recipient: type === 'email' ? user.email : user.phone,
          templateId: template_id,
          data: {
            ...template_data,
            userName: user.name
          },
          priority,
          scheduledAt: scheduled_at,
          metadata: {
            userId: user.id,
            businessId: business_id,
            sentBy: req.user.id
          }
        }));

        // 발송
        const bulkResult = await notificationLib.sendBulkNotifications(
          notifications,
          { parallel: true, batchSize: 10 }
        );

        // DB 기록
        for (const notification of notifications) {
          await client.query(`
            INSERT INTO notification_logs (
              type,
              recipient_id,
              recipient_address,
              template_id,
              content,
              status,
              sent_by,
              business_id,
              scheduled_at,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          `, [
            type,
            notification.metadata.userId,
            notification.recipient,
            template_id,
            JSON.stringify(notification.data),
            bulkResult.success ? 'sent' : 'failed',
            req.user.id,
            business_id,
            scheduled_at
          ]);
        }

        logger.info(`일괄 알림 발송: type=${type}, count=${recipients.length}, by=${req.user.id}`);

        return res.status(201).json({
          success: true,
          message: `${bulkResult.data.sent}개 알림 발송 완료`,
          data: {
            type,
            totalRecipients: recipients.length,
            sent: bulkResult.data.sent,
            failed: bulkResult.data.failed,
            errors: bulkResult.data.errors
          }
        });
      }

      // 단일 발송
      // 수신자 정보 조회
      let recipientAddress = recipient;
      let recipientUserId = null;

      if (type === 'email' && !recipient.includes('@')) {
        // 사용자 ID로 이메일 조회
        const userResult = await client.query(`
          SELECT id, email, name FROM users WHERE id = $1
        `, [recipient]);

        if (userResult.rows.length > 0) {
          recipientAddress = userResult.rows[0].email;
          recipientUserId = userResult.rows[0].id;

          // 템플릿 데이터에 사용자 이름 추가
          if (template_data) {
            template_data.userName = userResult.rows[0].name;
          }
        }
      } else if (type === 'sms' && !recipient.startsWith('01')) {
        // 사용자 ID로 전화번호 조회
        const userResult = await client.query(`
          SELECT id, phone, name FROM users WHERE id = $1
        `, [recipient]);

        if (userResult.rows.length > 0) {
          recipientAddress = userResult.rows[0].phone;
          recipientUserId = userResult.rows[0].id;

          if (template_data) {
            template_data.userName = userResult.rows[0].name;
          }
        }
      }

      // 알림 객체 생성
      const notification = {
        type,
        recipient: recipientAddress,
        templateId: template_id,
        data: template_data,
        content: content ? { subject, body: content } : null,
        priority,
        scheduledAt: scheduled_at,
        metadata: {
          userId: recipientUserId,
          businessId: business_id,
          sentBy: req.user.id
        }
      };

      // 발송
      const result = await notificationLib.sendNotification(notification);

      // DB 기록
      const logResult = await client.query(`
        INSERT INTO notification_logs (
          type,
          recipient_id,
          recipient_address,
          template_id,
          subject,
          content,
          status,
          sent_by,
          business_id,
          scheduled_at,
          created_at,
          message_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
        RETURNING id
      `, [
        type,
        recipientUserId,
        recipientAddress,
        template_id,
        subject,
        content || JSON.stringify(template_data),
        result.success ? (result.scheduled ? 'scheduled' : 'sent') : 'failed',
        req.user.id,
        business_id,
        scheduled_at,
        result.messageId || result.queueId
      ]);

      logger.info(`알림 발송: id=${logResult.rows[0].id}, type=${type}, to=${recipientAddress}`);

      res.status(201).json({
        success: true,
        message: result.scheduled ? '알림이 예약되었습니다.' : '알림이 발송되었습니다.',
        data: {
          notificationId: logResult.rows[0].id,
          type,
          recipient: recipientAddress,
          status: result.success ? (result.scheduled ? 'scheduled' : 'sent') : 'failed',
          scheduledAt: scheduled_at,
          messageId: result.messageId || result.queueId
        }
      });

    } catch (error) {
      logger.error('알림 발송 오류:', error);
      res.status(500).json({
        success: false,
        error: '알림 발송 중 오류가 발생했습니다.',
        message: error.message
      });
    } finally {
      client.release();
    }
  })
);

/**
 * POST /api/v1/notifications/template
 * 템플릿 기반 알림 발송
 */
router.post('/template',
  authenticate,
  authorize(['owner', 'manager']),
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        template_id,
        business_id,
        role_filter, // owner, manager, worker
        user_ids,
        variables = {}
      } = req.body;

      if (!template_id) {
        return res.status(400).json({
          success: false,
          error: '템플릿 ID가 필요합니다.'
        });
      }

      // 수신자 목록 구성
      let recipients = [];

      if (user_ids && user_ids.length > 0) {
        // 특정 사용자들
        const userQuery = `
          SELECT id, email, phone, name FROM users
          WHERE id = ANY($1)
        `;
        const userResult = await client.query(userQuery, [user_ids]);
        recipients = userResult.rows;
      } else if (business_id && role_filter) {
        // 사업장 역할별 사용자
        const roleQuery = `
          SELECT u.id, u.email, u.phone, u.name
          FROM users u
          JOIN user_roles ur ON u.id = ur.user_id
          WHERE ur.business_id = $1
            AND ur.role_type = $2
            AND ur.is_active = true
        `;
        const roleResult = await client.query(roleQuery, [business_id, role_filter]);
        recipients = roleResult.rows;
      } else if (business_id) {
        // 사업장 전체 사용자
        const businessQuery = `
          SELECT u.id, u.email, u.phone, u.name
          FROM users u
          JOIN user_roles ur ON u.id = ur.user_id
          WHERE ur.business_id = $1
            AND ur.is_active = true
        `;
        const businessResult = await client.query(businessQuery, [business_id]);
        recipients = businessResult.rows;
      }

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          error: '수신자를 찾을 수 없습니다.'
        });
      }

      // 템플릿별 알림 타입 결정
      const templateType = template_id.startsWith('auth') ? 'email' :
                          template_id.startsWith('attendance') ? 'in_app' :
                          template_id.startsWith('schedule') ? 'email' :
                          'email';

      // 알림 생성
      const notifications = recipients.map(user => ({
        type: templateType,
        recipient: templateType === 'email' ? user.email : user.id,
        templateId: template_id,
        data: {
          ...variables,
          userName: user.name,
          businessId: business_id
        },
        metadata: {
          userId: user.id,
          businessId: business_id,
          sentBy: req.user.id
        }
      }));

      // 일괄 발송
      const result = await notificationLib.sendBulkNotifications(
        notifications,
        { parallel: true }
      );

      // DB 기록
      await client.query(`
        INSERT INTO notification_campaigns (
          template_id,
          business_id,
          sent_by,
          recipient_count,
          success_count,
          failed_count,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        template_id,
        business_id,
        req.user.id,
        recipients.length,
        result.data.sent,
        result.data.failed
      ]);

      logger.info(`템플릿 알림 발송: template=${template_id}, recipients=${recipients.length}`);

      res.status(201).json({
        success: true,
        message: `${result.data.sent}명에게 알림을 발송했습니다.`,
        data: {
          templateId: template_id,
          totalRecipients: recipients.length,
          sent: result.data.sent,
          failed: result.data.failed
        }
      });

    } catch (error) {
      logger.error('템플릿 알림 발송 오류:', error);
      res.status(500).json({
        success: false,
        error: '템플릿 알림 발송 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * POST /api/v1/notifications/cancel/:id
 * 예약 알림 취소
 */
router.post('/cancel/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      const notificationId = req.params.id;

      // 알림 조회
      const notificationQuery = `
        SELECT * FROM notification_logs
        WHERE id = $1 AND sent_by = $2
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

      const notification = notificationResult.rows[0];

      if (notification.status !== 'scheduled') {
        return res.status(400).json({
          success: false,
          error: `${notification.status} 상태의 알림은 취소할 수 없습니다.`
        });
      }

      // 취소 처리
      const cancelResult = await notificationLib.cancelNotification(notification.message_id);

      if (cancelResult.success) {
        // DB 상태 업데이트
        await client.query(`
          UPDATE notification_logs
          SET status = 'cancelled', updated_at = NOW()
          WHERE id = $1
        `, [notificationId]);

        logger.info(`알림 취소: id=${notificationId}, by=${req.user.id}`);

        res.json({
          success: true,
          message: '예약 알림이 취소되었습니다.'
        });
      } else {
        res.status(400).json({
          success: false,
          error: cancelResult.error
        });
      }

    } catch (error) {
      logger.error('알림 취소 오류:', error);
      res.status(500).json({
        success: false,
        error: '알림 취소 중 오류가 발생했습니다.'
      });
    } finally {
      client.release();
    }
  })
);

/**
 * POST /api/v1/notifications/test
 * 알림 테스트 발송
 */
router.post('/test',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const { type = 'email' } = req.body;
      const user = req.user;

      let result;

      if (type === 'email') {
        // 이메일 테스트
        result = await notificationLib.sendNotification({
          type: 'email',
          recipient: user.email,
          content: {
            subject: '[DOT Platform] 알림 테스트',
            body: `안녕하세요 ${user.name}님,\n\n이것은 알림 시스템 테스트 메시지입니다.\n\n정상적으로 수신되셨다면 알림 시스템이 올바르게 작동하고 있습니다.\n\nDOT Platform`
          }
        });
      } else if (type === 'sms') {
        // SMS 테스트
        result = await notificationLib.sendNotification({
          type: 'sms',
          recipient: user.phone,
          content: {
            body: `[DOT] 알림 테스트 메시지입니다. 정상 수신되었습니다.`
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          error: '지원하지 않는 알림 타입입니다.'
        });
      }

      logger.info(`테스트 알림 발송: type=${type}, user=${user.id}`);

      res.json({
        success: result.success,
        message: result.success ? '테스트 알림이 발송되었습니다.' : '테스트 알림 발송에 실패했습니다.',
        data: {
          type,
          recipient: type === 'email' ? user.email : user.phone,
          simulationMode: result.simulationMode
        }
      });

    } catch (error) {
      logger.error('테스트 알림 발송 오류:', error);
      res.status(500).json({
        success: false,
        error: '테스트 알림 발송 중 오류가 발생했습니다.'
      });
    }
  })
);

module.exports = router;