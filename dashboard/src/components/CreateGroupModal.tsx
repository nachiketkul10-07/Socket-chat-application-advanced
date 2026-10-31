import React, { useState } from 'react';
import { User } from '../types';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableUsers: User[];
  currentUserId: string;
  onCreateGroup: (name: string, memberIds: string[]) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  availableUsers,
  currentUserId,
  onCreateGroup,
}) => {
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const otherUsers = availableUsers.filter((u) => u.id !== currentUserId);
  const filteredUsers = otherUsers.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }
    setError('');
    onCreateGroup(groupName.trim(), selectedUserIds);
    setGroupName('');
    setSelectedUserIds([]);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Group</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          {error && <div className="modal-error">{error}</div>}
          <div className="form-group">
            <label htmlFor="groupName">Group Name</label>
            <input
              id="groupName"
              type="text"
              placeholder="e.g. Project Developers"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Add Members ({selectedUserIds.length} selected)</label>
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="user-search-input"
            />
            <div className="user-selection-list">
              {filteredUsers.length === 0 ? (
                <div className="empty-users">No users found</div>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedUserIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      className={`user-selection-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleUser(user.id)}
                    >
                      <div className="user-avatar">{user.username.charAt(0).toUpperCase()}</div>
                      <div className="user-name">{user.username}</div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create Group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};