/**
 * 웹 접근성 유틸리티
 * WCAG 2.1 AA 준수를 위한 헬퍼 함수들
 *
 * 주요 기능:
 * - 키보드 네비게이션 지원
 * - 스크린 리더 지원
 * - 색상 대비 검사
 * - 포커스 관리
 */

/**
 * 키보드 네비게이션 훅
 */
export function useKeyboardNavigation() {
  const handleKeyDown = (event, callbacks = {}) => {
    const { key, shiftKey, ctrlKey, altKey, metaKey } = event;

    // 특수 키 조합 처리
    const modifiers = { shiftKey, ctrlKey, altKey, metaKey };

    switch (key) {
      case 'Enter':
      case ' ':
        if (callbacks.onSelect) {
          event.preventDefault();
          callbacks.onSelect(event);
        }
        break;

      case 'Escape':
        if (callbacks.onEscape) {
          event.preventDefault();
          callbacks.onEscape(event);
        }
        break;

      case 'Tab':
        if (callbacks.onTab) {
          callbacks.onTab(event, modifiers);
        }
        break;

      case 'ArrowUp':
        if (callbacks.onArrowUp) {
          event.preventDefault();
          callbacks.onArrowUp(event);
        }
        break;

      case 'ArrowDown':
        if (callbacks.onArrowDown) {
          event.preventDefault();
          callbacks.onArrowDown(event);
        }
        break;

      case 'ArrowLeft':
        if (callbacks.onArrowLeft) {
          event.preventDefault();
          callbacks.onArrowLeft(event);
        }
        break;

      case 'ArrowRight':
        if (callbacks.onArrowRight) {
          event.preventDefault();
          callbacks.onArrowRight(event);
        }
        break;

      case 'Home':
        if (callbacks.onHome) {
          event.preventDefault();
          callbacks.onHome(event);
        }
        break;

      case 'End':
        if (callbacks.onEnd) {
          event.preventDefault();
          callbacks.onEnd(event);
        }
        break;

      default:
        // 단축키 처리
        if (callbacks.onShortcut) {
          callbacks.onShortcut(key, modifiers);
        }
    }
  };

  return { handleKeyDown };
}

/**
 * 포커스 트랩 생성
 * 모달이나 드롭다운에서 포커스가 벗어나지 않도록 함
 */
export function createFocusTrap(containerElement) {
  if (!containerElement) return null;

  const focusableElements = containerElement.querySelectorAll(
    'a[href], button, textarea, input[type="text"], input[type="radio"], ' +
    'input[type="checkbox"], select, [tabindex]:not([tabindex="-1"])'
  );

  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  const trapFocus = (event) => {
    if (event.key !== 'Tab') return;

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }
  };

  containerElement.addEventListener('keydown', trapFocus);

  // 초기 포커스 설정
  if (firstFocusable) {
    firstFocusable.focus();
  }

  // 정리 함수 반환
  return () => {
    containerElement.removeEventListener('keydown', trapFocus);
  };
}

/**
 * 스크린 리더 전용 텍스트 생성
 */
export function srOnly(text) {
  return (
    <span className="sr-only" aria-live="polite">
      {text}
    </span>
  );
}

/**
 * ARIA 라이브 리전 업데이트
 */
