/**
 * DOT Platform Frontend - i18n 설정
 * 다국어 지원을 위한 i18next 설정
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 번역 리소스
const resources = {
  en: {
    translation: {
      welcome: 'Welcome to DOT Platform',
      login: 'Login',
      logout: 'Logout',
      dashboard: 'Dashboard',
      attendance: 'Attendance',
      schedule: 'Schedule',
      payroll: 'Payroll',
      settings: 'Settings',
      language: 'Language',
      error: {
        notFound: 'Page not found',
        serverError: 'Server error occurred',
        unauthorized: 'Unauthorized access'
      }
    }
  },
  ko: {
    translation: {
      welcome: 'DOT 플랫폼에 오신 것을 환영합니다',
      login: '로그인',
      logout: '로그아웃',
      dashboard: '대시보드',
      attendance: '출근부',
      schedule: '일정',
      payroll: '급여',
      settings: '설정',
      language: '언어',
      error: {
        notFound: '페이지를 찾을 수 없습니다',
        serverError: '서버 오류가 발생했습니다',
        unauthorized: '접근 권한이 없습니다'
      }
    }
  },
  ja: {
    translation: {
      welcome: 'DOTプラットフォームへようこそ',
      login: 'ログイン',
      logout: 'ログアウト',
      dashboard: 'ダッシュボード',
      attendance: '勤怠',
      schedule: 'スケジュール',
      payroll: '給与',
      settings: '設定',
      language: '言語',
      error: {
        notFound: 'ページが見つかりません',
        serverError: 'サーバーエラーが発生しました',
        unauthorized: 'アクセス権限がありません'
      }
    }
  },
  zh: {
    translation: {
      welcome: '欢迎使用DOT平台',
      login: '登录',
      logout: '登出',
      dashboard: '仪表板',
      attendance: '考勤',
      schedule: '日程',
      payroll: '薪资',
      settings: '设置',
      language: '语言',
      error: {
        notFound: '页面未找到',
        serverError: '服务器错误',
        unauthorized: '未授权访问'
      }
    }
  }
};

// i18n 초기화
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ko', // 한국어를 기본 언어로
    debug: process.env.NODE_ENV === 'development',

    interpolation: {
      escapeValue: false // React는 이미 XSS 보호를 제공
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage']
    }
  });

export default i18n;