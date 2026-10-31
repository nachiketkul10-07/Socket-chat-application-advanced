import React from 'react';
import { GroupMember } from '../types';

interface GroupMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  members: GroupMember[];
  currentUserId: string;
  isCreator: boolean;
  onRemoveMember: (userId: string) => void;
  onLeaveGroup: () => void;
}

export const GroupMembersModal: React.FC<GroupMembersModalProps> = ({
  isOpen,
  onClose,
  groupName,
  members,
  currentUserId,
  isCreator,
  onRemoveMember,
  onLeaveGroup,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Members of "{groupName}"</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="members-list">
          {members.map((member) => (
            <div key={member.id} className="member-item">
              <div className="member-avatar">
                {member.username.charAt(0).toUpperCase()}
              </div>
              <div className="member-info">
                <span className="member-name">{member.username}</span>
                {member.isCreator && <span className="creator-badge">Creator</span>}
                <span className={`status-dot ${member.isOnline ? 'online' : 'offline'}`} />
              </div>
              {isCreator && member.id !== currentUserId && (
                <button
                  className="btn-danger-sm"
                  onClick={() => onRemoveMember(member.id)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              if (window.confirm('Are you sure you want to leave this group?')) {
                onLeaveGroup();
                onClose();
              }
            }}
          >
            Leave Group
          </button>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};