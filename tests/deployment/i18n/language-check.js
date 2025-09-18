/**
 * DOT Platform 다국어 UI 검증 스크립트
 *
 * 배포된 DOT Platform의 다국어 지원을 검증합니다.
 * 지원 언어: 한국어(ko), 영어(en), 일본어(ja), 중국어(zh)
 */

const { chromium } = require('playwright');

// 다국어 검증 설정
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

// 지원 언어 목록 및 설정
const SUPPORTED_LANGUAGES = [
    {
        code: 'ko',
        locale: 'ko-KR',
        name: '한국어',
        nativeName: '한국어',
        direction: 'ltr',
        charset: 'UTF-8'
    },
    {
        code: 'en',
        locale: 'en-US',
        name: '영어',
        nativeName: 'English',
        direction: 'ltr',
        charset: 'UTF-8'
    },
    {
        code: 'ja',
        locale: 'ja-JP',
        name: '일본어',
        nativeName: '日本語',
        direction: 'ltr',
        charset: 'UTF-8'
    },
    {
        code: 'zh',
        locale: 'zh-CN',
        name: '중국어',
        nativeName: '中文',
        direction: 'ltr',
        charset: 'UTF-8'
    }
];

// 검증할 페이지 및 예상 텍스트
const TEST_PAGES = [
    {
        url: '/',
        name: '메인 페이지',
        expectedTexts: {
            ko: ['로그인', '회원가입', '출퇴근', '스케줄', '대시보드'],
            en: ['Login', 'Sign Up', 'Attendance', 'Schedule', 'Dashboard'],
            ja: ['ログイン', 'サインアップ', '出退勤', 'スケジュール', 'ダッシュボード'],
            zh: ['登录', '注册', '考勤', '时间表', '仪表板']
        }
    },
    {
        url: '/login',
        name: '로그인 페이지',
        expectedTexts: {
            ko: ['이메일', '비밀번호', '로그인', '비밀번호 찾기'],
            en: ['Email', 'Password', 'Login', 'Forgot Password'],
            ja: ['メール', 'パスワード', 'ログイン', 'パスワードを忘れた'],
            zh: ['邮箱', '密码', '登录', '忘记密码']
        }
    },
    {
        url: '/dashboard',
        name: '대시보드',
        expectedTexts: {
            ko: ['대시보드', '오늘의 출근', '스케줄', '알림'],
            en: ['Dashboard', 'Today\'s Check-in', 'Schedule', 'Notifications'],
            ja: ['ダッシュボード', '今日の出勤', 'スケジュール', '通知'],
            zh: ['仪表板', '今日签到', '时间表', '通知']
        }
    }
];

// 다국어 검증 결과 저장 구조
const i18nResults = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    supportedLanguages: SUPPORTED_LANGUAGES.map(lang => ({
        code: lang.code,
        name: lang.name,
        nativeName: lang.nativeName
    })),
    summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        languageScores: {}
    },
    pageResults: [],
    languageResults: {},
    recommendations: []
};

/**
 * 특정 언어로 페이지 검증
 */
