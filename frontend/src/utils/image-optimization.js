/**
 * 이미지 최적화 유틸리티
 *
 * 이미지 로딩 성능 개선을 위한 유틸리티
 * - Lazy loading
 * - Responsive 이미지
 * - WebP 변환
 * - 이미지 압축
 */

import React, { useState, useEffect, useRef } from 'react';

/**
 * Intersection Observer를 활용한 이미지 레이지 로딩 훅
 */
export const useLazyLoadImage = (src, options = {}) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [imageRef, setImageRef] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);

  const {
    threshold = 0.1,
    rootMargin = '50px',
    placeholder = '/assets/placeholder.svg'
  } = options;

  useEffect(() => {
    if (!imageRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // 이미지 프리로드
            const img = new Image();
            img.src = src;

            img.onload = () => {
              setImageSrc(src);
              setIsLoaded(true);
              observer.unobserve(imageRef);
            };

            img.onerror = () => {
              setIsError(true);
              observer.unobserve(imageRef);
            };
          }
        });
      },
      {
        threshold,
        rootMargin
      }
    );

    observer.observe(imageRef);

    return () => {
      if (imageRef) {
        observer.unobserve(imageRef);
      }
    };
  }, [imageRef, src, threshold, rootMargin]);

  return {
    src: isLoaded ? imageSrc : placeholder,
    ref: setImageRef,
    isLoaded,
    isError
  };
};

/**
 * LazyImage 컴포넌트
 */
export const LazyImage = ({
  src,
  alt,
  className = '',
  placeholder = '/assets/placeholder.svg',
  errorImage = '/assets/error-image.svg',
  onLoad,
  onError,
  ...props
}) => {
  const imageRef = useRef(null);
  const [currentSrc, setCurrentSrc] = useState(placeholder);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadImage();
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '50px'
      }
    );

    if (imageRef.current) {
      observer.observe(imageRef.current);
    }

    return () => {
      if (imageRef.current) {
        observer.unobserve(imageRef.current);
      }
    };
  }, [src]);

  const loadImage = () => {
    const img = new Image();
    img.src = src;

    img.onload = () => {
      setCurrentSrc(src);
      setIsLoading(false);
      if (onLoad) onLoad();
    };

    img.onerror = () => {
      setCurrentSrc(errorImage);
      setIsLoading(false);
      if (onError) onError();
    };
  };

  return (
    <img
      ref={imageRef}
      src={currentSrc}
      alt={alt}
      className={`${className} ${isLoading ? 'loading' : 'loaded'}`}
      loading="lazy"
      {...props}
    />
  );
};

/**
 * Picture 컴포넌트 - 반응형 및 최적화된 이미지
 */
export const Picture = ({
  src,
  alt,
  className = '',
  sizes = '100vw',
  loading = 'lazy'
}) => {
  // 이미지 소스 세트 생성
  const generateSrcSet = (baseSrc, format) => {
    const widths = [320, 640, 768, 1024, 1280, 1920];
    const extension = format || baseSrc.split('.').pop();

    return widths
      .map((width) => {
        const optimizedSrc = baseSrc.replace(
          /\.[^/.]+$/,
          `-${width}w.${extension}`
        );
        return `${optimizedSrc} ${width}w`;
      })
      .join(', ');
  };

  // WebP 지원 확인
  const supportsWebP = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('image/webp') === 0;
  };

  const webpSrc = src.replace(/\.[^/.]+$/, '.webp');
  const jpegSrc = src.replace(/\.[^/.]+$/, '.jpg');

  return (
    <picture>
      {/* WebP 형식 */}
      {supportsWebP() && (
        <source
          type="image/webp"
          srcSet={generateSrcSet(src, 'webp')}
          sizes={sizes}
        />
      )}

      {/* AVIF 형식 (최신 브라우저) */}
      <source
        type="image/avif"
        srcSet={generateSrcSet(src, 'avif')}
        sizes={sizes}
      />

      {/* 기본 JPEG/PNG */}
      <img
        src={jpegSrc}
        srcSet={generateSrcSet(jpegSrc, 'jpg')}
        sizes={sizes}
        alt={alt}
        className={className}
        loading={loading}
      />
    </picture>
  );
};

/**
 * 이미지 프리로더
 */
export class ImagePreloader {
  constructor() {
    this.cache = new Map();
  }

