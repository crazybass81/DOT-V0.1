/**
 * 국제화(i18n) 설정
 * React i18next를 사용한 다국어 지원
 *
 * 지원 언어:
 * - 한국어 (ko) - 기본 언어
 * - 영어 (en)
 * - 일본어 (ja)
 * - 중국어 간체 (zh-CN)
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

// 언어 리소스 import
import ko from './locales/ko/common.json';
import en from './locales/en/common.json';
import ja from './locales/ja/common.json';
import zhCN from './locales/zh-CN/common.json';

// 환경 변수에서 설정 로드
const isDevelopment = process.env.NODE_ENV === 'development';
const defaultLanguage = process.env.REACT_APP_DEFAULT_LANGUAGE || 'ko';
const supportedLanguages = (
  process.env.REACT_APP_SUPPORTED_LANGUAGES || 'ko,en,ja,zh-CN'
).split(',');

// 언어 리소스
const resources = {
  ko: { common: ko },
  en: { common: en },
  ja: { common: ja },
  'zh-CN': { common: zhCN }
};

// i18next 초기화
i18n
  // Backend 플러그인 (동적 로딩)
  .use(Backend)
  // 언어 감지 플러그인
  .use(LanguageDetector)
  // React 통합
  .use(initReactI18next)
  // 초기화
  .init({
    // 기본 설정
    lng: defaultLanguage, // 기본 언어
    fallbackLng: 'ko', // 폴백 언어
    supportedLngs: supportedLanguages, // 지원 언어 목록

    // 네임스페이스 설정
    defaultNS: 'common',
    ns: ['common'],

    // 디버그 설정 (개발 환경에서만)
    debug: isDevelopment,

    // 언어 감지 설정
    detection: {
      // 감지 순서: localStorage → navigator → htmlTag
      order: ['localStorage', 'navigator', 'htmlTag'],

      // localStorage 키
      lookupLocalStorage: 'i18nextLng',

      // 캐시 설정
      caches: ['localStorage'],

      // HTML lang 속성 자동 설정
      htmlTag: document.documentElement,
    },

    // Backend 설정 (동적 로딩용)
    backend: {
      // 언어 파일 경로
      loadPath: '/locales/{{lng}}/{{ns}}.json',

      // 캐시 설정
      requestOptions: {
        cache: 'default',
      },
    },

    // React 설정
    react: {
      // Suspense 사용 (로딩 중 처리)
      useSuspense: true,

      // 바인딩 설정
      bindI18n: 'languageChanged',
      bindI18nStore: 'added',
    },

    // 인터폴레이션 설정
    interpolation: {
      // React는 기본적으로 XSS 보호
      escapeValue: false,

      // 포맷 함수들
      format: (value, format, lng) => {
        if (format === 'number') {
          return new Intl.NumberFormat(lng).format(value);
        }
        if (format === 'currency') {
          return new Intl.NumberFormat(lng, {
            style: 'currency',
            currency: getCurrencyForLanguage(lng),
          }).format(value);
        }
        if (format === 'date') {
          return new Intl.DateTimeFormat(lng).format(new Date(value));
        }
        if (format === 'datetime') {
          return new Intl.DateTimeFormat(lng, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(value));
        }
        return value;
      },
    },

    // 정적 리소스 (개발용)
    resources: isDevelopment ? resources : undefined,

    // 미사용 키 처리
    saveMissing: isDevelopment,
    missingKeyHandler: isDevelopment ? (lng, ns, key) => {
      console.warn(`Missing translation key: ${ns}:${key} for language: ${lng}`);
    } : undefined,

    // 로딩 실패 처리
    loadTimeout: 6000,

    // 키 구분자
    keySeparator: '.',
    nsSeparator: ':',
  });

/**
 * 언어별 통화 설정
 */
function getCurrencyForLanguage(lng) {
  const currencyMap = {
    ko: 'KRW',
    en: 'USD',
    ja: 'JPY',
    'zh-CN': 'CNY',
  };
  return currencyMap[lng] || 'KRW';
}

/**
 * 언어 변경 함수
 */
export function changeLanguage(lng) {
  return i18n.changeLanguage(lng);
}

/**
 * 현재 언어 조회
 */
export function getCurrentLanguage() {
  return i18n.language;
}

/**
 * 지원 언어 목록
 */
export function getSupportedLanguages() {
  return supportedLanguages.map(lng => ({
    code: lng,
    name: getLanguageName(lng),
    nativeName: getNativeLanguageName(lng),
  }));
}

/**
 * 언어 코드를 언어명으로 변환
 */
function getLanguageName(lng) {
  const nameMap = {
    ko: '한국어',
    en: 'English',
    ja: '日本語',
    'zh-CN': '中文(简体)',
  };
  return nameMap[lng] || lng;
}

/**
 * 언어별 자국어 표기
 */
function getNativeLanguageName(lng) {
  const nativeNameMap = {
    ko: '한국어',
    en: 'English',
    ja: '日本語',
    'zh-CN': '中文(简体)',
  };
  return nativeNameMap[lng] || lng;
}

/**
 * 번역 키 존재 여부 확인
 */
export function hasTranslation(key, options = {}) {
  return i18n.exists(key, options);
}

/**
 * 다국어 번역 헬퍼
 */
export function t(key, options) {
  return i18n.t(key, options);
}

/**
 * 다국어 날짜 포맷
 */
export function formatDate(date, options = {}) {
  const lng = getCurrentLanguage();
  return new Intl.DateTimeFormat(lng, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  }).format(new Date(date));
}

/**
 * 다국어 시간 포맷
 */
export function formatTime(time, options = {}) {
  const lng = getCurrentLanguage();
  return new Intl.DateTimeFormat(lng, {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(new Date(time));
}

/**
 * 다국어 숫자 포맷
 */
export function formatNumber(number, options = {}) {
  const lng = getCurrentLanguage();
  return new Intl.NumberFormat(lng, options).format(number);
}

/**
 * 다국어 통화 포맷
 */
export function formatCurrency(amount, currency = null) {
  const lng = getCurrentLanguage();
  const currencyCode = currency || getCurrencyForLanguage(lng);

  return new Intl.NumberFormat(lng, {
    style: 'currency',
    currency: currencyCode,
  }).format(amount);
}

/**
 * 언어 변경 감지 이벤트
 */
i18n.on('languageChanged', (lng) => {
  // HTML lang 속성 업데이트
  document.documentElement.setAttribute('lang', lng);

  // 방향 설정 (향후 아랍어 등 RTL 언어 지원 시)
  const isRTL = ['ar', 'he', 'fa'].includes(lng);
  document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');

  // 언어별 폰트 클래스 적용
  document.body.className = document.body.className.replace(/lang-\w+/g, '');
  document.body.classList.add(`lang-${lng}`);
});

export default i18n;