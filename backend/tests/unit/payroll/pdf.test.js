/**
 * T193: PDF 생성 테스트 (RED)
 * 급여명세서 PDF 변환 테스트
 */

const payrollLib = require('../../../src/lib/payroll-lib');
const fs = require('fs').promises;
const path = require('path');

describe('급여명세서 PDF 생성', () => {
  const samplePayrollData = {
    userId: 1,
    businessId: 1,
    userName: '홍길동',
    businessName: '테스트 카페',
    period: '2024-01',
    year: 2024,
    month: 1,
    workHours: {
      total: 176,
      regular: 160,
      overtime: 16,
      night: 8,
      weekend: 0,
      holiday: 0
    },
    wages: {
      baseWage: 3000000,
      hourlyWage: 14329,
      regularPay: 2292640,
      overtimePay: 343896,
      nightShiftPay: 57316,
      weekendPay: 0,
      holidayPay: 0
    },
    allowances: {
      weeklyRest: 458528,
      meal: 100000,
      transport: 50000,
      other: 0,
      total: 608528
    },
    deductions: {
      nationalPension: 135000,
      healthInsurance: 106350,
      longTermCare: 13772,
      employmentInsurance: 27000,
      incomeTax: 150000,
      other: 0,
      total: 432122
    },
    summary: {
      grossPay: 3302380,
      totalDeductions: 432122,
      netPay: 2870258
    },
    calculatedAt: new Date('2024-02-01T00:00:00Z')
  };

  // 테스트용 임시 디렉토리
  const testDir = path.join(__dirname, 'temp');

  beforeAll(async () => {
    // 임시 디렉토리 생성
    try {
      await fs.mkdir(testDir, { recursive: true });
    } catch (error) {
      // 디렉토리가 이미 존재하면 무시
    }
  });

  afterAll(async () => {
    // 임시 파일 정리
    try {
      const files = await fs.readdir(testDir);
      for (const file of files) {
        if (file.endsWith('.pdf')) {
          await fs.unlink(path.join(testDir, file));
        }
      }
      await fs.rmdir(testDir);
    } catch (error) {
      // 정리 실패시 무시
    }
  });

  describe('PDF 생성 기본 기능', () => {
    test('PDF Buffer 생성', async () => {
      const pdfBuffer = await payrollLib.generatePDF(samplePayrollData);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      // PDF 시그니처 확인 (%PDF)
      const header = pdfBuffer.toString('utf8', 0, 4);
      expect(header).toBe('%PDF');
    });

    test('PDF 파일 저장', async () => {
      const fileName = `payslip_${Date.now()}.pdf`;
      const filePath = path.join(testDir, fileName);

      const pdfBuffer = await payrollLib.generatePDF(samplePayrollData);
      await payrollLib.savePDF(pdfBuffer, filePath);

      // 파일 존재 확인
      const stats = await fs.stat(filePath);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });

    test('PDF 옵션 설정', async () => {
      const options = {
        format: 'A4',
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div style="font-size: 10px;">급여명세서</div>',
        footerTemplate: '<div style="font-size: 10px;">페이지 <span class="pageNumber"></span></div>'
      };

      const pdfBuffer = await payrollLib.generatePDF(samplePayrollData, options);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });
  });

  describe('PDF 내용 검증', () => {
    test('한글 폰트 지원', async () => {
      const koreanData = {
        ...samplePayrollData,
        userName: '김철수',
        businessName: '한글 사업장명',
        notes: '한글 메모 테스트'
      };

      const pdfBuffer = await payrollLib.generatePDF(koreanData);

      // PDF 생성 성공 확인 (한글로 인한 오류 없음)
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    test('큰 숫자 포맷팅', async () => {
      const largeNumberData = {
        ...samplePayrollData,
        summary: {
          grossPay: 10000000,
          totalDeductions: 1500000,
          netPay: 8500000
        }
      };

      const pdfBuffer = await payrollLib.generatePDF(largeNumberData);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      // PDF가 정상 생성되었는지만 확인
      expect(pdfBuffer.length).toBeGreaterThan(1000);
    });
  });

  describe('PDF 일괄 생성', () => {
    test('여러 직원 PDF 일괄 생성', async () => {
      const employees = [
        { ...samplePayrollData, userId: 1, userName: '홍길동' },
        { ...samplePayrollData, userId: 2, userName: '김철수' },
        { ...samplePayrollData, userId: 3, userName: '이영희' }
      ];

      const pdfBuffers = await payrollLib.generateBulkPDF(employees);

      expect(pdfBuffers).toHaveLength(3);
      pdfBuffers.forEach((buffer, index) => {
        expect(buffer).toBeInstanceOf(Buffer);
        expect(buffer.length).toBeGreaterThan(0);
      });
    });

    test('ZIP 아카이브 생성', async () => {
      const employees = [
        { ...samplePayrollData, userId: 1, userName: '홍길동' },
        { ...samplePayrollData, userId: 2, userName: '김철수' }
      ];

      const zipBuffer = await payrollLib.generatePDFArchive(employees);

      expect(zipBuffer).toBeInstanceOf(Buffer);
      // ZIP 시그니처 확인 (PK)
      const header = zipBuffer.toString('utf8', 0, 2);
      expect(header).toBe('PK');
    });
  });

  describe('PDF 메타데이터', () => {
    test('PDF 메타데이터 설정', async () => {
      const metadata = {
        title: '급여명세서 - 2024년 1월',
        subject: '홍길동 급여명세서',
        author: 'DOT Platform',
        keywords: '급여, 명세서, 2024-01',
        creator: 'DOT Platform Payroll System',
        producer: 'Node.js PDF Generator'
      };

      const pdfBuffer = await payrollLib.generatePDF(samplePayrollData, { metadata });

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      // PDF가 메타데이터와 함께 생성되었는지 확인
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    test('PDF 보안 설정', async () => {
      const security = {
        userPassword: 'user123',
        ownerPassword: 'owner456',
        permissions: {
          printing: 'highResolution',
          modifying: false,
          copying: false,
          annotating: false
        }
      };

      const pdfBuffer = await payrollLib.generatePDF(samplePayrollData, { security });

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      // 암호화된 PDF는 일반 PDF보다 크기가 큼
      expect(pdfBuffer.length).toBeGreaterThan(1000);
    });
  });

  describe('에러 처리', () => {
    test('잘못된 데이터 처리', async () => {
      const invalidData = {
        // 필수 필드 누락
        userId: 1
      };

      await expect(payrollLib.generatePDF(invalidData))
        .rejects
        .toThrow('급여 데이터가 불완전합니다');
    });

    test('파일 저장 권한 오류', async () => {
      const readOnlyPath = '/root/test.pdf'; // 권한 없는 경로

      const pdfBuffer = await payrollLib.generatePDF(samplePayrollData);

      await expect(payrollLib.savePDF(pdfBuffer, readOnlyPath))
        .rejects
        .toThrow();
    });
  });
});