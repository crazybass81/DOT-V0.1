/**
 * 언어 선택 컴포넌트
 * 다국어 지원을 위한 언어 변경 UI
 *
 * 주요 기능:
 * - 지원 언어 목록 표시
 * - 현재 언어 상태 표시
 * - 접근성 지원
 * - 키보드 네비게이션
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getSupportedLanguages,
  getCurrentLanguage,
  changeLanguage
} from '../index';
import {
  useKeyboardNavigation,
  createFocusTrap,
  announceToScreenReader
} from '../../utils/accessibility';

/**
 * 드롭다운 언어 선택기
 */
export function LanguageSelector({
  variant = 'dropdown', // dropdown | buttons | compact
  showLabels = true,
  showFlags = false,
  className = ''
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const dropdownRef = useRef(null);
  const { handleKeyDown } = useKeyboardNavigation();

  const languages = getSupportedLanguages();
  const currentLanguage = getCurrentLanguage();

  // 포커스 트랩 설정
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const cleanup = createFocusTrap(dropdownRef.current);
      return cleanup;
    }
  }, [isOpen]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 키보드 네비게이션
  const handleLanguageKey = (event) => {
    handleKeyDown(event, {
      onEscape: () => setIsOpen(false),
      onArrowUp: () => {
        const newIndex = focusedIndex > 0 ? focusedIndex - 1 : languages.length - 1;
        setFocusedIndex(newIndex);
      },
      onArrowDown: () => {
        const newIndex = focusedIndex < languages.length - 1 ? focusedIndex + 1 : 0;
        setFocusedIndex(newIndex);
      },
      onSelect: () => {
        if (isOpen) {
          selectLanguage(languages[focusedIndex].code);
        } else {
          setIsOpen(true);
        }
      }
    });
  };

  // 언어 선택 처리
  const selectLanguage = (languageCode) => {
    changeLanguage(languageCode);
    setIsOpen(false);
    announceToScreenReader(
      t('accessibility.languageChanged', {
        language: languages.find(l => l.code === languageCode)?.name
      }) || `언어가 변경되었습니다`
    );
  };

  // 현재 언어 정보
  const currentLang = languages.find(l => l.code === currentLanguage) || languages[0];

  // 언어 플래그 이모지 (옵션)
  const getLanguageFlag = (code) => {
    const flags = {
      ko: '🇰🇷',
      en: '🇺🇸',
      ja: '🇯🇵',
      'zh-CN': '🇨🇳'
    };
    return flags[code] || '🌐';
  };

  // 드롭다운 버전
  if (variant === 'dropdown') {
    return (
      <div
        ref={dropdownRef}
        className={`language-selector ${className}`}
        onKeyDown={handleLanguageKey}
      >
        <button
          className="language-trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={t('settings.language')}
          type="button"
        >
          {showFlags && (
            <span className="language-flag" aria-hidden="true">
              {getLanguageFlag(currentLang.code)}
            </span>
          )}
          {showLabels && (
            <span className="language-name">
              {currentLang.nativeName}
            </span>
          )}
          <span className="dropdown-arrow" aria-hidden="true">
            {isOpen ? '▲' : '▼'}
          </span>
        </button>

        {isOpen && (
          <ul
            className="language-dropdown"
            role="listbox"
            aria-label={t('settings.language')}
          >
            {languages.map((language, index) => (
              <li key={language.code} role="none">
                <button
                  className={`language-option ${
                    language.code === currentLanguage ? 'selected' : ''
                  } ${index === focusedIndex ? 'focused' : ''}`}
                  role="option"
                  aria-selected={language.code === currentLanguage}
                  tabIndex={index === focusedIndex ? 0 : -1}
                  onClick={() => selectLanguage(language.code)}
                  onFocus={() => setFocusedIndex(index)}
                  type="button"
                >
                  {showFlags && (
                    <span className="language-flag" aria-hidden="true">
                      {getLanguageFlag(language.code)}
                    </span>
                  )}
                  <span className="language-native">
                    {language.nativeName}
                  </span>
                  <span className="language-english">
                    {language.name}
                  </span>
                  {language.code === currentLanguage && (
                    <span className="selected-indicator" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // 버튼 그룹 버전
  if (variant === 'buttons') {
    return (
      <div className={`language-buttons ${className}`} role="radiogroup" aria-label={t('settings.language')}>
        {languages.map(language => (
          <button
            key={language.code}
            className={`language-button ${
              language.code === currentLanguage ? 'selected' : ''
            }`}
            onClick={() => selectLanguage(language.code)}
            aria-pressed={language.code === currentLanguage}
            type="button"
          >
            {showFlags && (
              <span className="language-flag" aria-hidden="true">
                {getLanguageFlag(language.code)}
              </span>
            )}
            {showLabels && (
              <span className="language-label">
                {language.nativeName}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  // 컴팩트 버전 (현재 언어만 표시, 클릭 시 순환)
  if (variant === 'compact') {
    const handleCompactClick = () => {
      const currentIndex = languages.findIndex(l => l.code === currentLanguage);
      const nextIndex = (currentIndex + 1) % languages.length;
      selectLanguage(languages[nextIndex].code);
    };

    return (
      <button
        className={`language-compact ${className}`}
        onClick={handleCompactClick}
        aria-label={`${t('settings.language')}: ${currentLang.nativeName}`}
        title={t('common.actions.changeLanguage')}
        type="button"
      >
        {showFlags && (
          <span className="language-flag" aria-hidden="true">
            {getLanguageFlag(currentLang.code)}
          </span>
        )}
        {showLabels && (
          <span className="language-code">
            {currentLang.code.toUpperCase()}
          </span>
        )}
      </button>
    );
  }

  return null;
}

/**
 * 언어 변경 전용 훅
 */
export function useLanguageSelector() {
  const { i18n } = useTranslation();

  const switchLanguage = (languageCode) => {
    changeLanguage(languageCode);
  };

  const getAvailableLanguages = () => {
    return getSupportedLanguages();
  };

  const getCurrentLang = () => {
    return getCurrentLanguage();
  };

  return {
    currentLanguage: getCurrentLang(),
    availableLanguages: getAvailableLanguages(),
    switchLanguage,
    isReady: i18n.isInitialized
  };
}

/**
 * 언어별 콘텐츠 조건부 렌더링 컴포넌트
 */
export function LanguageContent({
  language,
  children,
  fallback = null
}) {
  const currentLanguage = getCurrentLanguage();

  if (currentLanguage === language) {
    return children;
  }

  return fallback;
}

/**
 * 다국어 텍스트 방향 컴포넌트
 */
export function TextDirection({ children, className = '' }) {
  const currentLanguage = getCurrentLanguage();
  const isRTL = ['ar', 'he', 'fa'].includes(currentLanguage);

  return (
    <div
      className={`text-direction ${isRTL ? 'rtl' : 'ltr'} ${className}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {children}
    </div>
  );
}

export default LanguageSelector;