/**
 * 접근 가능한 네비게이션 컴포넌트
 * WCAG 2.1 AA 준수 네비게이션 구현
 *
 * 주요 기능:
 * - 키보드 네비게이션
 * - 스크린 리더 지원
 * - 현재 페이지 표시
 * - 건너뛰기 링크
 * - 계층적 메뉴
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  useKeyboardNavigation,
  SkipToContent,
  announceToScreenReader,
  Landmarks
} from '../../utils/accessibility';
import '../../styles/accessibility.css';

/**
 * 메인 네비게이션 컴포넌트
 */
export function MainNavigation({
  brand,
  menuItems = [],
  currentPath = '',
  onMenuToggle,
  isMenuOpen = false
}) {
  const navRef = useRef(null);
  const { handleKeyDown } = useKeyboardNavigation();
  const [focusedIndex, setFocusedIndex] = useState(0);

  // 키보드 네비게이션
  const handleNavigationKey = (event) => {
    handleKeyDown(event, {
      onArrowRight: () => {
        const nextIndex = focusedIndex < menuItems.length - 1 ? focusedIndex + 1 : 0;
        setFocusedIndex(nextIndex);
        focusMenuItem(nextIndex);
      },
      onArrowLeft: () => {
        const prevIndex = focusedIndex > 0 ? focusedIndex - 1 : menuItems.length - 1;
        setFocusedIndex(prevIndex);
        focusMenuItem(prevIndex);
      },
      onHome: () => {
        setFocusedIndex(0);
        focusMenuItem(0);
      },
      onEnd: () => {
        setFocusedIndex(menuItems.length - 1);
        focusMenuItem(menuItems.length - 1);
      }
    });
  };

  // 메뉴 항목에 포커스 설정
  const focusMenuItem = (index) => {
    const menuItem = navRef.current?.querySelector(`[data-menu-index="${index}"]`);
    if (menuItem) {
      menuItem.focus();
    }
  };

  // 현재 페이지 확인
  const isCurrentPage = (path) => currentPath === path;

  return (
    <header role={Landmarks.banner}>
      <SkipToContent />

      <nav
        ref={navRef}
        role={Landmarks.navigation}
        aria-label="주 네비게이션"
        onKeyDown={handleNavigationKey}
      >
        <div className="navbar">
          {/* 브랜드/로고 */}
          <div className="navbar-brand">
            <a href="/" className="brand-link" aria-label="홈으로 이동">
              {brand}
            </a>
          </div>

          {/* 모바일 메뉴 토글 */}
          <button
            className="navbar-toggle"
            onClick={onMenuToggle}
            aria-expanded={isMenuOpen}
            aria-controls="main-menu"
            aria-label={isMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            type="button"
          >
            <span className="hamburger" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>

          {/* 메뉴 아이템들 */}
          <ul
            id="main-menu"
            className={`navbar-menu ${isMenuOpen ? 'is-open' : ''}`}
            role="menubar"
            aria-hidden={!isMenuOpen}
          >
            {menuItems.map((item, index) => (
              <li key={item.path} role="none">
                <a
                  href={item.path}
                  className="navbar-item"
                  role="menuitem"
                  tabIndex={index === focusedIndex ? 0 : -1}
                  data-menu-index={index}
                  aria-current={isCurrentPage(item.path) ? 'page' : undefined}
                  onFocus={() => setFocusedIndex(index)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  );
}

/**
 * 사이드바 네비게이션 컴포넌트
 */
export function SidebarNavigation({
  title,
  menuItems = [],
  currentPath = '',
  isCollapsed = false,
  onToggle
}) {
  const [expandedItems, setExpandedItems] = useState(new Set());
  const { handleKeyDown } = useKeyboardNavigation();

  // 하위 메뉴 토글
  const toggleSubmenu = (itemId) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
      announceToScreenReader(`${itemId} 하위 메뉴가 접혔습니다`);
    } else {
      newExpanded.add(itemId);
      announceToScreenReader(`${itemId} 하위 메뉴가 펼쳐졌습니다`);
    }
    setExpandedItems(newExpanded);
  };

  // 키보드 이벤트 처리
  const handleSubmenuKey = (event, itemId) => {
    handleKeyDown(event, {
      onSelect: () => toggleSubmenu(itemId),
      onArrowRight: () => {
        if (!expandedItems.has(itemId)) {
          toggleSubmenu(itemId);
        }
      },
      onArrowLeft: () => {
        if (expandedItems.has(itemId)) {
          toggleSubmenu(itemId);
        }
      }
    });
  };

  const renderMenuItem = (item, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);
    const isCurrent = currentPath === item.path;

    return (
      <li key={item.id} role="none">
        {hasChildren ? (
          <button
            className={`sidebar-item sidebar-parent level-${level} ${isCurrent ? 'current' : ''}`}
            onClick={() => toggleSubmenu(item.id)}
            onKeyDown={(e) => handleSubmenuKey(e, item.id)}
            aria-expanded={isExpanded}
            aria-controls={`submenu-${item.id}`}
            aria-current={isCurrent ? 'page' : undefined}
          >
            <span className="item-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="item-text">
              {item.label}
            </span>
            <span
              className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
              aria-hidden="true"
            >
              ▶
            </span>
          </button>
        ) : (
          <a
            href={item.path}
            className={`sidebar-item level-${level} ${isCurrent ? 'current' : ''}`}
            aria-current={isCurrent ? 'page' : undefined}
          >
            <span className="item-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="item-text">
              {item.label}
            </span>
          </a>
        )}

        {/* 하위 메뉴 */}
        {hasChildren && (
          <ul
            id={`submenu-${item.id}`}
            className={`sidebar-submenu ${isExpanded ? 'expanded' : 'collapsed'}`}
            role="group"
            aria-labelledby={item.id}
            hidden={!isExpanded}
          >
            {item.children.map(child => renderMenuItem(child, level + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside
      className={`sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`}
      role={Landmarks.navigation}
      aria-label="사이드바 네비게이션"
    >
      {/* 사이드바 헤더 */}
      <div className="sidebar-header">
        <h2 className="sidebar-title">
          {!isCollapsed && title}
        </h2>
        <button
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-expanded={!isCollapsed}
          type="button"
        >
          <span className="toggle-icon" aria-hidden="true">
            {isCollapsed ? '▶' : '◀'}
          </span>
        </button>
      </div>

      {/* 사이드바 메뉴 */}
      <nav className="sidebar-nav">
        <ul className="sidebar-menu" role="tree" aria-label={title}>
          {menuItems.map(item => renderMenuItem(item))}
        </ul>
      </nav>
    </aside>
  );
}

/**
 * 브레드크럼 네비게이션 컴포넌트
 */
export function BreadcrumbNavigation({
  items = [],
  separator = '/',
  ariaLabel = '현재 위치'
}) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label={ariaLabel} className="breadcrumb-nav">
      <ol className="breadcrumb">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li
              key={item.path || index}
              className="breadcrumb-item"
              aria-current={isLast ? 'page' : undefined}
            >
              {isLast ? (
                <span className="breadcrumb-current">
                  {item.label}
                </span>
              ) : (
                <>
                  <a
                    href={item.path}
                    className="breadcrumb-link"
                  >
                    {item.label}
                  </a>
                  <span
                    className="breadcrumb-separator"
                    aria-hidden="true"
                  >
                    {separator}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * 탭 네비게이션 컴포넌트
 */
export function TabNavigation({
  tabs = [],
  activeTab,
  onTabChange,
  orientation = 'horizontal'
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const { handleKeyDown } = useKeyboardNavigation();

  // 활성 탭 인덱스 찾기
  const activeIndex = tabs.findIndex(tab => tab.id === activeTab);

  // 키보드 네비게이션
  const handleTabKey = (event, index) => {
    const isHorizontal = orientation === 'horizontal';

    handleKeyDown(event, {
      onArrowRight: isHorizontal ? () => moveToTab(index + 1) : undefined,
      onArrowLeft: isHorizontal ? () => moveToTab(index - 1) : undefined,
      onArrowDown: !isHorizontal ? () => moveToTab(index + 1) : undefined,
      onArrowUp: !isHorizontal ? () => moveToTab(index - 1) : undefined,
      onHome: () => moveToTab(0),
      onEnd: () => moveToTab(tabs.length - 1),
      onSelect: () => selectTab(tabs[index])
    });
  };

  // 탭 이동
  const moveToTab = (newIndex) => {
    if (newIndex < 0) newIndex = tabs.length - 1;
    if (newIndex >= tabs.length) newIndex = 0;

    setFocusedIndex(newIndex);

    // 해당 탭에 포커스
    const tabElement = document.querySelector(`[data-tab-index="${newIndex}"]`);
    if (tabElement) {
      tabElement.focus();
    }
  };

  // 탭 선택
  const selectTab = (tab) => {
    onTabChange(tab.id);
    announceToScreenReader(`${tab.label} 탭이 선택되었습니다`);
  };

  return (
    <div className={`tab-navigation ${orientation}`}>
      {/* 탭 목록 */}
      <div
        className="tab-list"
        role="tablist"
        aria-orientation={orientation}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            data-tab-index={index}
            onClick={() => selectTab(tab)}
            onKeyDown={(e) => handleTabKey(e, index)}
            onFocus={() => setFocusedIndex(index)}
            disabled={tab.disabled}
          >
            {tab.icon && (
              <span className="tab-icon" aria-hidden="true">
                {tab.icon}
              </span>
            )}
            <span className="tab-label">
              {tab.label}
            </span>
            {tab.badge && (
              <span className="tab-badge" aria-label={`${tab.badge}개 알림`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 패널 */}
      <div className="tab-panels">
        {tabs.map(tab => (
          <div
            key={tab.id}
            id={`panel-${tab.id}`}
            className={`tab-panel ${activeTab === tab.id ? 'active' : 'hidden'}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            hidden={activeTab !== tab.id}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MainNavigation;