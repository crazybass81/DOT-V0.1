/**
 * T194: PDF 생성 구현
 * 급여명세서를 PDF로 변환
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const archiver = require('archiver');

/**
 * 급여명세서 PDF 생성
 * @param {Object} payrollData - 급여 데이터
 * @param {Object} options - PDF 옵션
 * @returns {Promise<Buffer>} PDF Buffer
 */
async function generatePDF(payrollData, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      // 데이터 유효성 검증
      if (!payrollData || !payrollData.userId) {
        throw new Error('급여 데이터가 불완전합니다');
      }

      // PDF 문서 생성
      const doc = new PDFDocument({
        size: options.format || 'A4',
        margin: options.margin || 50,
        info: options.metadata || {
          Title: `급여명세서 - ${payrollData.period || ''}`,
          Author: 'DOT Platform',
          Subject: '급여명세서',
          Keywords: 'payroll, statement',
          Creator: 'DOT Platform Payroll System',
          Producer: 'Node.js PDF Generator',
          CreationDate: new Date()
        }
      });

      // Buffer 수집
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });

      // 한글 폰트 설정 (시스템 폰트 사용)
      // 실제 구현시 NanumGothic 등의 폰트 파일 필요
      // doc.font('fonts/NanumGothic.ttf');

      // 제목
      doc.fontSize(20)
         .text('급 여 명 세 서', { align: 'center' });

      doc.moveDown();

      // 기간 정보
      doc.fontSize(12)
         .text(`급여 기간: ${payrollData.period || payrollData.year + '-' + String(payrollData.month).padStart(2, '0')}`, { align: 'center' });

      doc.moveDown(2);

      // 직원 정보
      doc.fontSize(11);
      doc.text(`성명: ${payrollData.userName || ''}`, 50);
      doc.text(`사업장: ${payrollData.businessName || ''}`, 300, doc.y - 14);

      doc.moveDown();

      // 구분선
      doc.moveTo(50, doc.y)
         .lineTo(550, doc.y)
         .stroke();

      doc.moveDown();

      // 근무 내역
      doc.fontSize(14)
         .text('근무 내역', { underline: true });

      doc.fontSize(10);
      if (payrollData.workHours) {
        doc.text(`총 근무시간: ${payrollData.workHours.total || 0}시간`);
        doc.text(`정규 근무: ${payrollData.workHours.regular || 0}시간`);
        if (payrollData.workHours.overtime > 0) {
          doc.text(`연장 근무: ${payrollData.workHours.overtime}시간`);
        }
        if (payrollData.workHours.night > 0) {
          doc.text(`야간 근무: ${payrollData.workHours.night}시간`);
        }
        if (payrollData.workHours.weekend > 0) {
          doc.text(`휴일 근무: ${payrollData.workHours.weekend}시간`);
        }
      }

      doc.moveDown();

      // 지급 내역
      doc.fontSize(14)
         .text('지급 내역', { underline: true });

      doc.fontSize(10);
      let yPosition = doc.y;

      // 지급 항목들
      if (payrollData.wages) {
        addPaymentRow(doc, '기본급', payrollData.wages.regularPay || 0);
        if (payrollData.wages.overtimePay > 0) {
          addPaymentRow(doc, '연장근로수당', payrollData.wages.overtimePay);
        }
        if (payrollData.wages.nightShiftPay > 0) {
          addPaymentRow(doc, '야간근로수당', payrollData.wages.nightShiftPay);
        }
        if (payrollData.wages.weekendPay > 0) {
          addPaymentRow(doc, '휴일근로수당', payrollData.wages.weekendPay);
        }
      }

      if (payrollData.allowances) {
        if (payrollData.allowances.weeklyRest > 0) {
          addPaymentRow(doc, '주휴수당', payrollData.allowances.weeklyRest);
        }
        if (payrollData.allowances.meal > 0) {
          addPaymentRow(doc, '식대', payrollData.allowances.meal);
        }
        if (payrollData.allowances.transport > 0) {
          addPaymentRow(doc, '교통비', payrollData.allowances.transport);
        }
      }

      // 지급 합계
      doc.moveTo(50, doc.y)
         .lineTo(550, doc.y)
         .stroke();
      doc.moveDown(0.5);

      doc.fontSize(11)
         .text('지급 합계', 50, doc.y, { width: 200 })
         .text(formatCurrency(payrollData.summary?.grossPay || 0), 400, doc.y - 14, { width: 150, align: 'right' });

      doc.moveDown(2);

      // 공제 내역
      doc.fontSize(14)
         .text('공제 내역', { underline: true });

      doc.fontSize(10);

      if (payrollData.deductions) {
        addPaymentRow(doc, '국민연금', payrollData.deductions.nationalPension || 0);
        addPaymentRow(doc, '건강보험', payrollData.deductions.healthInsurance || 0);
        addPaymentRow(doc, '장기요양보험', payrollData.deductions.longTermCare || 0);
        addPaymentRow(doc, '고용보험', payrollData.deductions.employmentInsurance || 0);
        addPaymentRow(doc, '소득세', payrollData.deductions.incomeTax || 0);

        const localIncomeTax = Math.floor((payrollData.deductions.incomeTax || 0) * 0.1);
        if (localIncomeTax > 0) {
          addPaymentRow(doc, '지방소득세', localIncomeTax);
        }
      }

      // 공제 합계
      doc.moveTo(50, doc.y)
         .lineTo(550, doc.y)
         .stroke();
      doc.moveDown(0.5);

      doc.fontSize(11)
         .text('공제 합계', 50, doc.y, { width: 200 })
         .text(formatCurrency(payrollData.summary?.totalDeductions || 0), 400, doc.y - 14, { width: 150, align: 'right' });

      doc.moveDown(2);

      // 실수령액
      doc.rect(40, doc.y - 5, 520, 30)
         .fillAndStroke('#f0f0f0', '#333');

      doc.fillColor('#000')
         .fontSize(14)
         .text('실수령액', 50, doc.y, { width: 200 })
         .fontSize(16)
         .text(formatCurrency(payrollData.summary?.netPay || 0), 350, doc.y - 16, { width: 200, align: 'right' });

      // 페이지 하단 정보
      doc.fontSize(8)
         .fillColor('#666')
         .text(`생성일시: ${new Date().toLocaleString('ko-KR')}`, 50, 750)
         .text('DOT Platform © 2024', 50, 760);

      // PDF 종료
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 지급/공제 항목 행 추가
 */
