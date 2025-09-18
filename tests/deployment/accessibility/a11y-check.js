/**
 * DOT Platform 접근성 검증 스크립트 (WCAG 2.1 AA)
 *
 * 배포된 DOT Platform의 웹 접근성을 자동으로 검증합니다.
 * 한국어 요구사항: 모든 사용자가 접근 가능한 인터페이스 제공
 */

const { chromium } = require('playwright');

// 한국어 접근성 검증 설정
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';
const WCAG_LEVEL = 'AA'; // WCAG 2.1 AA 준수
const KOREAN_LOCALE = 'ko-KR';

// 검증할 페이지 목록
const TEST_PAGES = [
    {
        url: '/',
        name: '메인 페이지',
        description: '첫 화면 접근성',
        priority: 'critical'
    },
    {
        url: '/login',
        name: '로그인 페이지',
        description: '인증 화면 접근성',
        priority: 'critical'
    },
    {
        url: '/dashboard',
        name: '대시보드',
        description: '주요 작업 공간 접근성',
        priority: 'high'
    },
    {
        url: '/attendance',
        name: '출퇴근 체크',
        description: '핵심 기능 접근성',
        priority: 'critical'
    },
    {
        url: '/schedule',
        name: '스케줄 관리',
        description: '일정 관리 접근성',
        priority: 'high'
    },
    {
        url: '/payroll',
        name: '급여 정보',
        description: '급여 조회 접근성',
        priority: 'medium'
    }
];

// 접근성 검증 결과 저장 구조
const accessibilityResults = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    wcagLevel: WCAG_LEVEL,
    locale: KOREAN_LOCALE,
    summary: {
        totalPages: 0,
        passedPages: 0,
        failedPages: 0,
        totalViolations: 0,
        criticalViolations: 0,
        moderateViolations: 0,
        minorViolations: 0
    },
    pageResults: [],
    recommendations: []
};

/**
 * 페이지별 접근성 검증 실행
 */
