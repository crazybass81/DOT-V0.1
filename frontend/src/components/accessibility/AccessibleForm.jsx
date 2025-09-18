/**
 * 접근 가능한 폼 컴포넌트
 * WCAG 2.1 AA 준수 폼 구현
 *
 * 주요 기능:
 * - 라벨과 입력 필드 연결
 * - 에러 메시지 접근성
 * - 키보드 네비게이션
 * - 스크린 리더 지원
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  AccessibleError,
  useKeyboardNavigation,
  announceToScreenReader
} from '../../utils/accessibility';
import '../../styles/accessibility.css';

/**
 * 접근 가능한 입력 필드
 */
export function AccessibleInput({
  id,
  label,
  type = 'text',
  required = false,
  error,
  helpText,
  value,
  onChange,
  onBlur,
  ...props
}) {
  const inputRef = useRef(null);
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  // ARIA 속성 구성
  const ariaProps = {
    'aria-required': required,
    'aria-invalid': error ? 'true' : 'false',
    'aria-describedby': [
      error && errorId,
      helpText && helpId
    ].filter(Boolean).join(' ') || undefined
  };

  return (
    <div className="form-field">
      <label htmlFor={id} className={required ? 'required' : ''}>
        {label}
      </label>

      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        {...ariaProps}
        {...props}
      />

      {helpText && (
        <div id={helpId} className="help-text">
          {helpText}
        </div>
      )}

      {error && (
        <AccessibleError id={errorId} error={error} />
      )}
    </div>
  );
}

/**
 * 접근 가능한 선택 박스
 */
