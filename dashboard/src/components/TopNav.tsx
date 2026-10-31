import React from 'react';
import { User } from '../types';

interface TopNavProps {
  currentUser: User | null;
  isConnected: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onLogout: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentUser,
  isConnected,
  searchQuery,
  onSearchChange,
  onLogout,
}) => {
  return (
    <div className="top-nav">
      <div className="nav-left">
        <h1>Socket Chat Dashboard</h1>
        <span className={`connection-badge ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '🟢 Online' : '🔴 Reconnecting...'}
        </span>
      </div>
      <div className="nav-center">
        <input
          type="text"
          placeholder="Global Search (conversations, messages, users)..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="global-search"
        />
      </div>
      <div className="nav-right">
        {currentUser && (
          <div className="user-profile">
            <span className="user-avatar-small">
              {currentUser.username.charAt(0).toUpperCase()}
            </span>
            <span className="user-name">{currentUser.username}</span>
            <button className="logout-btn" onClick={onLogout} title="Switch User / Logout">
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};