  /**
   * 단일 이미지 프리로드
   */
  preload(src) {
    return new Promise((resolve, reject) => {
      if (this.cache.has(src)) {
        resolve(this.cache.get(src));
        return;
      }

      const img = new Image();
      img.src = src;

      img.onload = () => {
        this.cache.set(src, img);
        resolve(img);
      };

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${src}`));
      };
    });
  }

  /**
   * 여러 이미지 프리로드
   */
  preloadMultiple(srcs) {
    return Promise.allSettled(srcs.map(src => this.preload(src)));
  }

  /**
   * 우선순위 기반 프리로드
   */
  preloadWithPriority(images) {
    const highPriority = images.filter(img => img.priority === 'high');
    const mediumPriority = images.filter(img => img.priority === 'medium');
    const lowPriority = images.filter(img => img.priority === 'low');

    // 순차적으로 프리로드
    return (async () => {
      await this.preloadMultiple(highPriority.map(img => img.src));
      await this.preloadMultiple(mediumPriority.map(img => img.src));
      await this.preloadMultiple(lowPriority.map(img => img.src));
    })();
  }

  /**
   * 캐시 초기화
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * 이미지 최적화 유틸리티 함수
 */
export const imageUtils = {
  /**
   * 이미지 리사이징 URL 생성
   */
  getResizedImageUrl(src, width, height, quality = 85) {
    // CDN 또는 이미지 서비스 URL 생성
    const baseUrl = process.env.REACT_APP_IMAGE_CDN_URL || '';
    const params = new URLSearchParams({
      w: width,
      h: height,
      q: quality,
      auto: 'format', // 자동 포맷 변환
      fit: 'crop'
    });

    return `${baseUrl}${src}?${params.toString()}`;
  },

  /**
   * 디바이스 픽셀 비율에 따른 이미지 선택
   */
  getRetinaImage(src) {
    const dpr = window.devicePixelRatio || 1;

    if (dpr > 2) {
      return src.replace(/\.(jpg|jpeg|png|webp)$/i, '@3x.$1');
    } else if (dpr > 1) {
      return src.replace(/\.(jpg|jpeg|png|webp)$/i, '@2x.$1');
    }

    return src;
  },

  /**
   * 이미지 파일 크기 체크
   */
  checkImageSize(file, maxSizeMB = 10) {
    const maxSize = maxSizeMB * 1024 * 1024;
    return file.size <= maxSize;
  },

  /**
   * 이미지 압축
   */
  async compressImage(file, options = {}) {
    const {
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 0.8,
      mimeType = 'image/jpeg'
    } = options;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;

        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 비율 유지하며 리사이징
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(new File([blob], file.name, {
                  type: mimeType,
                  lastModified: Date.now()
                }));
              } else {
                reject(new Error('압축 실패'));
              }
            },
            mimeType,
            quality
          );
        };

        img.onerror = () => {
          reject(new Error('이미지 로드 실패'));
        };
      };

      reader.onerror = () => {
        reject(new Error('파일 읽기 실패'));
      };
    });
  },

  /**
   * Base64를 Blob으로 변환
   */
  base64ToBlob(base64, mimeType = 'image/jpeg') {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);

      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: mimeType });
  },

  /**
   * 이미지 메타데이터 제거
   */
  async stripMetadata(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now()
            }));
          }, file.type);
        };
        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
    });
  }
};

/**
 * Progressive 이미지 로딩 컴포넌트
 */
export const ProgressiveImage = ({
  placeholder,
  src,
  alt,
  className = ''
}) => {
  const [currentSrc, setCurrentSrc] = useState(placeholder);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 낮은 품질 이미지 먼저 로드
    const loadingImage = new Image();
    loadingImage.src = src;

    loadingImage.onload = () => {
      setCurrentSrc(src);
      setLoading(false);
    };

    return () => {
      loadingImage.onload = null;
    };
  }, [src]);

  return (
    <div className={`progressive-image ${loading ? 'loading' : 'loaded'}`}>
      <img
        src={currentSrc}
        alt={alt}
        className={className}
        style={{
          filter: loading ? 'blur(5px)' : 'blur(0px)',
          transition: 'filter 0.3s ease-out'
        }}
      />
    </div>
  );
};

// 전역 이미지 프리로더 인스턴스
export const imagePreloader = new ImagePreloader();

// React 앱 초기화시 중요 이미지 프리로드
export const preloadCriticalImages = () => {
  const criticalImages = [
    '/assets/logo.png',
    '/assets/hero-image.jpg',
    '/assets/icons/sprite.svg'
  ];

  imagePreloader.preloadMultiple(criticalImages).then(() => {
    console.log('Critical images preloaded');
  });
};

export default {
  LazyImage,
  Picture,
  ProgressiveImage,
  ImagePreloader,
  imageUtils,
  useLazyLoadImage,
  imagePreloader,
  preloadCriticalImages
};