export function AccessibleSelect({
  id,
  label,
  options = [],
  required = false,
  error,
  helpText,
  value,
  onChange,
  ...props
}) {
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  const ariaProps = {
    'aria-required': required,
    'aria-invalid': error ? 'true' : 'false',
    'aria-describedby': [
      error && errorId,
      helpText && helpId
    ].filter(Boolean).join(' ') || undefined
  };

  return (
    <div className="form-field">
      <label htmlFor={id} className={required ? 'required' : ''}>
        {label}
      </label>

      <select
        id={id}
        value={value}
        onChange={onChange}
        {...ariaProps}
        {...props}
      >
        <option value="">선택하세요</option>
        {options.map(option => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>

      {helpText && (
        <div id={helpId} className="help-text">
          {helpText}
        </div>
      )}

      {error && (
        <AccessibleError id={errorId} error={error} />
      )}
    </div>
  );
}

/**
 * 접근 가능한 체크박스 그룹
 */
export function AccessibleCheckboxGroup({
  legend,
  options = [],
  values = [],
  onChange,
  error,
  required = false
}) {
  const { handleKeyDown } = useKeyboardNavigation();
  const errorId = `checkbox-group-error`;

  const handleCheckboxChange = (value, checked) => {
    if (checked) {
      onChange([...values, value]);
    } else {
      onChange(values.filter(v => v !== value));
    }
  };

  const handleKeyPress = (event, value) => {
    handleKeyDown(event, {
      onSelect: () => {
        const isChecked = values.includes(value);
        handleCheckboxChange(value, !isChecked);
      }
    });
  };

  return (
    <fieldset
      aria-required={required}
      aria-invalid={error ? 'true' : 'false'}
      aria-describedby={error ? errorId : undefined}
    >
      <legend>{legend}</legend>

      {options.map(option => (
        <div key={option.value} className="checkbox-wrapper">
          <input
            type="checkbox"
            id={`checkbox-${option.value}`}
            value={option.value}
            checked={values.includes(option.value)}
            onChange={(e) => handleCheckboxChange(option.value, e.target.checked)}
            onKeyDown={(e) => handleKeyPress(e, option.value)}
            disabled={option.disabled}
            aria-describedby={option.description ? `desc-${option.value}` : undefined}
          />
          <label htmlFor={`checkbox-${option.value}`}>
            {option.label}
          </label>
          {option.description && (
            <span id={`desc-${option.value}`} className="help-text">
              {option.description}
            </span>
          )}
        </div>
      ))}

      {error && (
        <AccessibleError id={errorId} error={error} />
      )}
    </fieldset>
  );
}

/**
 * 접근 가능한 라디오 버튼 그룹
 */
export function AccessibleRadioGroup({
  name,
  legend,
  options = [],
  value,
  onChange,
  error,
  required = false
}) {
  const { handleKeyDown } = useKeyboardNavigation();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const errorId = `radio-group-error`;

  // 키보드 네비게이션
  useEffect(() => {
    const handleArrowKeys = (event) => {
      if (!event.target.closest('fieldset')) return;

      handleKeyDown(event, {
        onArrowUp: () => {
          const newIndex = focusedIndex > 0 ? focusedIndex - 1 : options.length - 1;
          setFocusedIndex(newIndex);
          onChange(options[newIndex].value);
        },
        onArrowDown: () => {
          const newIndex = focusedIndex < options.length - 1 ? focusedIndex + 1 : 0;
          setFocusedIndex(newIndex);
          onChange(options[newIndex].value);
        },
        onHome: () => {
          setFocusedIndex(0);
          onChange(options[0].value);
        },
        onEnd: () => {
          setFocusedIndex(options.length - 1);
          onChange(options[options.length - 1].value);
        }
      });
    };

    document.addEventListener('keydown', handleArrowKeys);
    return () => document.removeEventListener('keydown', handleArrowKeys);
  }, [focusedIndex, options, onChange, handleKeyDown]);

  return (
    <fieldset
      role="radiogroup"
      aria-required={required}
      aria-invalid={error ? 'true' : 'false'}
      aria-describedby={error ? errorId : undefined}
    >
      <legend>{legend}</legend>

      {options.map((option, index) => (
        <div key={option.value} className="radio-wrapper">
          <input
            type="radio"
            id={`radio-${option.value}`}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            disabled={option.disabled}
            tabIndex={index === focusedIndex ? 0 : -1}
            aria-describedby={option.description ? `desc-${option.value}` : undefined}
          />
          <label htmlFor={`radio-${option.value}`}>
            {option.label}
          </label>
          {option.description && (
            <span id={`desc-${option.value}`} className="help-text">
              {option.description}
            </span>
          )}
        </div>
      ))}

      {error && (
        <AccessibleError id={errorId} error={error} />
      )}
    </fieldset>
  );
}

/**
 * 접근 가능한 텍스트 영역
 */
export function AccessibleTextarea({
  id,
  label,
  required = false,
  error,
  helpText,
  maxLength,
  value,
  onChange,
  rows = 4,
  ...props
}) {
  const [charCount, setCharCount] = useState(value?.length || 0);
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const countId = `${id}-count`;

  const handleChange = (e) => {
    setCharCount(e.target.value.length);
    onChange(e);
  };

  const ariaProps = {
    'aria-required': required,
    'aria-invalid': error ? 'true' : 'false',
    'aria-describedby': [
      error && errorId,
      helpText && helpId,
      maxLength && countId
    ].filter(Boolean).join(' ') || undefined
  };

  return (
    <div className="form-field">
      <label htmlFor={id} className={required ? 'required' : ''}>
        {label}
      </label>

      <textarea
        id={id}
        value={value}
        onChange={handleChange}
        rows={rows}
        maxLength={maxLength}
        {...ariaProps}
        {...props}
      />

      {maxLength && (
        <div id={countId} className="char-count" aria-live="polite">
          {charCount} / {maxLength} 글자
        </div>
      )}

      {helpText && (
        <div id={helpId} className="help-text">
          {helpText}
        </div>
      )}

      {error && (
        <AccessibleError id={errorId} error={error} />
      )}
    </div>
  );
}

/**
 * 접근 가능한 폼 컴포넌트
 */
export function AccessibleForm({
  children,
  onSubmit,
  title,
  description,
  submitLabel = '제출',
  cancelLabel = '취소',
  onCancel,
  isLoading = false
}) {
  const formRef = useRef(null);
  const { handleKeyDown } = useKeyboardNavigation();

  // 폼 제출 처리
  const handleSubmit = async (e) => {
    e.preventDefault();

    // 스크린 리더에 알림
    announceToScreenReader('폼을 제출하는 중입니다...');

    try {
      await onSubmit(e);
      announceToScreenReader('폼이 성공적으로 제출되었습니다.');
    } catch (error) {
      announceToScreenReader('폼 제출 중 오류가 발생했습니다. 입력 내용을 확인해주세요.');
    }
  };

  // ESC 키로 취소
  useEffect(() => {
    const handleEscape = (e) => {
      handleKeyDown(e, {
        onEscape: () => {
          if (onCancel) onCancel();
        }
      });
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleKeyDown, onCancel]);

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={title ? 'form-title' : undefined}
      aria-describedby={description ? 'form-description' : undefined}
    >
      {title && (
        <h2 id="form-title">{title}</h2>
      )}

      {description && (
        <p id="form-description" className="form-description">
          {description}
        </p>
      )}

      {children}

      <div className="form-actions">
        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? '처리 중...' : submitLabel}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
        )}
      </div>
    </form>
  );
}

export default AccessibleForm;