/**
 * Webpack 최적화 설정
 *
 * 번들 크기 감소 및 성능 향상을 위한 설정
 * - 코드 스플리팅
 * - 트리 셰이킹
 * - 압축 및 최소화
 * - 캐싱 최적화
 */

const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

// 환경 변수
const isDevelopment = process.env.NODE_ENV !== 'production';
const isAnalyze = process.env.ANALYZE === 'true';

module.exports = {
  // 엔트리 포인트
  entry: {
    main: './src/index.js',
    // 벤더 번들 분리
    vendor: [
      'react',
      'react-dom',
      'react-router-dom',
      'redux',
      'react-redux',
      '@reduxjs/toolkit',
      'axios'
    ]
  },

  // 출력 설정
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: isDevelopment
      ? '[name].bundle.js'
      : '[name].[contenthash:8].bundle.js',
    chunkFilename: isDevelopment
      ? '[name].chunk.js'
      : '[name].[contenthash:8].chunk.js',
    publicPath: '/',
    clean: true
  },

  // 개발 서버 설정
  devServer: {
    static: {
      directory: path.join(__dirname, 'public')
    },
    port: 3000,
    hot: true,
    open: true,
    historyApiFallback: true,
    compress: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },

  // 모드 설정
  mode: isDevelopment ? 'development' : 'production',

  // 소스맵 설정
  devtool: isDevelopment
    ? 'eval-cheap-module-source-map'
    : 'source-map',

  // 모듈 설정
  module: {
    rules: [
      // JavaScript/JSX 처리
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                modules: false, // 트리 셰이킹을 위해 ES6 모듈 유지
                useBuiltIns: 'usage',
                corejs: 3
              }],
              ['@babel/preset-react', {
                runtime: 'automatic' // React 17+ 자동 런타임
              }]
            ],
            plugins: [
              '@babel/plugin-syntax-dynamic-import', // 동적 import
              '@babel/plugin-transform-runtime', // 헬퍼 중복 제거
              isDevelopment && require.resolve('react-refresh/babel')
            ].filter(Boolean),
            cacheDirectory: true, // 빌드 캐싱
            cacheCompression: false
          }
        }
      },

      // CSS 처리
      {
        test: /\.css$/,
        use: [
          isDevelopment
            ? 'style-loader'
            : MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              sourceMap: isDevelopment,
              modules: {
                auto: /\.module\.\w+$/i,
                localIdentName: isDevelopment
                  ? '[path][name]__[local]'
                  : '[hash:base64:5]'
              }
            }
          },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  'postcss-preset-env',
                  'autoprefixer',
                  !isDevelopment && 'cssnano'
                ].filter(Boolean)
              }
            }
          }
        ]
      },

      // SCSS/SASS 처리
      {
        test: /\.(scss|sass)$/,
        use: [
          isDevelopment
            ? 'style-loader'
            : MiniCssExtractPlugin.loader,
          'css-loader',
          'postcss-loader',
          'sass-loader'
        ]
      },

      // 이미지 처리
      {
        test: /\.(png|jpg|jpeg|gif|svg|webp|avif)$/,
        type: 'asset',
        parser: {
          dataUrlCondition: {
            maxSize: 8 * 1024 // 8KB 이하 인라인
          }
        },
        generator: {
          filename: 'assets/images/[name].[hash:8][ext]'
        }
      },

      // 폰트 처리
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/fonts/[name].[hash:8][ext]'
        }
      }
    ]
  },

  // 확장자 처리
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@assets': path.resolve(__dirname, 'src/assets')
    }
  },

  // 최적화 설정
  optimization: {
    minimize: !isDevelopment,
    minimizer: [
      // JavaScript 압축
      new TerserPlugin({
        terserOptions: {
          parse: {
            ecma: 8
          },
          compress: {
            ecma: 5,
            warnings: false,
            comparisons: false,
            inline: 2,
            drop_console: !isDevelopment,
            drop_debugger: !isDevelopment
          },
          mangle: {
            safari10: true
          },
          output: {
            ecma: 5,
            comments: false,
            ascii_only: true
          }
        },
        parallel: true
      }),

      // CSS 압축
      new CssMinimizerPlugin({
        minimizerOptions: {
          preset: [
            'default',
            {
              discardComments: { removeAll: true }
            }
          ]
        }
      })
    ],

    // 코드 스플리팅
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        // 벤더 번들
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          priority: 10,
          reuseExistingChunk: true
        },
        // React 관련 번들
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
          name: 'react',
          priority: 20
        },
        // Material-UI 번들
        mui: {
          test: /[\\/]node_modules[\\/]@mui[\\/]/,
          name: 'mui',
          priority: 15
        },
        // 공통 모듈
        common: {
          minChunks: 2,
          priority: 5,
          reuseExistingChunk: true,
          name: 'common'
        }
      }
    },

    // 런타임 청크
    runtimeChunk: {
      name: 'runtime'
    },

    // 모듈 ID 최적화
    moduleIds: 'deterministic'
  },

  // 플러그인
  plugins: [
    // 빌드 디렉토리 정리
    new CleanWebpackPlugin(),

    // HTML 템플릿
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
      inject: 'body',
      minify: !isDevelopment && {
        removeComments: true,
        collapseWhitespace: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
        removeEmptyAttributes: true,
        removeStyleLinkTypeAttributes: true,
        keepClosingSlash: true,
        minifyJS: true,
        minifyCSS: true,
        minifyURLs: true
      }
    }),

    // CSS 추출
    !isDevelopment &&
      new MiniCssExtractPlugin({
        filename: 'assets/css/[name].[contenthash:8].css',
        chunkFilename: 'assets/css/[name].[contenthash:8].chunk.css'
      }),

    // 환경 변수 정의
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(
        process.env.NODE_ENV || 'development'
      ),
      'process.env.API_URL': JSON.stringify(
        process.env.API_URL || 'http://localhost:5000'
      )
    }),

    // Gzip 압축
    !isDevelopment &&
      new CompressionPlugin({
        algorithm: 'gzip',
        test: /\.(js|css|html|svg)$/,
        threshold: 10240, // 10KB 이상만 압축
        minRatio: 0.8,
        deleteOriginalAssets: false
      }),

    // Brotli 압축
    !isDevelopment &&
      new CompressionPlugin({
        algorithm: 'brotliCompress',
        test: /\.(js|css|html|svg)$/,
        compressionOptions: {
          level: 11
        },
        threshold: 10240,
        minRatio: 0.8,
        filename: '[path][base].br',
        deleteOriginalAssets: false
      }),

    // 정적 파일 복사
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'public',
          to: '',
          globOptions: {
            ignore: ['**/index.html']
          }
        }
      ]
    }),

    // PWA 서비스 워커
    !isDevelopment &&
      new WorkboxPlugin.GenerateSW({
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60 // 5분
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30일
              }
            }
          },
          {
            urlPattern: /\.(?:js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 7일
              }
            }
          }
        ]
      }),

    // 번들 분석기
    isAnalyze &&
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: '../bundle-report.html',
        openAnalyzer: true,
        generateStatsFile: true,
        statsFilename: '../bundle-stats.json'
      }),

    // 진행 상황 표시
    new webpack.ProgressPlugin({
      activeModules: false,
      entries: true,
      modules: true,
      modulesCount: 5000,
      profile: false,
      dependencies: true,
      dependenciesCount: 10000,
      percentBy: null
    }),

    // Hot Module Replacement
    isDevelopment && new webpack.HotModuleReplacementPlugin()
  ].filter(Boolean),

  // 성능 경고
  performance: {
    hints: !isDevelopment && 'warning',
    maxEntrypointSize: 512000, // 500KB
    maxAssetSize: 512000 // 500KB
  },

  // 통계 정보
  stats: {
    colors: true,
    modules: false,
    children: false,
    chunks: false,
    chunkModules: false
  }
};