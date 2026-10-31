import React from 'react';
import { User, getAvatarGradient } from '../types';

interface TopNavProps {
  currentUser: User | null;
  isConnected: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onLogout: () => void;
  isRightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
  unreadNotificationsCount?: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentUser,
  isConnected,
  searchQuery,
  onSearchChange,
  onLogout,
  isRightPanelOpen = true,
  onToggleRightPanel,
  unreadNotificationsCount = 0,
}) => {
  const avatarStyle = currentUser ? getAvatarGradient(currentUser.username) : null;

  return (
    <header className="top-nav">
      <div className="nav-left">
        <div className="brand-logo">
          <div className="brand-icon">💬</div>
          <div className="brand-text">
            <span className="brand-title">SocketChat</span>
            <span className="brand-badge">PRO</span>
          </div>
        </div>
        <div className={`connection-badge ${isConnected ? 'connected' : 'disconnected'}`}>
          <span className={`status-dot ${isConnected ? 'dot-online' : 'dot-offline'}`}></span>
          <span className="status-label">{isConnected ? 'Engine Online' : 'Reconnecting...'}</span>
        </div>
      </div>

      <div className="nav-center">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search messages, channels, participants..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="global-search"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => onSearchChange('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="nav-right">
        {onToggleRightPanel && (
          <button
            type="button"
            className={`panel-toggle-btn ${isRightPanelOpen ? 'active' : ''}`}
            onClick={onToggleRightPanel}
            title={isRightPanelOpen ? 'Hide Activity Panel' : 'Show Activity Panel'}
            aria-label="Toggle Activity Panel"
          >
            <span className="panel-toggle-icon">🔔</span>
            <span className="panel-toggle-text">Activity</span>
            {unreadNotificationsCount > 0 && (
              <span className="panel-toggle-badge">{unreadNotificationsCount}</span>
            )}
          </button>
        )}

        {currentUser && (
          <div className="user-profile">
            <div
              className="user-avatar-small"
              style={{
                background: avatarStyle?.bg || '#4f46e5',
                boxShadow: `0 0 10px ${avatarStyle?.glow || 'rgba(79, 70, 229, 0.4)'}`,
                border: `1.5px solid ${avatarStyle?.border || 'rgba(255,255,255,0.2)'}`
              }}
            >
              {currentUser.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-details-compact">
              <span className="user-name">{currentUser.username}</span>
              <span className="user-sub">Active Now</span>
            </div>
            <button className="logout-btn" onClick={onLogout} title="Switch User or Logout">
              <span className="logout-icon">🚪</span>
              <span className="logout-text">Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
