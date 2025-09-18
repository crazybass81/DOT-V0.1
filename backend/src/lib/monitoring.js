/**
 * 모니터링 라이브러리
 *
 * 시스템 메트릭 수집 및 로깅
 * - 성능 메트릭
 * - 에러 추적
 * - 비즈니스 메트릭
 * - 헬스 체크
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * 메트릭 수집기 클래스
 */
class MetricsCollector extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      interval: options.interval || 60000, // 1분
      enableSystemMetrics: options.enableSystemMetrics !== false,
      enableApplicationMetrics: options.enableApplicationMetrics !== false,
      enableBusinessMetrics: options.enableBusinessMetrics !== false,
      retentionDays: options.retentionDays || 7
    };

    this.metrics = {
      system: {},
      application: {},
      business: {},
      errors: []
    };

    this.collectors = new Map();
    this.timers = new Map();
  }

  /**
   * 모니터링 시작
   */
  start() {
    console.log('모니터링 시작');

    if (this.options.enableSystemMetrics) {
      this.startSystemMetrics();
    }

    if (this.options.enableApplicationMetrics) {
      this.startApplicationMetrics();
    }

    if (this.options.enableBusinessMetrics) {
      this.startBusinessMetrics();
    }

    // 정기적으로 메트릭 저장
    this.saveInterval = setInterval(() => {
      this.saveMetrics();
    }, this.options.interval);
  }

  /**
   * 모니터링 중지
   */
  stop() {
    console.log('모니터링 중지');

    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }

    this.timers.forEach(timer => clearInterval(timer));
    this.timers.clear();
  }

  /**
   * 시스템 메트릭 수집
   */
  startSystemMetrics() {
    const collectSystemMetrics = () => {
      const cpus = os.cpus();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;

      // CPU 사용률 계산
      let totalIdle = 0;
      let totalTick = 0;

      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });

      const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);

      this.metrics.system = {
        timestamp: Date.now(),
        cpu: {
          usage: cpuUsage,
          count: cpus.length,
          model: cpus[0].model
        },
        memory: {
          total: totalMemory,
          used: usedMemory,
          free: freeMemory,
          percentage: (usedMemory / totalMemory * 100).toFixed(2)
        },
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
        platform: os.platform(),
        hostname: os.hostname()
      };

      this.emit('metrics:system', this.metrics.system);
    };

    // 즉시 실행 후 주기적 실행
    collectSystemMetrics();
    const timer = setInterval(collectSystemMetrics, 10000); // 10초마다
    this.timers.set('system', timer);
  }

  /**
   * 애플리케이션 메트릭 수집
   */
  startApplicationMetrics() {
    const collectAppMetrics = () => {
      const memUsage = process.memoryUsage();

      this.metrics.application = {
        timestamp: Date.now(),
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers
        },
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          version: process.version,
          title: process.title
        },
        eventLoop: {
          // Event loop lag 측정 (근사치)
          lag: this.measureEventLoopLag()
        }
      };

      this.emit('metrics:application', this.metrics.application);
    };

    collectAppMetrics();
    const timer = setInterval(collectAppMetrics, 5000); // 5초마다
    this.timers.set('application', timer);
  }

  /**
   * 비즈니스 메트릭 수집
   */
  startBusinessMetrics() {
    // 비즈니스 메트릭은 외부에서 주입
    this.metrics.business = {
      timestamp: Date.now(),
      requests: {
        total: 0,
        success: 0,
        failure: 0,
        latency: []
      },
      users: {
        active: 0,
        new: 0,
        total: 0
      },
      attendance: {
        checkins: 0,
        checkouts: 0,
        active: 0
      },
      schedules: {
        created: 0,
        modified: 0,
        deleted: 0
      }
    };
  }

  /**
   * Event Loop Lag 측정
   */
  measureEventLoopLag() {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // ms 단위
      this.lastEventLoopLag = lag;
    });
    return this.lastEventLoopLag || 0;
  }

  /**
   * 커스텀 메트릭 기록
   */
  recordMetric(category, name, value, tags = {}) {
    if (!this.metrics[category]) {
      this.metrics[category] = {};
    }

    if (!this.metrics[category][name]) {
      this.metrics[category][name] = [];
    }

    this.metrics[category][name].push({
      timestamp: Date.now(),
      value,
      tags
    });

    this.emit('metrics:custom', { category, name, value, tags });
  }

  /**
   * 카운터 증가
   */
  incrementCounter(name, value = 1, tags = {}) {
    this.recordMetric('counters', name, value, tags);
  }

  /**
   * 게이지 설정
   */
  setGauge(name, value, tags = {}) {
    this.recordMetric('gauges', name, value, tags);
  }

  /**
   * 히스토그램 기록
   */
  recordHistogram(name, value, tags = {}) {
    this.recordMetric('histograms', name, value, tags);
  }

  /**
   * 타이머 시작
   */
  startTimer(name) {
    const start = process.hrtime.bigint();
    return () => {
      const duration = Number(process.hrtime.bigint() - start) / 1000000; // ms
      this.recordHistogram(name, duration);
      return duration;
    };
  }

  /**
   * 에러 기록
   */
  recordError(error, context = {}) {
    const errorData = {
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
      ...this.extractErrorMetadata(error)
    };

    this.metrics.errors.push(errorData);

    // 에러 개수 제한
    if (this.metrics.errors.length > 1000) {
      this.metrics.errors = this.metrics.errors.slice(-500);
    }

    this.emit('error:recorded', errorData);
  }

  /**
   * 에러 메타데이터 추출
   */
  extractErrorMetadata(error) {
    const metadata = {};

    if (error.code) metadata.code = error.code;
    if (error.statusCode) metadata.statusCode = error.statusCode;
    if (error.syscall) metadata.syscall = error.syscall;
    if (error.errno) metadata.errno = error.errno;
    if (error.path) metadata.path = error.path;

    return metadata;
  }

  /**
   * 메트릭 저장
   */
  async saveMetrics() {
    const timestamp = new Date().toISOString();
    const filename = `metrics-${timestamp.split('T')[0]}.json`;
    const filepath = path.join(process.cwd(), 'logs', filename);

    // logs 디렉토리 생성
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // 기존 데이터 읽기
    let existingData = [];
    if (fs.existsSync(filepath)) {
      try {
        const content = fs.readFileSync(filepath, 'utf8');
        existingData = JSON.parse(content);
      } catch (error) {
        console.error('메트릭 파일 읽기 실패:', error);
      }
    }

    // 새 데이터 추가
    existingData.push({
      timestamp,
      metrics: this.getMetrics()
    });

    // 파일 저장
    try {
      fs.writeFileSync(filepath, JSON.stringify(existingData, null, 2));
    } catch (error) {
      console.error('메트릭 저장 실패:', error);
    }

    // 오래된 파일 정리
    this.cleanupOldMetrics();
  }

  /**
   * 오래된 메트릭 파일 정리
   */
  cleanupOldMetrics() {
    const logsDir = path.join(process.cwd(), 'logs');
    const retentionMs = this.options.retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    try {
      const files = fs.readdirSync(logsDir);

      files.forEach(file => {
        if (file.startsWith('metrics-') && file.endsWith('.json')) {
          const filepath = path.join(logsDir, file);
          const stats = fs.statSync(filepath);

          if (now - stats.mtimeMs > retentionMs) {
            fs.unlinkSync(filepath);
            console.log(`오래된 메트릭 파일 삭제: ${file}`);
          }
        }
      });
    } catch (error) {
      console.error('메트릭 파일 정리 실패:', error);
    }
  }

  /**
   * 현재 메트릭 조회
   */
  getMetrics() {
    return {
      system: this.metrics.system,
      application: this.metrics.application,
      business: this.metrics.business,
      counters: this.metrics.counters || {},
      gauges: this.metrics.gauges || {},
      histograms: this.metrics.histograms || {},
      errors: this.metrics.errors.slice(-100) // 최근 100개 에러
    };
  }

  /**
   * 메트릭 초기화
   */
  resetMetrics() {
    this.metrics = {
      system: {},
      application: {},
      business: {},
      errors: [],
      counters: {},
      gauges: {},
      histograms: {}
    };
  }
}

