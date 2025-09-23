/**
 * Vercel 배포 간단 테스트
 * 핵심 이슈 확인 중심
 */

const { test, expect } = require('@playwright/test');

test.describe('Vercel 배포 핵심 확인', () => {

  test('배포 URL 접근 및 리다이렉트 확인', async ({ page }) => {
    const urls = [
      'https://dot-platform-git-main-02102n.vercel.app',
      'https://dot-platform-qpr5dz1ot-02102n.vercel.app'
    ];

    console.log('📍 Vercel 배포 URL 테스트 시작...');

    for (const url of urls) {
      console.log(`\n🔗 테스트 URL: ${url}`);

      try {
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        console.log(`📊 HTTP 상태: ${response.status()}`);
        console.log(`📄 페이지 타이틀: "${await page.title()}"`);
        console.log(`🌐 최종 URL: ${page.url()}`);

        // Vercel 로그인으로 리다이렉트되는지 확인
        if (page.url().includes('vercel.com/login')) {
          console.log('⚠️ Vercel 로그인 페이지로 리다이렉트됨 - 배포가 비공개 상태');
          console.log('🔑 이는 Vercel 프로젝트가 인증이 필요한 상태임을 의미');

          // 원본 URL이 포함되어 있는지 확인
          if (page.url().includes(encodeURIComponent(url))) {
            console.log('✅ 원본 URL이 next 파라미터에 올바르게 포함됨');
          }
        } else {
          console.log('✅ 직접 접근 가능한 배포');
        }

        break; // 첫 번째 성공하는 URL로 계속

      } catch (error) {
        console.log(`❌ ${url} 접근 실패: ${error.message}`);
      }
    }
  });

  test('네트워크 요청 상세 분석', async ({ page }) => {
    const networkLogs = [];
    const apiLogs = [];

    // 모든 네트워크 요청 수집
    page.on('request', request => {
      const logEntry = {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        timestamp: new Date().toISOString()
      };

      networkLogs.push(logEntry);

      // API 관련 요청 필터링
      if (request.url().includes('api/') ||
          request.url().includes(':3001') ||
          request.url().includes('100.25.70.173')) {
        apiLogs.push(logEntry);
      }
    });

    // 응답 정보 수집
    page.on('response', response => {
      const request = response.request();
      if (request.url().includes('api/') ||
          request.url().includes(':3001') ||
          request.url().includes('100.25.70.173')) {
        console.log(`📡 API 응답: ${response.status()} ${request.method()} ${request.url()}`);
      }
    });

    console.log('🔍 네트워크 분석 시작...');

    // 페이지 접근
    try {
      await page.goto('https://dot-platform-git-main-02102n.vercel.app', {
        waitUntil: 'networkidle',
        timeout: 30000
      });
    } catch (error) {
      // 에러 무시하고 계속 - 리다이렉트될 수 있음
    }

    // 잠시 대기 (추가 네트워크 요청 기다림)
    await page.waitForTimeout(3000);

    console.log(`\n📊 총 네트워크 요청: ${networkLogs.length}개`);

    // JavaScript 파일 분석
    const jsFiles = networkLogs.filter(req =>
      req.resourceType === 'script' && req.url.includes('.js')
    );

    console.log(`\n📦 JavaScript 파일들 (${jsFiles.length}개):`);
    jsFiles.forEach(file => {
      const fileName = file.url.split('/').pop();
      console.log(`  - ${fileName}`);

      // 번들 파일 해시 확인
      if (fileName.startsWith('main.') && fileName.endsWith('.js')) {
        if (fileName === 'main.ddba04d8.js') {
          console.log('    ❌ 이전 캐시된 번들 (문제의 localhost 버전)');
        } else if (fileName === 'main.138d918e.js') {
          console.log('    ✅ 새로운 번들 (EC2 연결 버전)');
        } else {
          console.log(`    📋 다른 번들 버전: ${fileName}`);
        }
      }
    });

    // API 요청 분석
    if (apiLogs.length > 0) {
      console.log(`\n🔗 API 관련 요청들 (${apiLogs.length}개):`);
      apiLogs.forEach(req => {
        console.log(`  ${req.method} ${req.url}`);

        if (req.url.includes('localhost:3001')) {
          console.log('    ❌ localhost:3001 요청 발견! (설정 오류)');
        } else if (req.url.includes('100.25.70.173:3001')) {
          console.log('    ✅ EC2 백엔드 요청 (올바른 설정)');
        }
      });
    } else {
      console.log('\n📭 API 관련 요청 없음');
    }

    // 특정 도메인별 요청 카운트
    const requestsByDomain = {};
    networkLogs.forEach(req => {
      try {
        const domain = new URL(req.url).hostname;
        requestsByDomain[domain] = (requestsByDomain[domain] || 0) + 1;
      } catch (e) {
        // URL 파싱 실패 무시
      }
    });

    console.log('\n🌐 도메인별 요청 수:');
    Object.entries(requestsByDomain)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([domain, count]) => {
        console.log(`  ${domain}: ${count}개`);
      });
  });

});