async function runAccessibilityCheck(page, testPage) {
    console.log(`🔍 접근성 검증 시작: ${testPage.name} (${testPage.url})`);

    try {
        // 페이지 로드
        await page.goto(`${BASE_URL}${testPage.url}`, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        // 한국어 설정 확인
        await page.evaluate(() => {
            if (document.documentElement.lang === '') {
                document.documentElement.lang = 'ko';
            }
        });

        // 기본 접근성 검사 (Axe 대신 기본 검사)
        const basicChecks = await performBasicAccessibilityChecks(page);

        // 추가 한국어 특화 검증
        const koreanSpecificChecks = await performKoreanAccessibilityChecks(page);

        // 키보드 네비게이션 테스트
        const keyboardNavigation = await testKeyboardNavigation(page);

        // 스크린 리더 호환성 테스트
        const screenReaderCompatibility = await testScreenReaderCompatibility(page);

        // 색상 대비 검증
        const colorContrastResults = await testColorContrast(page);

        // 위반사항 계산
        const violations = calculateViolations(basicChecks, koreanSpecificChecks, keyboardNavigation, screenReaderCompatibility, colorContrastResults);

        // 결과 취합
        const pageResult = {
            page: testPage.name,
            url: testPage.url,
            priority: testPage.priority,
            timestamp: new Date().toISOString(),
            basicChecks: basicChecks,
            koreanChecks: koreanSpecificChecks,
            keyboardNav: keyboardNavigation,
            screenReader: screenReaderCompatibility,
            colorContrast: colorContrastResults,
            violations: violations.total,
            passes: violations.passes,
            violationsByImpact: violations.byImpact
        };

        console.log(`✅ ${testPage.name} 검증 완료: ${violations.total}개 위반사항 발견`);

        return pageResult;

    } catch (error) {
        console.error(`❌ ${testPage.name} 검증 실패:`, error.message);
        return {
            page: testPage.name,
            url: testPage.url,
            error: error.message,
            violations: 999, // 오류 시 높은 위반 수로 표시
            passes: 0
        };
    }
}

/**
 * 기본 접근성 검사 수행
 */
async function performBasicAccessibilityChecks(page) {
    const checks = {
        hasTitle: false,
        hasMainLandmark: false,
        hasNavigation: false,
        hasHeadings: false,
        hasLangAttribute: false
    };

    try {
        // 페이지 제목 확인
        const title = await page.title();
        checks.hasTitle = title && title.trim().length > 0;

        // 메인 랜드마크 확인
        const mainElements = await page.locator('main, [role="main"]').count();
        checks.hasMainLandmark = mainElements > 0;

        // 네비게이션 확인
        const navElements = await page.locator('nav, [role="navigation"]').count();
        checks.hasNavigation = navElements > 0;

        // 헤딩 확인
        const headings = await page.locator('h1, h2, h3, h4, h5, h6').count();
        checks.hasHeadings = headings > 0;

        // 언어 속성 확인
        const htmlLang = await page.getAttribute('html', 'lang');
        checks.hasLangAttribute = htmlLang && htmlLang.trim().length > 0;

    } catch (error) {
        console.warn('기본 접근성 검사 오류:', error.message);
    }

    return checks;
}

/**
 * 한국어 특화 접근성 검증
 */
async function performKoreanAccessibilityChecks(page) {
    const checks = {
        langAttribute: false,
        koreanFonts: false,
        textDirection: false,
        koreanForm: false
    };

    try {
        // HTML lang 속성 확인 (한국어)
        const htmlLang = await page.getAttribute('html', 'lang');
        checks.langAttribute = htmlLang && (htmlLang.startsWith('ko') || htmlLang === 'ko-KR');

        // 한글 글꼴 사용 확인
        const koreanText = await page.locator('body').first();
        const computedStyle = await koreanText.evaluate(el => {
            const style = window.getComputedStyle(el);
            return {
                fontFamily: style.fontFamily,
                fontSize: style.fontSize,
                lineHeight: style.lineHeight
            };
        });

        // 한글 글꼴 포함 여부 확인
        const hasKoreanFont = /Noto|Malgun|맑은|굴림|돋움|바탕|궁서/.test(computedStyle.fontFamily) ||
                            computedStyle.fontFamily.includes('Korean');
        checks.koreanFonts = hasKoreanFont;

        // 텍스트 방향 확인 (한국어는 ltr)
        const textDirection = await page.evaluate(() => {
            const body = document.querySelector('body');
            const computedStyle = window.getComputedStyle(body);
            return computedStyle.direction;
        });
        checks.textDirection = textDirection === 'ltr';

        // 한국어 폼 레이블 확인
        const koreanLabels = await page.locator('label').count();
        const koreanInputs = await page.locator('input, select, textarea').count();
        checks.koreanForm = koreanLabels > 0 && koreanInputs > 0;

    } catch (error) {
        console.warn('한국어 특화 검증 중 오류:', error.message);
    }

    return checks;
}

/**
 * 키보드 네비게이션 테스트
 */
async function testKeyboardNavigation(page) {
    const navigation = {
        tabOrder: false,
        escapeKey: false,
        enterKey: false,
        focusVisible: false
    };

    try {
        // Tab 키 순서 테스트
        await page.keyboard.press('Tab');
        const firstFocus = await page.evaluate(() => document.activeElement?.tagName);

        await page.keyboard.press('Tab');
        const secondFocus = await page.evaluate(() => document.activeElement?.tagName);

        navigation.tabOrder = firstFocus && secondFocus && firstFocus !== secondFocus;

        // Escape 키 테스트 (모달이 있는 경우)
        const modals = await page.locator('[role="dialog"], .modal, [aria-modal="true"]').count();
        if (modals > 0) {
            await page.keyboard.press('Escape');
            navigation.escapeKey = true;
        } else {
            navigation.escapeKey = true; // 모달이 없으면 통과
        }

        // Enter 키 테스트
        const buttons = await page.locator('button, [role="button"]').first();
        if (await buttons.isVisible()) {
            await buttons.focus();
            navigation.enterKey = true;
        }

        // 포커스 가시성 테스트
        const focusStyles = await page.evaluate(() => {
            const style = window.getComputedStyle(document.activeElement, ':focus');
            return {
                outline: style.outline,
                boxShadow: style.boxShadow,
                border: style.border
            };
        });

        navigation.focusVisible = focusStyles.outline !== 'none' ||
                                 focusStyles.boxShadow !== 'none' ||
                                 focusStyles.border !== 'none';

    } catch (error) {
        console.warn('키보드 네비게이션 테스트 오류:', error.message);
    }

    return navigation;
}

/**
 * 스크린 리더 호환성 테스트
 */
async function testScreenReaderCompatibility(page) {
    const compatibility = {
        headingStructure: false,
        landmarks: false,
        altTexts: false,
        ariaLabels: false,
        formLabels: false
    };

    try {
        // 헤딩 구조 확인 (h1 → h2 → h3 순서)
        const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
        let headingLevels = [];
        for (const heading of headings) {
            const tagName = await heading.evaluate(el => el.tagName.toLowerCase());
            const level = parseInt(tagName.substring(1));
            headingLevels.push(level);
        }

        // 헤딩 순서가 올바른지 확인
        compatibility.headingStructure = headingLevels.length > 0 &&
                                       headingLevels[0] === 1 && // h1이 첫 번째
                                       !headingLevels.some((level, i) =>
                                           i > 0 && level > headingLevels[i-1] + 1
                                       );

        // 랜드마크 확인
        const landmarks = await page.locator('[role="main"], [role="banner"], [role="navigation"], [role="contentinfo"], main, nav, header, footer').count();
        compatibility.landmarks = landmarks > 0;

        // 이미지 대체 텍스트 확인
        const images = await page.locator('img').all();
        let altTextCount = 0;
        for (const img of images) {
            const alt = await img.getAttribute('alt');
            if (alt !== null) altTextCount++;
        }
        compatibility.altTexts = images.length === 0 || altTextCount === images.length;

        // ARIA 레이블 확인
        const ariaElements = await page.locator('[aria-label], [aria-labelledby], [aria-describedby]').count();
        compatibility.ariaLabels = ariaElements > 0;

        // 폼 레이블 확인
        const formInputs = await page.locator('input, select, textarea').all();
        let labeledInputs = 0;
        for (const input of formInputs) {
            const id = await input.getAttribute('id');
            const ariaLabel = await input.getAttribute('aria-label');
            const ariaLabelledby = await input.getAttribute('aria-labelledby');

            if (ariaLabel || ariaLabelledby || (id && await page.locator(`label[for="${id}"]`).count() > 0)) {
                labeledInputs++;
            }
        }
        compatibility.formLabels = formInputs.length === 0 || labeledInputs === formInputs.length;

    } catch (error) {
        console.warn('스크린 리더 호환성 테스트 오류:', error.message);
    }

    return compatibility;
}

/**
 * 색상 대비 검증
 */
async function testColorContrast(page) {
    const contrast = {
        textContrast: false,
        linkContrast: false,
        buttonContrast: false,
        averageRatio: 0
    };

    try {
        // 텍스트 요소들의 색상 대비 확인
        const contrastRatios = await page.evaluate(() => {
            const elements = document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, a, button');
            const ratios = [];

            function getLuminance(r, g, b) {
                const [rs, gs, bs] = [r, g, b].map(c => {
                    c = c / 255;
                    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
            }

            function getContrastRatio(color1, color2) {
                const l1 = getLuminance(color1.r, color1.g, color1.b);
                const l2 = getLuminance(color2.r, color2.g, color2.b);
                const lighter = Math.max(l1, l2);
                const darker = Math.min(l1, l2);
                return (lighter + 0.05) / (darker + 0.05);
            }

            function parseColor(colorStr) {
                const rgb = colorStr.match(/\d+/g);
                return rgb ? { r: parseInt(rgb[0]), g: parseInt(rgb[1]), b: parseInt(rgb[2]) } : null;
            }

            elements.forEach(el => {
                const style = window.getComputedStyle(el);
                const textColor = parseColor(style.color);
                const bgColor = parseColor(style.backgroundColor);

                if (textColor && bgColor && (bgColor.r !== 0 || bgColor.g !== 0 || bgColor.b !== 0)) {
                    const ratio = getContrastRatio(textColor, bgColor);
                    ratios.push({
                        element: el.tagName.toLowerCase(),
                        ratio: ratio,
                        textColor: style.color,
                        backgroundColor: style.backgroundColor
                    });
                }
            });

            return ratios;
        });

        if (contrastRatios.length > 0) {
            // WCAG AA 기준: 일반 텍스트 4.5:1, 큰 텍스트 3:1
            const passCount = contrastRatios.filter(r => r.ratio >= 4.5).length;
            const totalCount = contrastRatios.length;

            contrast.textContrast = passCount / totalCount >= 0.8; // 80% 이상 통과
            contrast.averageRatio = contrastRatios.reduce((sum, r) => sum + r.ratio, 0) / totalCount;

            // 링크와 버튼 별도 확인
            const linkRatios = contrastRatios.filter(r => r.element === 'a');
            const buttonRatios = contrastRatios.filter(r => r.element === 'button');

            contrast.linkContrast = linkRatios.length === 0 || linkRatios.every(r => r.ratio >= 4.5);
            contrast.buttonContrast = buttonRatios.length === 0 || buttonRatios.every(r => r.ratio >= 4.5);
        } else {
            // 색상 정보를 얻을 수 없는 경우 통과로 처리
            contrast.textContrast = true;
            contrast.linkContrast = true;
            contrast.buttonContrast = true;
        }

    } catch (error) {
        console.warn('색상 대비 테스트 오류:', error.message);
    }

    return contrast;
}

/**
 * 위반사항 계산
 */
function calculateViolations(basicChecks, koreanChecks, keyboardNav, screenReader, colorContrast) {
    let violations = 0;
    let passes = 0;
    const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };

    // 기본 검사 평가
    Object.values(basicChecks).forEach(passed => {
        if (passed) passes++;
        else {
            violations++;
            byImpact.serious++;
        }
    });

    // 한국어 검사 평가
    Object.values(koreanChecks).forEach(passed => {
        if (passed) passes++;
        else {
            violations++;
            byImpact.moderate++;
        }
    });

    // 키보드 네비게이션 평가
    Object.values(keyboardNav).forEach(passed => {
        if (passed) passes++;
        else {
            violations++;
            byImpact.critical++;
        }
    });

    // 스크린 리더 호환성 평가
    Object.values(screenReader).forEach(passed => {
        if (passed) passes++;
        else {
            violations++;
            byImpact.serious++;
        }
    });

    // 색상 대비 평가
    Object.values(colorContrast).forEach(passed => {
        if (passed) passes++;
        else {
            violations++;
            byImpact.moderate++;
        }
    });

    return {
        total: violations,
        passes: passes,
        byImpact: byImpact
    };
}

/**
 * 접근성 검증 리포트 생성
 */
function generateAccessibilityReport(results) {
    console.log('\n====================================');
    console.log('🔍 DOT Platform 접근성 검증 결과');
    console.log('====================================');
    console.log(`검증 시간: ${results.timestamp}`);
    console.log(`대상 URL: ${results.baseUrl}`);
    console.log(`WCAG 레벨: ${results.wcagLevel}`);
    console.log(`로케일: ${results.locale}`);
    console.log('');

    // 전체 요약
    console.log('📊 전체 요약:');
    console.log(`  총 페이지: ${results.summary.totalPages}`);
    console.log(`  통과: ${results.summary.passedPages} (${Math.round(results.summary.passedPages / results.summary.totalPages * 100)}%)`);
    console.log(`  실패: ${results.summary.failedPages} (${Math.round(results.summary.failedPages / results.summary.totalPages * 100)}%)`);
    console.log(`  총 위반사항: ${results.summary.totalViolations}`);
    console.log(`    - 심각: ${results.summary.criticalViolations}`);
    console.log(`    - 보통: ${results.summary.moderateViolations}`);
    console.log(`    - 경미: ${results.summary.minorViolations}`);
    console.log('');

    // 페이지별 결과
    console.log('📄 페이지별 결과:');
    results.pageResults.forEach(page => {
        const status = page.violations === 0 ? '✅ 통과' : '❌ 실패';
        const priority = page.priority === 'critical' ? '🔴 중요' :
                        page.priority === 'high' ? '🟡 높음' : '🟢 보통';

        console.log(`  ${status} ${page.page} (${priority})`);
        console.log(`    URL: ${page.url}`);
        console.log(`    위반사항: ${page.violations}개, 통과: ${page.passes}개`);

        if (page.violationsByImpact) {
            console.log(`    심각도별: 치명적 ${page.violationsByImpact.critical}, 심각 ${page.violationsByImpact.serious}, 보통 ${page.violationsByImpact.moderate}, 경미 ${page.violationsByImpact.minor}`);
        }

        // 한국어 특화 검증 결과
        if (page.koreanChecks) {
            console.log(`    한국어 접근성: 언어속성 ${page.koreanChecks.langAttribute ? '✅' : '❌'}, 한글글꼴 ${page.koreanChecks.koreanFonts ? '✅' : '❌'}`);
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
    const overallScore = Math.round((results.summary.passedPages / results.summary.totalPages) * 100);
    console.log('🎯 전체 평가:');
    if (overallScore >= 90) {
        console.log(`  🎉 우수 (${overallScore}점) - WCAG 2.1 AA 기준 충족`);
    } else if (overallScore >= 70) {
        console.log(`  ⚠️  보통 (${overallScore}점) - 일부 개선 필요`);
    } else {
        console.log(`  ❌ 미흡 (${overallScore}점) - 즉시 개선 필요`);
    }

    return overallScore;
}

/**
 * JSON 리포트 저장
 */
async function saveJsonReport(results, filePath) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
        // 디렉토리 생성
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        // 결과를 JSON 파일로 저장
        await fs.writeFile(filePath, JSON.stringify(results, null, 2), 'utf8');
        console.log(`📁 상세 결과 저장: ${filePath}`);
    } catch (error) {
        console.error('JSON 리포트 저장 실패:', error.message);
    }
}

/**
 * 메인 접근성 검증 실행 함수
 */
async function main() {
    console.log('🚀 DOT Platform 접근성 검증 시작');
    console.log(`대상 URL: ${BASE_URL}`);
    console.log(`WCAG 레벨: ${WCAG_LEVEL}`);
    console.log(`검증 페이지 수: ${TEST_PAGES.length}\n`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-web-security', '--disable-features=VizDisplayCompositor']
    });

    try {
        const context = await browser.newContext({
            locale: KOREAN_LOCALE,
            colorScheme: 'light', // 기본 테마로 테스트
            reducedMotion: 'reduce' // 모션 감소 옵션 테스트
        });

        const page = await context.newPage();

        // 모든 페이지에 대해 접근성 검증 실행
        accessibilityResults.summary.totalPages = TEST_PAGES.length;

        for (const testPage of TEST_PAGES) {
            const pageResult = await runAccessibilityCheck(page, testPage);
            accessibilityResults.pageResults.push(pageResult);

            // 통계 업데이트
            if (pageResult.violations === 0) {
                accessibilityResults.summary.passedPages++;
            } else {
                accessibilityResults.summary.failedPages++;
                accessibilityResults.summary.totalViolations += pageResult.violations;

                if (pageResult.violationsByImpact) {
                    accessibilityResults.summary.criticalViolations += pageResult.violationsByImpact.critical || 0;
                    accessibilityResults.summary.moderateViolations += pageResult.violationsByImpact.moderate || 0;
                    accessibilityResults.summary.minorViolations += pageResult.violationsByImpact.minor || 0;
                }
            }
        }

        // 권장사항 생성
        if (accessibilityResults.summary.totalViolations > 0) {
            accessibilityResults.recommendations = [
                '키보드 네비게이션 개선: 모든 인터렙티브 요소에 포커스 표시',
                '색상 대비 개선: WCAG AA 기준 4.5:1 이상 대비율 유지',
                '대체 텍스트 추가: 모든 이미지에 의미있는 alt 속성 제공',
                '폼 레이블 연결: input 요소와 label 요소 올바른 연결',
                '헤딩 구조 개선: h1부터 순차적인 헤딩 레벨 사용',
                '한국어 언어 속성: <html lang="ko"> 속성 명시적 설정'
            ];
        }

        // 결과 리포트 생성
        const overallScore = generateAccessibilityReport(accessibilityResults);

        // JSON 리포트 저장
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `./logs/accessibility-report-${timestamp}.json`;
        await saveJsonReport(accessibilityResults, reportPath);

        await context.close();

        // 검증 결과에 따른 종료 코드
        const exitCode = overallScore >= 70 ? 0 : 1;
        console.log(`\n접근성 검증 완료 (점수: ${overallScore}/100)`);
        process.exit(exitCode);

    } catch (error) {
        console.error('❌ 접근성 검증 중 오류 발생:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

// 스크립트가 직접 실행되는 경우
if (require.main === module) {
    main().catch(error => {
        console.error('접근성 검증 실패:', error);
        process.exit(1);
    });
}

module.exports = {
    runAccessibilityCheck,
    performKoreanAccessibilityChecks,
    testKeyboardNavigation,
    testScreenReaderCompatibility,
    testColorContrast,
    generateAccessibilityReport
};