/**
 * Express 미들웨어 - 요청 모니터링
 */
function requestMonitoring(collector) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();

    // 요청 카운터 증가
    collector.incrementCounter('http.requests.total', 1, {
      method: req.method,
      path: req.route?.path || req.path
    });

    // 응답 완료시 메트릭 기록
    res.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - start) / 1000000; // ms

      // 응답 시간 히스토그램
      collector.recordHistogram('http.request.duration', duration, {
        method: req.method,
        path: req.route?.path || req.path,
        status: res.statusCode
      });

      // 상태 코드별 카운터
      collector.incrementCounter(`http.responses.${res.statusCode}`, 1);

      // 느린 요청 로깅
      if (duration > 1000) {
        console.warn(`느린 요청 감지: ${req.method} ${req.path} - ${duration}ms`);
      }
    });

    next();
  };
}

/**
 * 헬스 체크 엔드포인트
 */
function healthCheck(collector) {
  return async (req, res) => {
    const metrics = collector.getMetrics();

    // 헬스 상태 판단
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      checks: []
    };

    // 메모리 체크
    const memUsage = process.memoryUsage();
    const memoryHealthy = memUsage.heapUsed < memUsage.heapTotal * 0.9;
    health.checks.push({
      name: 'memory',
      status: memoryHealthy ? 'healthy' : 'unhealthy',
      details: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(2)
      }
    });

    // CPU 체크
    const cpuHealthy = metrics.system.cpu?.usage < 80;
    health.checks.push({
      name: 'cpu',
      status: cpuHealthy ? 'healthy' : 'unhealthy',
      details: {
        usage: metrics.system.cpu?.usage || 0
      }
    });

    // 에러율 체크
    const recentErrors = metrics.errors.filter(e =>
      Date.now() - e.timestamp < 60000 // 최근 1분
    ).length;
    const errorHealthy = recentErrors < 10;
    health.checks.push({
      name: 'errors',
      status: errorHealthy ? 'healthy' : 'unhealthy',
      details: {
        recentErrors,
        threshold: 10
      }
    });

    // 전체 상태 결정
    const isHealthy = health.checks.every(check => check.status === 'healthy');
    health.status = isHealthy ? 'healthy' : 'unhealthy';

    res.status(isHealthy ? 200 : 503).json(health);
  };
}