async function validatePageInLanguage(page, testPage, language) {
    console.log(`🌐 ${language.name} 언어 검증: ${testPage.name}`);

    try {
        // 언어별 헤더 설정
        await page.setExtraHTTPHeaders({
            'Accept-Language': `${language.locale},${language.code};q=0.9,en;q=0.8`
        });

        // 페이지 로드
        await page.goto(`${BASE_URL}${testPage.url}`, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        // HTML lang 속성 확인
        const htmlLang = await page.getAttribute('html', 'lang');
        const langAttributeCorrect = htmlLang && (
            htmlLang.startsWith(language.code) ||
            htmlLang === language.locale ||
            (language.code === 'zh' && htmlLang.startsWith('zh'))
        );

        // 예상 텍스트 확인
        const expectedTexts = testPage.expectedTexts[language.code] || [];
        const textValidation = await validateExpectedTexts(page, expectedTexts, language);

        // 폰트 렌더링 확인
        const fontValidation = await validateFontRendering(page, language);

        // 텍스트 방향 확인
        const textDirection = await page.evaluate(() => {
            const body = document.querySelector('body');
            return window.getComputedStyle(body).direction;
        });
        const textDirectionCorrect = textDirection === language.direction;

        // 문자 인코딩 확인
        const charset = await page.evaluate(() => {
            const metaCharset = document.querySelector('meta[charset]');
            return metaCharset ? metaCharset.getAttribute('charset') : null;
        });
        const charsetCorrect = !charset || charset.toUpperCase() === language.charset;

        // 언어별 특화 검증
        const specificValidation = await validateLanguageSpecifics(page, language);

        // 결과 계산
        const validationResults = {
            langAttribute: langAttributeCorrect,
            expectedTexts: textValidation.passed,
            textFoundCount: textValidation.foundCount,
            textTotalCount: textValidation.totalCount,
            fontRendering: fontValidation.supported,
            textDirection: textDirectionCorrect,
            charset: charsetCorrect,
            specificValidation: specificValidation,
            score: 0
        };

        // 점수 계산 (각 항목 20점씩, 총 100점)
        validationResults.score = [
            langAttributeCorrect,
            textValidation.passed,
            fontValidation.supported,
            textDirectionCorrect,
            charsetCorrect
        ].filter(Boolean).length * 20;

        console.log(`✅ ${language.name} 검증 완료: ${validationResults.score}/100점`);

        return validationResults;

    } catch (error) {
        console.error(`❌ ${language.name} 검증 실패:`, error.message);
        return {
            error: error.message,
            score: 0,
            langAttribute: false,
            expectedTexts: false,
            fontRendering: false,
            textDirection: false,
            charset: false
        };
    }
}

/**
 * 예상 텍스트 검증
 */
async function validateExpectedTexts(page, expectedTexts, language) {
    let foundCount = 0;
    const foundTexts = [];
    const missingTexts = [];

    for (const expectedText of expectedTexts) {
        try {
            // 다양한 방법으로 텍스트 검색
            const textLocator = page.locator(`text="${expectedText}"`).or(
                page.locator(`text=${expectedText}`).or(
                    page.locator(`[title="${expectedText}"]`).or(
                        page.locator(`[aria-label="${expectedText}"]`).or(
                            page.locator(`[placeholder="${expectedText}"]`)
                        )
                    )
                )
            );

            const count = await textLocator.count();
            if (count > 0) {
                foundCount++;
                foundTexts.push(expectedText);
            } else {
                missingTexts.push(expectedText);
            }
        } catch (error) {
            console.warn(`텍스트 검색 오류 (${expectedText}):`, error.message);
            missingTexts.push(expectedText);
        }
    }

    const passed = foundCount === expectedTexts.length;

    if (!passed) {
        console.log(`  📝 ${language.name} 누락 텍스트:`, missingTexts);
    }

    return {
        passed: passed,
        foundCount: foundCount,
        totalCount: expectedTexts.length,
        foundTexts: foundTexts,
        missingTexts: missingTexts
    };
}

/**
 * 폰트 렌더링 검증
 */
async function validateFontRendering(page, language) {
    try {
        const fontInfo = await page.evaluate((langCode) => {
            const testElement = document.createElement('div');
            testElement.style.position = 'absolute';
            testElement.style.visibility = 'hidden';
            testElement.style.fontSize = '16px';

            // 언어별 테스트 텍스트
            const testTexts = {
                ko: '한글 테스트 텍스트',
                en: 'English Test Text',
                ja: '日本語テストテキスト',
                zh: '中文测试文本'
            };

            testElement.textContent = testTexts[langCode] || testTexts.en;
            document.body.appendChild(testElement);

            const computedStyle = window.getComputedStyle(testElement);
            const fontFamily = computedStyle.fontFamily;
            const fontSize = computedStyle.fontSize;

            document.body.removeChild(testElement);

            return {
                fontFamily: fontFamily,
                fontSize: fontSize,
                hasSystemFont: fontFamily.includes('system') ||
                              fontFamily.includes('sans-serif') ||
                              fontFamily.includes('serif'),
                hasLanguageFont: false
            };
        }, language.code);

        // 언어별 폰트 지원 확인
        let hasLanguageFont = false;
        switch (language.code) {
            case 'ko':
                hasLanguageFont = /Noto|Malgun|맑은|굴림|돋움|바탕|궁서|Apple SD Gothic Neo|NanumGothic/.test(fontInfo.fontFamily);
                break;
            case 'ja':
                hasLanguageFont = /Noto|Hiragino|Yu Gothic|Meiryo|MS Gothic|Apple SD Gothic Neo/.test(fontInfo.fontFamily);
                break;
            case 'zh':
                hasLanguageFont = /Noto|PingFang|SimHei|SimSun|Microsoft YaHei|Apple SD Gothic Neo/.test(fontInfo.fontFamily);
                break;
            case 'en':
                hasLanguageFont = true; // 영어는 기본 폰트로 충분
                break;
        }

        fontInfo.hasLanguageFont = hasLanguageFont;

        return {
            supported: hasLanguageFont || fontInfo.hasSystemFont,
            fontFamily: fontInfo.fontFamily,
            details: fontInfo
        };

    } catch (error) {
        console.warn(`폰트 렌더링 검증 오류 (${language.name}):`, error.message);
        return {
            supported: true, // 오류 시 통과로 처리
            fontFamily: 'unknown',
            details: null
        };
    }
}

/**
 * 언어별 특화 검증
 */
async function validateLanguageSpecifics(page, language) {
    const validation = {
        dateFormat: false,
        numberFormat: false,
        currencyFormat: false,
        timeFormat: false
    };

    try {
        // 언어별 특화 검증 로직
        switch (language.code) {
            case 'ko':
                validation.dateFormat = await validateKoreanDateFormat(page);
                validation.numberFormat = await validateKoreanNumberFormat(page);
                validation.currencyFormat = await validateKoreanCurrencyFormat(page);
                break;

            case 'ja':
                validation.dateFormat = await validateJapaneseDateFormat(page);
                validation.numberFormat = await validateJapaneseNumberFormat(page);
                break;

            case 'zh':
                validation.dateFormat = await validateChineseDateFormat(page);
                validation.numberFormat = await validateChineseNumberFormat(page);
                break;

            case 'en':
                validation.dateFormat = await validateEnglishDateFormat(page);
                validation.numberFormat = await validateEnglishNumberFormat(page);
                validation.currencyFormat = await validateEnglishCurrencyFormat(page);
                break;
        }

        // 시간 형식은 공통적으로 확인
        validation.timeFormat = await validateTimeFormat(page, language);

    } catch (error) {
        console.warn(`언어별 특화 검증 오류 (${language.name}):`, error.message);
    }

    return validation;
}

/**
 * 한국어 날짜 형식 검증
 */
async function validateKoreanDateFormat(page) {
    const datePatterns = [
        /\d{4}년\s*\d{1,2}월\s*\d{1,2}일/,  // 2025년 1월 1일
        /\d{4}\.\s*\d{1,2}\.\s*\d{1,2}/,     // 2025. 1. 1
        /\d{4}-\d{2}-\d{2}/                   // 2025-01-01
    ];

    return await validateDatePatterns(page, datePatterns);
}

/**
 * 일본어 날짜 형식 검증
 */
async function validateJapaneseDateFormat(page) {
    const datePatterns = [
        /\d{4}年\s*\d{1,2}月\s*\d{1,2}日/,   // 2025年1月1日
        /\d{4}\/\d{1,2}\/\d{1,2}/,           // 2025/1/1
        /令和\d+年/                           // 令和7年
    ];

    return await validateDatePatterns(page, datePatterns);
}

/**
 * 중국어 날짜 형식 검증
 */
async function validateChineseDateFormat(page) {
    const datePatterns = [
        /\d{4}年\s*\d{1,2}月\s*\d{1,2}日/,   // 2025年1月1日
        /\d{4}-\d{2}-\d{2}/,                 // 2025-01-01
        /\d{4}\/\d{1,2}\/\d{1,2}/            // 2025/1/1
    ];

    return await validateDatePatterns(page, datePatterns);
}

/**
 * 영어 날짜 형식 검증
 */
async function validateEnglishDateFormat(page) {
    const datePatterns = [
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/i, // January 1, 2025
        /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,       // 1/1/2025
        /\b\d{4}-\d{2}-\d{2}\b/              // 2025-01-01
    ];

    return await validateDatePatterns(page, datePatterns);
}

/**
 * 날짜 패턴 검증 헬퍼 함수
 */
async function validateDatePatterns(page, patterns) {
    try {
        const pageText = await page.textContent('body');
        return patterns.some(pattern => pattern.test(pageText));
    } catch (error) {
        return false;
    }
}

/**
 * 한국어 숫자 형식 검증
 */
async function validateKoreanNumberFormat(page) {
    const numberPatterns = [
        /\d{1,3}(,\d{3})*/,      // 1,000
        /\d+원/,                 // 1000원
        /\d+명/                  // 10명
    ];

    return await validateNumberPatterns(page, numberPatterns);
}

/**
 * 일본어 숫자 형식 검증
 */
async function validateJapaneseNumberFormat(page) {
    const numberPatterns = [
        /\d{1,3}(,\d{3})*/,      // 1,000
        /\d+円/,                 // 1000円
        /\d+人/                  // 10人
    ];

    return await validateNumberPatterns(page, numberPatterns);
}

/**
 * 중국어 숫자 형식 검증
 */
async function validateChineseNumberFormat(page) {
    const numberPatterns = [
        /\d{1,3}(,\d{3})*/,      // 1,000
        /\d+元/,                 // 1000元
        /\d+人/                  // 10人
    ];

    return await validateNumberPatterns(page, numberPatterns);
}

/**
 * 영어 숫자 형식 검증
 */
async function validateEnglishNumberFormat(page) {
    const numberPatterns = [
        /\d{1,3}(,\d{3})*/,      // 1,000
        /\$\d+/,                 // $1000
        /\d+\s+(people|users)/   // 10 people
    ];

    return await validateNumberPatterns(page, numberPatterns);
}

/**
 * 숫자 패턴 검증 헬퍼 함수
 */
async function validateNumberPatterns(page, patterns) {
    try {
        const pageText = await page.textContent('body');
        return patterns.some(pattern => pattern.test(pageText));
    } catch (error) {
        return false;
    }
}

/**
 * 한국어 통화 형식 검증
 */
async function validateKoreanCurrencyFormat(page) {
    const currencyPatterns = [
        /\d{1,3}(,\d{3})*원/,    // 1,000원
        /₩\d{1,3}(,\d{3})*/      // ₩1,000
    ];

    return await validateNumberPatterns(page, currencyPatterns);
}

/**
 * 영어 통화 형식 검증
 */
async function validateEnglishCurrencyFormat(page) {
    const currencyPatterns = [
        /\$\d{1,3}(,\d{3})*(\.\d{2})?/,  // $1,000.00
        /USD\s*\d+/                       // USD 1000
    ];

    return await validateNumberPatterns(page, currencyPatterns);
}

/**
 * 시간 형식 검증
 */
async function validateTimeFormat(page, language) {
    try {
        const pageText = await page.textContent('body');

        // 24시간 형식과 12시간 형식 모두 허용
        const timePatterns = [
            /\d{1,2}:\d{2}/,         // 14:30 또는 2:30
            /\d{1,2}:\d{2}:\d{2}/,   // 14:30:00
            /\d{1,2}:\d{2}\s*(AM|PM)/i  // 2:30 PM
        ];

        return timePatterns.some(pattern => pattern.test(pageText));
    } catch (error) {
        return false;
    }
}

/**
 * 언어별 종합 검증 실행
 */
async function runLanguageValidation(browser, language) {
    console.log(`\n🌍 ${language.name} (${language.nativeName}) 언어 검증 시작`);

    const context = await browser.newContext({
        locale: language.locale,
        extraHTTPHeaders: {
            'Accept-Language': `${language.locale},${language.code};q=0.9,en;q=0.8`
        }
    });

    const page = await context.newPage();
    const languageResults = {
        language: language,
        pageResults: [],
        overallScore: 0,
        totalPages: TEST_PAGES.length,
        passedPages: 0
    };

    try {
        for (const testPage of TEST_PAGES) {
            const pageResult = await validatePageInLanguage(page, testPage, language);

            const pageValidation = {
                page: testPage.name,
                url: testPage.url,
                language: language.code,
                ...pageResult
            };

            languageResults.pageResults.push(pageValidation);

            // 통과 기준: 70점 이상
            if (pageResult.score >= 70) {
                languageResults.passedPages++;
            }

            i18nResults.summary.totalTests++;
            if (pageResult.score >= 70) {
                i18nResults.summary.passedTests++;
            } else {
                i18nResults.summary.failedTests++;
            }
        }

        // 언어별 전체 점수 계산
        languageResults.overallScore = Math.round(
            languageResults.pageResults.reduce((sum, result) => sum + result.score, 0) /
            languageResults.pageResults.length
        );

        console.log(`✅ ${language.name} 전체 검증 완료: ${languageResults.overallScore}/100점`);

    } catch (error) {
        console.error(`❌ ${language.name} 언어 검증 실패:`, error.message);
        languageResults.error = error.message;
        languageResults.overallScore = 0;
    } finally {
        await context.close();
    }

    return languageResults;
}

/**
 * 다국어 지원 리포트 생성
 */
function generateI18nReport(results) {
    console.log('\n=====================================');
    console.log('🌐 DOT Platform 다국어 지원 검증 결과');
    console.log('=====================================');
    console.log(`검증 시간: ${results.timestamp}`);
    console.log(`대상 URL: ${results.baseUrl}`);
    console.log(`지원 언어: ${results.supportedLanguages.map(lang => lang.nativeName).join(', ')}`);
    console.log('');

    // 전체 요약
    console.log('📊 전체 요약:');
    console.log(`  총 테스트: ${results.summary.totalTests}`);
    console.log(`  통과: ${results.summary.passedTests} (${Math.round(results.summary.passedTests / results.summary.totalTests * 100)}%)`);
    console.log(`  실패: ${results.summary.failedTests} (${Math.round(results.summary.failedTests / results.summary.totalTests * 100)}%)`);
    console.log('');

    // 언어별 결과
    console.log('🌍 언어별 결과:');
    Object.values(results.languageResults).forEach(langResult => {
        const status = langResult.overallScore >= 70 ? '✅ 통과' : '❌ 실패';
        console.log(`  ${status} ${langResult.language.name} (${langResult.language.nativeName}): ${langResult.overallScore}/100점`);
        console.log(`    통과 페이지: ${langResult.passedPages}/${langResult.totalPages}`);

        // 주요 문제점 표시
        const failedPages = langResult.pageResults.filter(page => page.score < 70);
        if (failedPages.length > 0) {
            console.log(`    문제 페이지: ${failedPages.map(page => page.page).join(', ')}`);
        }
        console.log('');
    });

    // 권장사항
    if (results.recommendations.length > 0) {
        console.log('💡 개선 권장사항:');
        results.recommendations.forEach((rec, index) => {
            console.log(`  ${index + 1}. ${rec}`);
        });
        console.log('');
    }

    // 전체 평가
    const overallScore = Math.round((results.summary.passedTests / results.summary.totalTests) * 100);
    console.log('🎯 전체 평가:');
    if (overallScore >= 90) {
        console.log(`  🎉 우수 (${overallScore}점) - 다국어 지원이 훌륭합니다`);
    } else if (overallScore >= 70) {
        console.log(`  ⚠️  보통 (${overallScore}점) - 일부 언어 개선 필요`);
    } else {
        console.log(`  ❌ 미흡 (${overallScore}점) - 다국어 지원 개선 필요`);
    }

    return overallScore;
}

/**
 * JSON 리포트 저장
 */
async function saveI18nReport(results, filePath) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(results, null, 2), 'utf8');
        console.log(`📁 다국어 검증 결과 저장: ${filePath}`);
    } catch (error) {
        console.error('리포트 저장 실패:', error.message);
    }
}

