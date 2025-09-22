# 🧩 [컴포넌트 이름]

> [컴포넌트의 목적과 기능을 한 줄로 설명]

---
상태: 작성중 | 완료 | 검토필요
최종수정: YYYY-MM-DD
작성자: [작성자 이름]
컴포넌트 타입: atom | molecule | organism
---

## 📋 목차
- [개요](#개요)
- [Props](#props)
- [사용법](#사용법)
- [스타일링](#스타일링)
- [접근성](#접근성)
- [테스트](#테스트)
- [관련 컴포넌트](#관련-컴포넌트)

## 개요

### 컴포넌트 정보
- **위치**: `frontend/src/components/[path]/[ComponentName].jsx`
- **카테고리**: [UI 카테고리]
- **의존성**: [필요한 라이브러리]
- **브라우저 지원**: Chrome, Firefox, Safari, Edge

### 사용 시나리오
- [언제 이 컴포넌트를 사용하는지]
- [주요 사용 사례]

## Props

### Props 테이블
| Prop 이름 | 타입 | 필수 | 기본값 | 설명 |
|----------|------|------|-------|------|
| children | ReactNode | ❌ | null | 자식 요소 |
| className | string | ❌ | '' | CSS 클래스명 |
| onClick | function | ❌ | undefined | 클릭 이벤트 핸들러 |
| disabled | boolean | ❌ | false | 비활성화 상태 |
| variant | 'primary' \| 'secondary' | ❌ | 'primary' | 스타일 변형 |

### TypeScript 타입 정의
```typescript
interface ComponentProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: (event: React.MouseEvent) => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}
```

## 사용법

### 기본 사용법
```jsx
import { ComponentName } from '@/components/ComponentName';

function App() {
  return (
    <ComponentName>
      기본 사용 예제
    </ComponentName>
  );
}
```

### 고급 사용법
```jsx
import { ComponentName } from '@/components/ComponentName';

function App() {
  const handleClick = () => {
    console.log('클릭됨');
  };

  return (
    <ComponentName
      variant="secondary"
      onClick={handleClick}
      className="custom-class"
    >
      고급 사용 예제
    </ComponentName>
  );
}
```

### 상태별 예제
```jsx
// 기본 상태
<ComponentName>기본</ComponentName>

// 비활성화 상태
<ComponentName disabled>비활성화</ComponentName>

// 로딩 상태
<ComponentName loading>로딩중...</ComponentName>

// 에러 상태
<ComponentName error>에러 발생</ComponentName>
```

## 스타일링

### CSS 클래스
```css
.component-name {
  /* 기본 스타일 */
  padding: 8px 16px;
  border-radius: 4px;
}

.component-name--primary {
  /* Primary 변형 */
  background-color: var(--primary-color);
  color: white;
}

.component-name--secondary {
  /* Secondary 변형 */
  background-color: var(--secondary-color);
  color: var(--text-color);
}

.component-name--disabled {
  /* 비활성화 상태 */
  opacity: 0.5;
  cursor: not-allowed;
}
```

### 테마 커스터마이징
```jsx
// Material-UI 테마 오버라이드
const theme = createTheme({
  components: {
    MuiComponentName: {
      styleOverrides: {
        root: {
          // 루트 스타일 오버라이드
        },
      },
    },
  },
});
```

### 반응형 디자인
```css
/* 모바일 (< 768px) */
@media (max-width: 767px) {
  .component-name {
    padding: 6px 12px;
    font-size: 14px;
  }
}

/* 태블릿 (768px - 1024px) */
@media (min-width: 768px) and (max-width: 1024px) {
  .component-name {
    padding: 8px 16px;
    font-size: 16px;
  }
}

/* 데스크톱 (> 1024px) */
@media (min-width: 1025px) {
  .component-name {
    padding: 10px 20px;
    font-size: 16px;
  }
}
```

## 접근성

### ARIA 속성
```jsx
<ComponentName
  role="button"
  aria-label="설명 텍스트"
  aria-pressed={isPressed}
  aria-disabled={disabled}
  tabIndex={0}
>
  접근 가능한 컴포넌트
</ComponentName>
```

### 키보드 네비게이션
- `Tab`: 포커스 이동
- `Enter`: 동작 실행
- `Space`: 선택/해제
- `Esc`: 취소/닫기

### 스크린 리더 지원
- 적절한 ARIA 라벨 제공
- 상태 변경 시 알림
- 의미 있는 텍스트 대체

## 테스트

### 단위 테스트
```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentName } from './ComponentName';

describe('ComponentName', () => {
  it('renders children correctly', () => {
    render(<ComponentName>테스트 텍스트</ComponentName>);
    expect(screen.getByText('테스트 텍스트')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<ComponentName onClick={handleClick}>클릭</ComponentName>);

    fireEvent.click(screen.getByText('클릭'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies disabled state', () => {
    render(<ComponentName disabled>비활성화</ComponentName>);
    expect(screen.getByText('비활성화')).toHaveAttribute('disabled');
  });
});
```

### 스토리북
```javascript
// ComponentName.stories.js
export default {
  title: 'Components/ComponentName',
  component: ComponentName,
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary'],
    },
  },
};

export const Default = {
  args: {
    children: '기본 버튼',
  },
};

export const Secondary = {
  args: {
    children: 'Secondary 버튼',
    variant: 'secondary',
  },
};

export const Disabled = {
  args: {
    children: '비활성화 버튼',
    disabled: true,
  },
};
```

## 관련 컴포넌트
- [Button](./Button.md) - 기본 버튼 컴포넌트
- [IconButton](./IconButton.md) - 아이콘 버튼
- [ButtonGroup](./ButtonGroup.md) - 버튼 그룹

## 변경 이력
| 버전 | 날짜 | 변경사항 |
|------|------|---------|
| 1.0.0 | YYYY-MM-DD | 최초 릴리즈 |
| 1.1.0 | YYYY-MM-DD | variant prop 추가 |
| 1.2.0 | YYYY-MM-DD | 접근성 개선 |

## 주의사항
- ⚠️ [중요한 주의사항]
- 💡 [유용한 팁]
- 📝 [추가 정보]

---

*이 문서는 DOT Platform 컴포넌트의 표준 템플릿입니다.*