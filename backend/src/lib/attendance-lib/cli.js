#!/usr/bin/env node
/**
 * T091: attendance-lib CLI 인터페이스 (부분 구현)
 * GPS 거리 계산, QR 코드 생성/검증 명령어
 */

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// 모듈 import
const gps = require('./gps');
const qr = require('./qr');

const {
  calculateDistance,
  isWithinRadius,
  formatLocation
} = gps;

const {
  generateQRCode,
  verifyQRCode,
  formatQRInfo
} = qr;

const argv = yargs(hideBin(process.argv))
  .usage('사용법: $0 <명령어> [옵션]')
  .version('0.1.0')
  .alias('v', 'version')
  .help('h')
  .alias('h', 'help')
  .option('format', {
    alias: 'f',
    describe: '출력 형식',
    choices: ['json', 'text'],
    default: 'text'
  })
  // GPS 거리 계산 명령어
  .command('calculate-distance', '두 GPS 좌표 간 거리 계산', {
    lat1: {
      describe: '첫 번째 위도',
      demandOption: true,
      type: 'number'
    },
    lng1: {
      describe: '첫 번째 경도',
      demandOption: true,
      type: 'number'
    },
    lat2: {
      describe: '두 번째 위도',
      demandOption: true,
      type: 'number'
    },
    lng2: {
      describe: '두 번째 경도',
      demandOption: true,
      type: 'number'
    }
  }, (argv) => {
    const pos1 = { lat: argv.lat1, lng: argv.lng1 };
    const pos2 = { lat: argv.lat2, lng: argv.lng2 };

    try {
      const distance = calculateDistance(pos1, pos2);

      if (argv.format === 'json') {
        console.log(JSON.stringify({
          pos1,
          pos2,
          distance: Math.round(distance),
          unit: 'meters'
        }, null, 2));
      } else {
        console.log(`위치 1: ${formatLocation(pos1)}`);
        console.log(`위치 2: ${formatLocation(pos2)}`);
        console.log(`거리: ${Math.round(distance)}m (${(distance / 1000).toFixed(2)}km)`);
      }
    } catch (error) {
      console.error('❌ 오류:', error.message);
      process.exit(1);
    }
  })
  // 반경 확인 명령어
  .command('check-radius', '위치가 반경 내에 있는지 확인', {
    centerLat: {
      describe: '중심점 위도',
      demandOption: true,
      type: 'number'
    },
    centerLng: {
      describe: '중심점 경도',
      demandOption: true,
      type: 'number'
    },
    pointLat: {
      describe: '확인 지점 위도',
      demandOption: true,
      type: 'number'
    },
    pointLng: {
      describe: '확인 지점 경도',
      demandOption: true,
      type: 'number'
    },
    radius: {
      describe: '반경 (미터)',
      default: 50,
      type: 'number'
    }
  }, (argv) => {
    const center = { lat: argv.centerLat, lng: argv.centerLng };
    const point = { lat: argv.pointLat, lng: argv.pointLng };

    try {
      const distance = calculateDistance(center, point);
      const withinRadius = isWithinRadius(center, point, argv.radius);

      if (argv.format === 'json') {
        console.log(JSON.stringify({
          center,
          point,
          radius: argv.radius,
          distance: Math.round(distance),
          withinRadius
        }, null, 2));
      } else {
        console.log(`중심점: ${formatLocation(center)}`);
        console.log(`확인점: ${formatLocation(point)}`);
        console.log(`거리: ${Math.round(distance)}m`);
        console.log(`${argv.radius}m 반경 내: ${withinRadius ? '예 ✓' : '아니오 ✗'}`);
      }
    } catch (error) {
      console.error('❌ 오류:', error.message);
      process.exit(1);
    }
  })
  // QR 코드 생성 명령어
  .command('verify-location', '작업장 위치 검증 (GPS 기반)', {
    userLat: {
      describe: '사용자 위도',
      demandOption: true,
      type: 'number'
    },
    userLng: {
      describe: '사용자 경도',
      demandOption: true,
      type: 'number'
    },
    businessLat: {
      describe: '작업장 위도',
      demandOption: true,
      type: 'number'
    },
    businessLng: {
      describe: '작업장 경도',
      demandOption: true,
      type: 'number'
    },
    radius: {
      describe: '허용 반경 (미터)',
      default: 50,
      type: 'number'
    }
  }, (argv) => {
    const userLocation = { lat: argv.userLat, lng: argv.userLng };
    const businessLocation = { lat: argv.businessLat, lng: argv.businessLng };

    try {
      const distance = calculateDistance(
        userLocation.lat,
        userLocation.lng,
        businessLocation.lat,
        businessLocation.lng
      );
      const withinRadius = isWithinRadius(userLocation, businessLocation, argv.radius);

      if (argv.format === 'json') {
        console.log(JSON.stringify({
          userLocation,
          businessLocation,
          radius: argv.radius,
          distance: Math.round(distance),
          withinRadius,
          valid: withinRadius
        }, null, 2));
      } else {
        console.log('=== 작업장 위치 검증 결과 ===');
        console.log(`사용자 위치: ${formatLocation(userLocation)}`);
        console.log(`작업장 위치: ${formatLocation(businessLocation)}`);
        console.log(`거리: ${Math.round(distance)}m`);
        console.log(`허용 반경: ${argv.radius}m`);
        console.log(`검증 결과: ${withinRadius ? '✅ 출퇴근 가능' : '❌ 범위 초과'}`);

        if (!withinRadius) {
          console.log(`📍 ${argv.radius}m 반경 내로 이동해주세요.`);
        }
      }
    } catch (error) {
      console.error('❌ 오류:', error.message);
      process.exit(1);
    }
  })
  .command('generate-qr', 'QR 코드 생성 (사업장용)', {
    businessId: {
      describe: '사업장 ID',
      demandOption: true,
      type: 'string'
    },
    expiry: {
      describe: '만료 시간 (초)',
      default: 30,
      type: 'number'
    },
    output: {
      describe: 'QR 이미지 파일 저장 경로',
      type: 'string'
    }
  }, async (argv) => {
    try {
      const result = await generateQRCode(argv.businessId, argv.expiry * 1000);

      if (argv.output) {
        // QR 이미지를 파일로 저장
        const fs = require('fs');
        const base64Data = result.qrCode.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(argv.output, base64Data, 'base64');
        console.log(`QR code saved to ${argv.output}`);
      }

      if (argv.format === 'json') {
        console.log(JSON.stringify({
          businessId: argv.businessId,
          token: result.token,
          expiresAt: result.expiresAt,
          expiresIn: `${argv.expiry}s`
        }, null, 2));
      } else {
        console.log('QR 코드 생성 완료');
        console.log(formatQRInfo({
          businessId: argv.businessId,
          expiresAt: result.expiresAt,
          token: result.token
        }));
        console.log(`\n토큰: ${result.token}`);
      }
    } catch (error) {
      console.error('❌ 오류:', error.message);
      process.exit(1);
    }
  })
  // QR 토큰 검증 명령어
  .command('verify-qr', 'QR 토큰 검증', {
    token: {
      describe: '검증할 QR 토큰',
      demandOption: true,
      type: 'string'
    }
  }, async (argv) => {
    try {
      const result = await verifyQRCode(argv.token);

      if (argv.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.valid) {
          console.log('✅ 유효한 QR 토큰');
          console.log(`사업장 ID: ${result.businessId}`);
          console.log(`생성 시간: ${new Date(result.timestamp).toISOString()}`);
          console.log(`만료 시간: ${new Date(result.expiresAt).toISOString()}`);
        } else {
          console.log('❌ 유효하지 않은 QR 토큰');
          console.log(`오류: ${result.error}`);
          if (result.expired) {
            console.log('토큰이 만료되었습니다');
          }
        }
      }
    } catch (error) {
      console.error('❌ 오류:', error.message);
      process.exit(1);
    }
  })
  .demandCommand()
  .strict()
  .argv;