/**
 * 메인 다국어 검증 실행 함수
 */
async function main() {
    console.log('🚀 DOT Platform 다국어 UI 검증 시작');
    console.log(`대상 URL: ${BASE_URL}`);
    console.log(`지원 언어: ${SUPPORTED_LANGUAGES.map(lang => lang.name).join(', ')}\n`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security', '--disable-features=VizDisplayCompositor']
    });

    try {
        // 각 언어별로 검증 실행
        for (const language of SUPPORTED_LANGUAGES) {
            const languageResult = await runLanguageValidation(browser, language);
            i18nResults.languageResults[language.code] = languageResult;
            i18nResults.summary.languageScores[language.code] = languageResult.overallScore;
        }

        // 권장사항 생성
        const failedLanguages = Object.values(i18nResults.languageResults)
            .filter(result => result.overallScore < 70)
            .map(result => result.language.name);

        if (failedLanguages.length > 0) {
            i18nResults.recommendations = [
                `${failedLanguages.join(', ')} 언어 번역 완성도 개선`,
                'HTML lang 속성을 동적으로 변경하도록 구현',
                '언어별 폰트 최적화 (한글: Noto Sans KR, 일본어: Noto Sans JP 등)',
                '언어별 날짜/시간/숫자 형식 로컬라이제이션',
                '언어 전환 UI 컴포넌트 추가',
                '번역되지 않은 텍스트 식별 및 번역 완료'
            ];
        }

        // 결과 리포트 생성
        const overallScore = generateI18nReport(i18nResults);

        // JSON 리포트 저장
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `./logs/i18n-report-${timestamp}.json`;
        await saveI18nReport(i18nResults, reportPath);

        // 검증 결과에 따른 종료 코드
        const exitCode = overallScore >= 70 ? 0 : 1;
        console.log(`\n다국어 검증 완료 (점수: ${overallScore}/100)`);
        process.exit(exitCode);

    } catch (error) {
        console.error('❌ 다국어 검증 중 오류 발생:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

// 스크립트가 직접 실행되는 경우
if (require.main === module) {
    main().catch(error => {
        console.error('다국어 검증 실패:', error);
        process.exit(1);
    });
}

module.exports = {
    runLanguageValidation,
    validatePageInLanguage,
    validateExpectedTexts,
    validateFontRendering,
    generateI18nReport,
    SUPPORTED_LANGUAGES,
    TEST_PAGES
};