/**
 * 메트릭 대시보드 데이터
 */
function metricsEndpoint(collector) {
  return (req, res) => {
    const metrics = collector.getMetrics();

    // 대시보드용 데이터 가공
    const dashboard = {
      timestamp: Date.now(),
      system: {
        cpu: metrics.system.cpu,
        memory: metrics.system.memory,
        uptime: metrics.system.uptime
      },
      application: {
        memory: metrics.application?.memory,
        eventLoopLag: metrics.application?.eventLoop?.lag
      },
      requests: {
        total: metrics.counters?.['http.requests.total'] || [],
        duration: metrics.histograms?.['http.request.duration'] || [],
        statusCodes: {}
      },
      errors: {
        recent: metrics.errors.slice(-10),
        count: metrics.errors.length
      }
    };

    // 상태 코드별 집계
    Object.keys(metrics.counters || {}).forEach(key => {
      if (key.startsWith('http.responses.')) {
        const statusCode = key.split('.').pop();
        dashboard.requests.statusCodes[statusCode] =
          metrics.counters[key].reduce((sum, item) => sum + item.value, 0);
      }
    });

    res.json(dashboard);
  };
}

/**
 * 성능 프로파일링
 */
class PerformanceProfiler {
  constructor() {
    this.profiles = new Map();
  }

  /**
   * 프로파일 시작
   */
  start(name) {
    const profile = {
      name,
      startTime: process.hrtime.bigint(),
      startMemory: process.memoryUsage(),
      marks: []
    };

    this.profiles.set(name, profile);

    return {
      mark: (label) => this.mark(name, label),
      end: () => this.end(name)
    };
  }

  /**
   * 중간 마크 기록
   */
  mark(name, label) {
    const profile = this.profiles.get(name);
    if (!profile) return;

    profile.marks.push({
      label,
      time: process.hrtime.bigint(),
      memory: process.memoryUsage()
    });
  }

  /**
   * 프로파일 종료
   */
  end(name) {
    const profile = this.profiles.get(name);
    if (!profile) return null;

    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();

    const result = {
      name,
      duration: Number(endTime - profile.startTime) / 1000000, // ms
      memoryDelta: {
        heapUsed: endMemory.heapUsed - profile.startMemory.heapUsed,
        external: endMemory.external - profile.startMemory.external
      },
      marks: profile.marks.map(mark => ({
        label: mark.label,
        elapsed: Number(mark.time - profile.startTime) / 1000000,
        memoryDelta: {
          heapUsed: mark.memory.heapUsed - profile.startMemory.heapUsed
        }
      }))
    };

    this.profiles.delete(name);
    return result;
  }
}

// 싱글톤 인스턴스
let defaultCollector = null;

/**
 * 기본 collector 가져오기
 */
function getDefaultCollector() {
  if (!defaultCollector) {
    defaultCollector = new MetricsCollector();
    defaultCollector.start();
  }
  return defaultCollector;
}

module.exports = {
  MetricsCollector,
  PerformanceProfiler,
  requestMonitoring,
  healthCheck,
  metricsEndpoint,
  getDefaultCollector
};