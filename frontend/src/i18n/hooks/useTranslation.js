/**
 * 번역 훅과 유틸리티
 * React i18next 기반 커스텀 훅
 *
 * 주요 기능:
 * - 번역 텍스트 조회
 * - 동적 인터폴레이션
 * - 복수형 처리
 * - 날짜/시간/숫자 포맷팅
 * - 네임스페이스 지원
 */

import { useTranslation as useI18nextTranslation } from 'react-i18next';
import {
  formatDate,
  formatTime,
  formatNumber,
  formatCurrency,
  getCurrentLanguage
} from '../index';

/**
 * 확장된 번역 훅
 * React i18next의 기본 기능을 확장한 커스텀 훅
 */
export function useTranslation(namespace = 'common') {
  const { t, i18n, ready } = useI18nextTranslation(namespace);

  /**
   * 향상된 번역 함수
   * 기본 번역에 추가 기능 제공
   */
  const translate = (key, options = {}) => {
    // 번역 키가 없는 경우 기본값 처리
    if (!key) return '';

    try {
      return t(key, {
        // 기본 옵션
        ...options,
        // 인터폴레이션 함수들
        formatDate: (value, format) => formatDate(value, format),
        formatTime: (value, format) => formatTime(value, format),
        formatNumber: (value, format) => formatNumber(value, format),
        formatCurrency: (value, currency) => formatCurrency(value, currency),
      });
    } catch (error) {
      console.warn(`Translation error for key: ${key}`, error);
      return key; // fallback to key itself
    }
  };

  /**
   * 복수형 번역
   * count 값에 따라 단수/복수형 결정
   */
  const translatePlural = (singularKey, pluralKey, count, options = {}) => {
    const key = count === 1 ? singularKey : pluralKey;
    return translate(key, { count, ...options });
  };

  /**
   * 조건부 번역
   * 조건에 따라 다른 키 사용
   */
  const translateConditional = (condition, trueKey, falseKey, options = {}) => {
    const key = condition ? trueKey : falseKey;
    return translate(key, options);
  };

  /**
   * 배열 번역
   * 여러 키를 한 번에 번역
   */
  const translateArray = (keys, options = {}) => {
    return keys.map(key => translate(key, options));
  };

  /**
   * 객체 번역
   * 객체의 값들을 번역
   */
  const translateObject = (obj, options = {}) => {
    const result = {};
    Object.keys(obj).forEach(key => {
      result[key] = translate(obj[key], options);
    });
    return result;
  };

  /**
   * 안전한 번역 (존재하지 않는 키에 대해 기본값 반환)
   */
  const translateSafe = (key, defaultValue = '', options = {}) => {
    if (!i18n.exists(key)) {
      return defaultValue;
    }
    return translate(key, options);
  };

  return {
    // 기본 함수들
    t: translate,
    i18n,
    ready,

    // 확장 함수들
    translatePlural,
    translateConditional,
    translateArray,
    translateObject,
    translateSafe,

    // 유틸리티
    currentLanguage: getCurrentLanguage(),
    isRTL: ['ar', 'he', 'fa'].includes(getCurrentLanguage()),

    // 포맷팅 함수들
    formatDate,
    formatTime,
    formatNumber,
    formatCurrency,
  };
}

/**
 * 네임스페이스별 번역 훅
 */
export function useNamespaceTranslation(namespaces) {
  const translations = {};

  if (Array.isArray(namespaces)) {
    namespaces.forEach(ns => {
      translations[ns] = useTranslation(ns);
    });
  }

  return translations;
}

/**
 * 동적 번역 키 훅
 * 런타임에 키가 결정되는 경우
 */
export function useDynamicTranslation() {
  const { t, i18n } = useTranslation();

  const translateDynamic = (keyBase, dynamicPart, options = {}) => {
    const fullKey = `${keyBase}.${dynamicPart}`;
    return t(fullKey, options);
  };

  const translatePath = (path, options = {}) => {
    return path.split('.').reduce((obj, key) => {
      return obj ? t(`${obj}.${key}`, options) : t(key, options);
    }, '');
  };

  return {
    translateDynamic,
    translatePath,
    exists: i18n.exists,
  };
}

/**
 * 번역 상태 관리 훅
 */
export function useTranslationState() {
  const { i18n, ready } = useTranslation();

  return {
    isReady: ready,
    currentLanguage: i18n.language,
    isLoading: !ready,
    hasError: i18n.hasLoadedNamespace === false,
    supportedLanguages: i18n.options.supportedLngs || [],
  };
}

/**
 * 번역 값 캐싱 훅
 * 성능 최적화를 위한 번역 값 캐싱
 */
export function useCachedTranslation(keys, namespace = 'common') {
  const { t } = useTranslation(namespace);
  const [cache, setCache] = React.useState({});

  React.useEffect(() => {
    const newCache = {};
    keys.forEach(key => {
      newCache[key] = t(key);
    });
    setCache(newCache);
  }, [t, keys]);

  return cache;
}

/**
 * 번역 폴백 훅
 * 번역이 없는 경우 폴백 전략
 */
export function useFallbackTranslation(key, fallbacks = []) {
  const { t, i18n } = useTranslation();

  const getTranslation = (options = {}) => {
    // 1. 기본 키 시도
    if (i18n.exists(key)) {
      return t(key, options);
    }

    // 2. 폴백 키들 순차 시도
    for (const fallback of fallbacks) {
      if (i18n.exists(fallback)) {
        return t(fallback, options);
      }
    }

    // 3. 최종 폴백: 키 자체 또는 옵션의 기본값
    return options.defaultValue || key;
  };

  return getTranslation;
}

/**
 * 지연 번역 훅
 * 번역을 지연시켜 성능 최적화
 */
export function useLazyTranslation() {
  const { t, ready } = useTranslation();

  const translateLazy = React.useMemo(() => {
    return (key, options = {}) => {
      if (!ready) return key;
      return t(key, options);
    };
  }, [t, ready]);

  return translateLazy;
}

/**
 * 번역 완료 대기 훅
 */
export function useTranslationReady(callback) {
  const { ready } = useTranslation();

  React.useEffect(() => {
    if (ready && callback) {
      callback();
    }
  }, [ready, callback]);

  return ready;
}

export default useTranslation;