export function announceToScreenReader(message, priority = 'polite') {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // 잠시 후 제거
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * 색상 대비 검사
 * WCAG AA 기준: 일반 텍스트 4.5:1, 큰 텍스트 3:1
 */
export function checkColorContrast(foreground, background, isLargeText = false) {
  const getLuminance = (color) => {
    // HEX to RGB 변환
    const rgb = hexToRgb(color);
    if (!rgb) return 0;

    const [r, g, b] = rgb.map(val => {
      val = val / 255;
      return val <= 0.03928
        ? val / 12.92
        : Math.pow((val + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);

  const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  const minimumRatio = isLargeText ? 3 : 4.5;

  return {
    ratio: contrast.toFixed(2),
    passes: contrast >= minimumRatio,
    level: contrast >= 7 ? 'AAA' : contrast >= minimumRatio ? 'AA' : 'FAIL'
  };
}

/**
 * HEX 색상을 RGB로 변환
 */
function hexToRgb(hex) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

/**
 * 포커스 가능 요소인지 확인
 */
export function isFocusable(element) {
  if (!element) return false;

  const focusableElements = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input[type="text"]:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ];

  return focusableElements.some(selector => element.matches(selector));
}

/**
 * Skip to Content 링크 생성
 */
export function SkipToContent({ targetId = 'main-content' }) {
  return (
    <a
      href={`#${targetId}`}
      className="skip-to-content"
      onClick={(e) => {
        e.preventDefault();
        const target = document.getElementById(targetId);
        if (target) {
          target.focus();
          target.scrollIntoView();
        }
      }}
    >
      본문으로 건너뛰기
    </a>
  );
}

/**
 * 접근 가능한 에러 메시지
 */
export function AccessibleError({ id, error }) {
  if (!error) return null;

  return (
    <div
      id={id}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="error-message"
    >
      <span className="error-icon" aria-hidden="true">⚠</span>
      {error}
    </div>
  );
}

/**
 * 접근 가능한 로딩 상태
 */
export function AccessibleLoading({ message = '로딩 중...' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="loading-state"
    >
      <span className="sr-only">{message}</span>
      <div className="spinner" aria-hidden="true" />
    </div>
  );
}

/**
 * 접근 가능한 프로그레스 바
 */
export function AccessibleProgressBar({ value, max = 100, label }) {
  const percentage = (value / max) * 100;

  return (
    <div className="progress-container">
      {label && (
        <label id="progress-label">{label}</label>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-labelledby={label ? 'progress-label' : undefined}
        className="progress-bar"
      >
        <div
          className="progress-fill"
          style={{ width: `${percentage}%` }}
        />
        <span className="sr-only">
          {percentage.toFixed(0)}% 완료
        </span>
      </div>
    </div>
  );
}

/**
 * 랜드마크 역할 설정
 */
export const Landmarks = {
  // 주요 랜드마크
  banner: 'banner',       // 헤더
  navigation: 'navigation', // 네비게이션
  main: 'main',          // 메인 콘텐츠
  complementary: 'complementary', // 보조 콘텐츠
  contentinfo: 'contentinfo', // 푸터
  search: 'search',      // 검색

  // ARIA 랜드마크
  region: 'region',      // 중요 영역
  form: 'form'          // 폼 영역
};

/**
 * 키보드 단축키 매핑
 */
export const KeyboardShortcuts = {
  // 전역 단축키
  'Alt+H': '홈으로 이동',
  'Alt+S': '검색',
  'Alt+M': '메뉴 열기',
  'Alt+N': '알림 확인',
  'Alt+P': '프로필',
  'Alt+L': '로그아웃',

  // 네비게이션
  'Alt+1': '대시보드',
  'Alt+2': '출퇴근',
  'Alt+3': '스케줄',
  'Alt+4': '급여',

  // 액션
  'Ctrl+Enter': '저장',
  'Escape': '취소/닫기',
  'F1': '도움말',

  // 테이블 네비게이션
  'Arrow Keys': '셀 이동',
  'Home': '첫 번째 항목',
  'End': '마지막 항목',
  'Page Up': '이전 페이지',
  'Page Down': '다음 페이지'
};

/**
 * 고대비 모드 감지
 */
export function detectHighContrastMode() {
  if (window.matchMedia) {
    return window.matchMedia('(prefers-contrast: high)').matches;
  }
  return false;
}

/**
 * 애니메이션 감소 모드 감지
 */
export function detectReducedMotion() {
  if (window.matchMedia) {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
}

/**
 * 접근성 설정 컨텍스트
 */
export const AccessibilityContext = {
  highContrast: detectHighContrastMode(),
  reducedMotion: detectReducedMotion(),
  fontSize: 'normal', // normal, large, extra-large
  keyboardNavigation: true,
  screenReaderMode: false
};

export default {
  useKeyboardNavigation,
  createFocusTrap,
  srOnly,
  announceToScreenReader,
  checkColorContrast,
  isFocusable,
  SkipToContent,
  AccessibleError,
  AccessibleLoading,
  AccessibleProgressBar,
  Landmarks,
  KeyboardShortcuts,
  detectHighContrastMode,
  detectReducedMotion,
  AccessibilityContext
};