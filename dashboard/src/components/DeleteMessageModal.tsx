import React from 'react';
import { Message, User } from '../types';

interface DeleteMessageModalProps {
  isOpen: boolean;
  message: Message | null;
  currentUser: User | null;
  onClose: () => void;
  onDeleteForMe: (message: Message) => void;
  onDeleteForEveryone: (message: Message) => void;
}

export const DeleteMessageModal: React.FC<DeleteMessageModalProps> = ({
  isOpen,
  message,
  currentUser,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone
}) => {
  if (!isOpen || !message) return null;

  const isOwn = (message.fromUserId || message.senderId) === currentUser?.id;
  const isCollabCreator = message.fillable?.creatorId === currentUser?.id;
  const canDeleteForEveryone = isOwn || isCollabCreator;

  const previewSnippet = message.kind === 'collaborative_fillin' || message.fillable
    ? `📋 Live Collaborative Message (${message.fillable?.introText || 'Interactive Form'})`
    : (message.text || message.content || 'Message');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content delete-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="delete-modal-header">
          <div className="delete-modal-icon">🗑️</div>
          <div className="delete-modal-title-wrap">
            <h3>Delete Message</h3>
            <p className="delete-modal-subtitle">Choose how you want to delete this message</p>
          </div>
          <button className="btn-close-modal" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="delete-preview-box">
          <span className="delete-preview-label">Selected Message:</span>
          <div className="delete-preview-text">
            "{previewSnippet.length > 100 ? previewSnippet.slice(0, 97) + '...' : previewSnippet}"
          </div>
        </div>

        <div className="delete-options-list">
          <button
            type="button"
            className="delete-option-btn btn-delete-for-me"
            onClick={() => {
              onDeleteForMe(message);
              onClose();
            }}
          >
            <div className="delete-btn-icon">👤</div>
            <div className="delete-btn-text">
              <span className="btn-title">Delete for Me</span>
              <span className="btn-desc">Removes this message from your screen only. Others can still see it.</span>
            </div>
          </button>

          {canDeleteForEveryone ? (
            <button
              type="button"
              className="delete-option-btn btn-delete-for-everyone"
              onClick={() => {
                onDeleteForEveryone(message);
                onClose();
              }}
            >
              <div className="delete-btn-icon">👥</div>
              <div className="delete-btn-text">
                <span className="btn-title">Delete for Everyone</span>
                <span className="btn-desc">Permanently deletes this message for all participants in this chat.</span>
              </div>
            </button>
          ) : (
            <div className="delete-disabled-notice">
              <span>ℹ️ Only the sender of this message can "Delete for Everyone"</span>
            </div>
          )}
        </div>

        <div className="delete-modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

