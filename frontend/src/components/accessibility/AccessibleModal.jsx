/**
 * 접근 가능한 모달 컴포넌트
 * WCAG 2.1 AA 준수 모달 구현
 *
 * 주요 기능:
 * - 포커스 트랩
 * - ESC 키로 닫기
 * - 배경 클릭으로 닫기
 * - 스크린 리더 지원
 * - 키보드 네비게이션
 */

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  createFocusTrap,
  useKeyboardNavigation,
  announceToScreenReader
} from '../../utils/accessibility';
import '../../styles/accessibility.css';

/**
 * 모달 포털 컴포넌트
 */
function ModalPortal({ children }) {
  const [portalRoot] = useState(() => {
    let portal = document.getElementById('modal-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'modal-portal';
      document.body.appendChild(portal);
    }
    return portal;
  });

  return ReactDOM.createPortal(children, portalRoot);
}

/**
 * 접근 가능한 모달 컴포넌트
 */
export function AccessibleModal({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  closeOnBackdrop = true,
  closeOnEscape = true,
  preventScroll = true,
  ariaLabel,
  ariaDescribedBy
}) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [cleanupFocusTrap, setCleanupFocusTrap] = useState(null);
  const { handleKeyDown } = useKeyboardNavigation();

  // 모달 열림/닫힘 처리
  useEffect(() => {
    if (isOpen) {
      // 현재 포커스된 요소 저장
      previousFocusRef.current = document.activeElement;

      // 바디 스크롤 방지
      if (preventScroll) {
        document.body.style.overflow = 'hidden';
      }

      // 스크린 리더에 알림
      announceToScreenReader(`모달이 열렸습니다${title ? `: ${title}` : ''}`);

      // 포커스 트랩 생성 (다음 틱에서 실행)
      setTimeout(() => {
        if (modalRef.current) {
          const cleanup = createFocusTrap(modalRef.current);
          setCleanupFocusTrap(() => cleanup);
        }
      }, 0);
    } else {
      // 스크롤 복원
      if (preventScroll) {
        document.body.style.overflow = '';
      }

      // 포커스 복원
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }

      // 포커스 트랩 정리
      if (cleanupFocusTrap) {
        cleanupFocusTrap();
        setCleanupFocusTrap(null);
      }

      announceToScreenReader('모달이 닫혔습니다');
    }

    return () => {
      // 컴포넌트 언마운트 시 정리
      if (preventScroll) {
        document.body.style.overflow = '';
      }
      if (cleanupFocusTrap) {
        cleanupFocusTrap();
      }
    };
  }, [isOpen, title, preventScroll, cleanupFocusTrap]);

  // 키보드 이벤트 처리
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (event) => {
      handleKeyDown(event, {
        onEscape: () => {
          if (closeOnEscape) {
            onClose();
          }
        }
      });
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, onClose, closeOnEscape, handleKeyDown]);

  // 배경 클릭 처리
  const handleBackdropClick = (event) => {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onClose();
    }
  };

  // 모달이 열리지 않은 경우 렌더링 안함
  if (!isOpen) return null;

  // 모달 크기 클래스
  const sizeClass = {
    small: 'modal-small',
    medium: 'modal-medium',
    large: 'modal-large',
    fullscreen: 'modal-fullscreen'
  }[size] || 'modal-medium';

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        onClick={handleBackdropClick}
        aria-hidden="true"
      >
        <div
          ref={modalRef}
          className={`modal-content ${sizeClass}`}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel || title}
          aria-describedby={ariaDescribedBy}
          tabIndex={-1}
        >
          {/* 모달 헤더 */}
          <div className="modal-header">
            {title && (
              <h2 id="modal-title" className="modal-title">
                {title}
              </h2>
            )}
            <button
              className="modal-close"
              onClick={onClose}
              aria-label="모달 닫기"
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          {/* 모달 콘텐츠 */}
          <div className="modal-body">
            {children}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * 확인 모달 컴포넌트
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = '확인',
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'primary'
}) {
  const { handleKeyDown } = useKeyboardNavigation();

  // Enter/Space 키로 확인
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (event) => {
      handleKeyDown(event, {
        onSelect: (e) => {
          // 포커스된 버튼이 있으면 그 버튼 클릭
          if (e.target.tagName === 'BUTTON') {
            e.target.click();
          }
        }
      });
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, handleKeyDown]);

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  // 변형 클래스
  const variantClass = {
    primary: 'confirm-primary',
    danger: 'confirm-danger',
    warning: 'confirm-warning'
  }[variant] || 'confirm-primary';

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="small"
      ariaDescribedBy="confirm-message"
    >
      <div className={`confirm-modal ${variantClass}`}>
        <p id="confirm-message" className="confirm-message">
          {message}
        </p>

        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}

/**
 * 알림 모달 컴포넌트
 */
export function AlertModal({
  isOpen,
  onClose,
  title = '알림',
  message,
  closeLabel = '확인',
  type = 'info'
}) {
  // 자동 포커스를 위한 ref
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  // 타입별 아이콘
  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  };

  const typeClass = `alert-${type}`;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="small"
      ariaDescribedBy="alert-message"
    >
      <div className={`alert-modal ${typeClass}`}>
        <div className="alert-icon" aria-hidden="true">
          {icons[type]}
        </div>

        <p id="alert-message" className="alert-message">
          {message}
        </p>

        <div className="alert-actions">
          <button
            ref={closeButtonRef}
            type="button"
            className="btn btn-primary"
            onClick={onClose}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}

/**
 * 로딩 모달 컴포넌트
 */
export function LoadingModal({
  isOpen,
  message = '로딩 중...',
  progress,
  onCancel,
  cancelLabel = '취소'
}) {
  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={() => {}} // 로딩 중에는 임의로 닫을 수 없음
      title="처리 중"
      size="small"
      closeOnBackdrop={false}
      closeOnEscape={false}
      ariaDescribedBy="loading-message"
    >
      <div className="loading-modal">
        <div className="loading-spinner" aria-hidden="true" />

        <p id="loading-message" className="loading-message">
          {message}
        </p>

        {progress !== undefined && (
          <div className="progress-container">
            <div
              className="progress-bar"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`진행률 ${progress}%`}
            >
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="sr-only">{progress}% 완료</span>
          </div>
        )}

        {onCancel && (
          <div className="loading-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          </div>
        )}
      </div>
    </AccessibleModal>
  );
}

export default AccessibleModal;