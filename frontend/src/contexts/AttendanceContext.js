/**
 * DOT Platform Frontend - 근태 컨텍스트
 * 출퇴근, 휴게시간 등 근태 관련 상태와 실시간 업데이트를 관리하는 컨텍스트
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';

// Redux 액션과 셀렉터
import {
  setCurrentStatus,
  setTodayRecords,
  updateWorkingTime,
  updateBreakTime,
  clearError,
} from '../store/slices/attendanceSlice';

import { selectAuth } from '../store/slices/authSlice';

// 근태 컨텍스트 생성
const AttendanceContext = createContext(null);

// 근태 컨텍스트 훅
export const useAttendance = () => {
  const context = useContext(AttendanceContext);
  if (!context) {
    throw new Error('useAttendance must be used within an AttendanceProvider');
  }
  return context;
};

// 근태 상태 상수
export const ATTENDANCE_STATUS = {
  OFF_DUTY: 'off-duty',        // 근무 외
  CHECKED_IN: 'checked-in',    // 출근
  ON_BREAK: 'on-break',        // 휴게
  CHECKED_OUT: 'checked-out',  // 퇴근
};

// GPS 정확도 설정
const GPS_ACCURACY_THRESHOLD = 50; // 50미터 이내
const GPS_TIMEOUT = 15000; // 15초 타임아웃

// 근태 프로바이더 컴포넌트
export const AttendanceProvider = ({ children }) => {
  const dispatch = useDispatch();
  const auth = useSelector(selectAuth);

  // 로컬 상태
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gpsSupported, setGpsSupported] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [businessLocation, setBusinessLocation] = useState(null);

  // 실시간 타이머 상태
  const [timer, setTimer] = useState(null);
  const [workStartTime, setWorkStartTime] = useState(null);
  const [breakStartTime, setBreakStartTime] = useState(null);

  // GPS 지원 여부 확인
  useEffect(() => {
    if ('geolocation' in navigator) {
      setGpsSupported(true);
    } else {
      setGpsSupported(false);
      setError('이 브라우저는 GPS 기능을 지원하지 않습니다.');
    }
  }, []);

  // GPS 위치 가져오기
  const getCurrentPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!gpsSupported) {
        reject(new Error('GPS가 지원되지 않습니다.'));
        return;
      }

      const options = {
        enableHighAccuracy: true,
        timeout: GPS_TIMEOUT,
        maximumAge: 60000, // 1분 이내 캐시된 위치 사용
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now(),
          };
          setCurrentLocation(location);
          resolve(location);
        },
        (error) => {
          let errorMessage = 'GPS 위치를 가져올 수 없습니다.';

          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'GPS 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'GPS 위치 정보를 사용할 수 없습니다.';
              break;
            case error.TIMEOUT:
              errorMessage = 'GPS 위치 요청이 시간 초과되었습니다.';
              break;
            default:
              errorMessage = `GPS 오류: ${error.message}`;
              break;
          }

          setError(errorMessage);
          reject(new Error(errorMessage));
        },
        options
      );
    });
  }, [gpsSupported]);

  // 거리 계산 함수 (Haversine formula)
  const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371000; // 지구 반지름 (미터)
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // 거리(미터)
  }, []);

  // 사업장 위치 확인
  const isWithinBusinessLocation = useCallback((userLocation, businessLoc) => {
    if (!userLocation || !businessLoc) {
      return false;
    }

    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      businessLoc.latitude,
      businessLoc.longitude
    );

    return {
      isWithin: distance <= GPS_ACCURACY_THRESHOLD,
      distance: Math.round(distance),
      accuracy: userLocation.accuracy,
    };
  }, [calculateDistance]);

  // GPS 기반 체크인
  const checkInWithGPS = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 현재 위치 가져오기
      const location = await getCurrentPosition();

      // 사업장 위치와 비교 (실제로는 API에서 가져와야 함)
      if (!businessLocation) {
        throw new Error('사업장 위치 정보가 없습니다.');
      }

      const locationCheck = isWithinBusinessLocation(location, businessLocation);

      if (!locationCheck.isWithin) {
        throw new Error(
          `사업장에서 너무 멀리 있습니다. (거리: ${locationCheck.distance}m, 허용: ${GPS_ACCURACY_THRESHOLD}m)`
        );
      }

      // 실제 체크인 API 호출 (여기서는 시뮬레이션)
      console.log('GPS 체크인 성공:', {
        location,
        distance: locationCheck.distance,
        timestamp: new Date(),
      });

      // 상태 업데이트
      dispatch(setCurrentStatus(ATTENDANCE_STATUS.CHECKED_IN));
      setWorkStartTime(Date.now());

      return {
        success: true,
        data: {
          location,
          distance: locationCheck.distance,
          timestamp: Date.now(),
        },
      };

    } catch (error) {
      setError(error.message);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      setIsLoading(false);
    }
  }, [getCurrentPosition, businessLocation, isWithinBusinessLocation, dispatch]);

  // QR 코드 기반 체크인
  const checkInWithQR = useCallback(async (qrData) => {
    setIsLoading(true);
    setError(null);

    try {
      // QR 코드 검증 (실제로는 API에서 검증해야 함)
      const qrInfo = JSON.parse(qrData);

      if (!qrInfo.businessId || !qrInfo.timestamp || !qrInfo.signature) {
        throw new Error('유효하지 않은 QR 코드입니다.');
      }

      // QR 코드 만료 확인 (30초)
      const qrAge = Date.now() - qrInfo.timestamp;
      if (qrAge > 30000) {
        throw new Error('QR 코드가 만료되었습니다. 새로운 QR 코드를 요청해주세요.');
      }

      // 사업장 확인
      if (qrInfo.businessId !== auth.currentBusiness) {
        throw new Error('다른 사업장의 QR 코드입니다.');
      }

      console.log('QR 체크인 성공:', {
        qrInfo,
        timestamp: new Date(),
      });

      // 상태 업데이트
      dispatch(setCurrentStatus(ATTENDANCE_STATUS.CHECKED_IN));
      setWorkStartTime(Date.now());

      return {
        success: true,
        data: {
          qrInfo,
          timestamp: Date.now(),
        },
      };

    } catch (error) {
      setError(error.message);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      setIsLoading(false);
    }
  }, [auth.currentBusiness, dispatch]);

  // 휴게 시작
  const startBreak = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('휴게 시작:', new Date());

      dispatch(setCurrentStatus(ATTENDANCE_STATUS.ON_BREAK));
      setBreakStartTime(Date.now());

      return { success: true };

    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  // 휴게 종료
  const endBreak = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!breakStartTime) {
        throw new Error('휴게 시작 시간을 찾을 수 없습니다.');
      }

      const breakDuration = Date.now() - breakStartTime;
      console.log('휴게 종료:', {
        duration: Math.round(breakDuration / 1000 / 60),
        timestamp: new Date(),
      });

      dispatch(setCurrentStatus(ATTENDANCE_STATUS.CHECKED_IN));
      dispatch(updateBreakTime(breakDuration));
      setBreakStartTime(null);

      return { success: true };

    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  }, [breakStartTime, dispatch]);

  // 체크아웃
  const checkOut = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('체크아웃:', new Date());

      dispatch(setCurrentStatus(ATTENDANCE_STATUS.CHECKED_OUT));

      if (workStartTime) {
        const totalWorkTime = Date.now() - workStartTime;
        dispatch(updateWorkingTime(totalWorkTime));
      }

      setWorkStartTime(null);
      setBreakStartTime(null);

      return { success: true };

    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  }, [workStartTime, dispatch]);

  // 실시간 타이머 설정
  useEffect(() => {
    if (workStartTime && !timer) {
      const interval = setInterval(() => {
        const elapsed = Date.now() - workStartTime;
        dispatch(updateWorkingTime(elapsed));
      }, 1000);

      setTimer(interval);
    } else if (!workStartTime && timer) {
      clearInterval(timer);
      setTimer(null);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [workStartTime, timer, dispatch]);

  // 에러 정리
  const clearAttendanceError = useCallback(() => {
    setError(null);
    dispatch(clearError());
  }, [dispatch]);

  // 사업장 위치 설정 (실제로는 API에서 가져와야 함)
  useEffect(() => {
    if (auth.currentBusiness) {
      // 임시 사업장 위치 (강남역)
      setBusinessLocation({
        latitude: 37.498095,
        longitude: 127.027610,
      });
    }
  }, [auth.currentBusiness]);

  // 컨텍스트 값 정의
  const contextValue = {
    // 상태
    isLoading,
    error,
    gpsSupported,
    currentLocation,
    businessLocation,
    workStartTime,
    breakStartTime,

    // 액션
    checkInWithGPS,
    checkInWithQR,
    startBreak,
    endBreak,
    checkOut,
    getCurrentPosition,
    clearError: clearAttendanceError,

    // 유틸리티
    isWithinBusinessLocation,
    calculateDistance,

    // 상수
    ATTENDANCE_STATUS,
    GPS_ACCURACY_THRESHOLD,
  };

  return (
    <AttendanceContext.Provider value={contextValue}>
      {children}
    </AttendanceContext.Provider>
  );
};

export default AttendanceContext;