function addPaymentRow(doc, label, amount) {
  doc.text(label, 70, doc.y, { width: 200 })
     .text(formatCurrency(amount), 400, doc.y - 14, { width: 150, align: 'right' });
  doc.moveDown(0.7);
}

/**
 * 통화 포맷
 */
function formatCurrency(amount) {
  return amount.toLocaleString('ko-KR') + '원';
}

/**
 * PDF 파일 저장
 * @param {Buffer} pdfBuffer - PDF 버퍼
 * @param {string} filePath - 저장 경로
 */
async function savePDF(pdfBuffer, filePath) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, pdfBuffer, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve(filePath);
      }
    });
  });
}

/**
 * 여러 직원 PDF 일괄 생성
 * @param {Array} employees - 직원 급여 데이터 배열
 * @returns {Promise<Array<Buffer>>} PDF Buffer 배열
 */
async function generateBulkPDF(employees) {
  const pdfPromises = employees.map(employee => generatePDF(employee));
  return Promise.all(pdfPromises);
}

/**
 * PDF 아카이브(ZIP) 생성
 * @param {Array} employees - 직원 급여 데이터 배열
 * @returns {Promise<Buffer>} ZIP Buffer
 */
async function generatePDFArchive(employees) {
  return new Promise(async (resolve, reject) => {
    try {
      const archive = archiver('zip', {
        zlib: { level: 9 } // 최대 압축
      });

      const chunks = [];
      archive.on('data', chunk => chunks.push(chunk));
      archive.on('end', () => {
        const zipBuffer = Buffer.concat(chunks);
        resolve(zipBuffer);
      });
      archive.on('error', reject);

      // 각 직원의 PDF 생성 및 아카이브에 추가
      for (const employee of employees) {
        const pdfBuffer = await generatePDF(employee);
        const fileName = `payslip_${employee.userId}_${employee.period || 'unknown'}.pdf`;
        archive.append(pdfBuffer, { name: fileName });
      }

      archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 데이터베이스 저장용 포맷 변환
 * @param {Object} payrollData - 급여 데이터
 * @returns {Object} 데이터베이스 형식 데이터
 */
function prepareForDatabase(payrollData) {
  return {
    business_id: payrollData.businessId,
    user_id: payrollData.userId,
    year: payrollData.year,
    month: payrollData.month,
    period_start: new Date(payrollData.year, payrollData.month - 1, 1),
    period_end: new Date(payrollData.year, payrollData.month, 0),

    // 근무 시간
    total_work_hours: payrollData.workHours?.total || 0,
    regular_work_hours: payrollData.workHours?.regular || 0,
    overtime_hours: payrollData.workHours?.overtime || 0,
    night_hours: payrollData.workHours?.night || 0,
    weekend_hours: payrollData.workHours?.weekend || 0,
    holiday_hours: payrollData.workHours?.holiday || 0,

    // 급여
    base_wage: payrollData.wages?.baseWage || 0,
    hourly_wage: payrollData.wages?.hourlyWage || 0,
    regular_pay: payrollData.wages?.regularPay || 0,
    overtime_pay: payrollData.wages?.overtimePay || 0,
    night_shift_pay: payrollData.wages?.nightShiftPay || 0,
    weekend_pay: payrollData.wages?.weekendPay || 0,
    holiday_pay: payrollData.wages?.holidayPay || 0,

    // 수당
    weekly_rest_allowance: payrollData.allowances?.weeklyRest || 0,
    annual_leave_allowance: payrollData.allowances?.annualLeave || 0,
    meal_allowance: payrollData.allowances?.meal || 0,
    transport_allowance: payrollData.allowances?.transport || 0,
    family_allowance: payrollData.allowances?.family || 0,
    position_allowance: payrollData.allowances?.position || 0,
    longevity_allowance: payrollData.allowances?.longevity || 0,
    other_allowances: payrollData.allowances?.other || 0,
    total_allowances: payrollData.allowances?.total || 0,

    // 공제
    national_pension: payrollData.deductions?.nationalPension || 0,
    health_insurance: payrollData.deductions?.healthInsurance || 0,
    long_term_care: payrollData.deductions?.longTermCare || 0,
    employment_insurance: payrollData.deductions?.employmentInsurance || 0,
    income_tax: payrollData.deductions?.incomeTax || 0,
    local_income_tax: Math.floor((payrollData.deductions?.incomeTax || 0) * 0.1),
    other_deductions: payrollData.deductions?.other || 0,
    total_deductions: payrollData.deductions?.total || 0,

    // 총계
    gross_pay: payrollData.summary?.grossPay || 0,
    net_pay: payrollData.summary?.netPay || 0,

    // 상태
    status: 'draft'
  };
}

module.exports = {
  generatePDF,
  savePDF,
  generateBulkPDF,
  generatePDFArchive,
  prepareForDatabase
};