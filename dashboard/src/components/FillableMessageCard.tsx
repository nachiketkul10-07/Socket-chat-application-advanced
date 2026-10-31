import React, { useState } from 'react';
import { Message, User, FillableRevision, FillableFieldDetail } from '../types';
import { FillableMessageHistoryModal } from './FillableMessageHistoryModal';
import { MessageContextMenu, ContextMenuAction } from './MessageContextMenu';
import { AppendDetailModal } from './AppendDetailModal';
import { EditDetailModal } from './EditDetailModal';
import { wsService } from '../websocket';

interface FillableMessageCardProps {
  message: Message;
  currentUser: User;
  users: Map<string, User>;
}

export const FillableMessageCard: React.FC<FillableMessageCardProps> = ({
  message,
  currentUser,
  users
}) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyRevisions, setHistoryRevisions] = useState<FillableRevision[]>([]);
  const [isAppendOpen, setIsAppendOpen] = useState(false);
  const [editField, setEditField] = useState<FillableFieldDetail | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const payload = message.fillable;
  if (!payload) return null;

  const isCreator = payload.creatorId === currentUser.id;
  const isOwn = (message.fromUserId || message.senderId) === currentUser.id;
  const isFinalized = payload.status === 'finalized';
  const isExpired = payload.status === 'expired';
  const isLocked = isFinalized || isExpired;

  const creatorUser = users.get(payload.creatorId) || { username: payload.creatorUsername || 'User' };

  const formatTs = (ts?: number | null) => {
    if (!ts) return '';
    const date = new Date(ts * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleOpenHistory = () => {
    wsService.send({
      type: 'fetch_fillable_history',
      messageId: payload.messageId
    });

    const unsub = wsService.onMessage((serverMsg) => {
      if (serverMsg.type === 'fillable_history' && serverMsg.messageId === payload.messageId) {
        setHistoryRevisions(serverMsg.revisions || []);
        setIsHistoryOpen(true);
        unsub();
      }
    });

    setTimeout(() => {
      setIsHistoryOpen(true);
    }, 150);
  };

  const handleToggleLock = () => {
    if (isFinalized) {
      wsService.send({
        type: 'reopen_fillable_message',
        messageId: payload.messageId
      });
    } else {
      wsService.send({
        type: 'finalize_fillable_message',
        messageId: payload.messageId
      });
    }
  };

  const handleCopyText = () => {
    let copyText = payload.introText || '';
    if (payload.fields && payload.fields.length > 0) {
      copyText += '\n' + payload.fields
        .filter(f => f.currentValue !== null && f.currentValue !== undefined)
        .map(f => `• ${f.label !== 'Detail' ? f.label + ': ' : ''}${f.currentValue}`)
        .join('\n');
    }
    navigator.clipboard?.writeText(copyText);
  };

  // Find if current user has an own contribution
  const myOwnField = payload.fields?.find(f => f.isOwnContribution || (f.lastEditorId === currentUser.id));

  // Build WhatsApp-style Context Menu Actions
  const menuActions: ContextMenuAction[] = [];

  if (!isLocked) {
    menuActions.push({
      label: 'Append Details',
      icon: '➕',
      onClick: () => setIsAppendOpen(true)
    });
  }

  if (myOwnField && !isLocked) {
    menuActions.push({
      label: 'Edit My Contribution',
      icon: '✏️',
      onClick: () => setEditField(myOwnField)
    });
  }

  if (isCreator) {
    menuActions.push({
      label: isFinalized ? 'Unlock Message' : 'Lock Message',
      icon: isFinalized ? '🔓' : '🔒',
      onClick: handleToggleLock
    });

    menuActions.push({
      label: 'Contributor Audit (Full)',
      icon: '🕒',
      onClick: handleOpenHistory
    });
  }

  menuActions.push({
    label: 'Copy Message',
    icon: '📋',
    onClick: handleCopyText
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const completedFields = payload.fields?.filter(
    f => f.currentValue !== null && f.currentValue !== undefined && String(f.currentValue).trim() !== ''
  ) || [];

  return (
    <div className={`message ${isOwn ? 'own' : 'other'} collaborative-message-row`}>
      {!isOwn && (
        <div className="message-avatar">
          {creatorUser.username?.charAt(0).toUpperCase() || '?'}
        </div>
      )}

      <div className="message-content">
        {!isOwn && (
          <div className="message-sender">{creatorUser.username || 'User'}</div>
        )}

        <div
          className={`message-bubble collaborative-bubble ${isLocked ? 'bubble-locked' : ''}`}
          onContextMenu={handleContextMenu}
          title="Right-click for options"
        >
          {/* Main message text */}
          <div className="collab-bubble-intro">
            {payload.introText || message.text || 'Collaborative Message'}
          </div>

          {/* Appended details list */}
          {completedFields.length > 0 && (
            <div className="collab-bubble-details">
              {completedFields.map((field) => {
                const labelText = field.label && field.label !== 'Detail' ? `${field.label}: ` : '';
                const valText = typeof field.currentValue === 'object'
                  ? JSON.stringify(field.currentValue)
                  : String(field.currentValue);

                const isClickable = !isLocked && (isCreator || field.isOwnContribution);

                return (
                  <div
                    key={field.fieldId}
                    className={`collab-detail-item ${isClickable ? 'clickable' : ''}`}
                    onClick={() => isClickable && setEditField(field)}
                    title={isClickable ? 'Click to edit' : undefined}
                  >
                    <span className="collab-bullet">• </span>

                    {/* Creator View: Shows who contributed what! */}
                    {isCreator && field.lastEditorUsername && (
                      <span className="collab-author-tag">
                        [{field.lastEditorUsername}]:{' '}
                      </span>
                    )}

                    {/* Non-Creator View: Only clean label + value! */}
                    <span className="collab-label">{labelText}</span>
                    <span className="collab-value">{valText}</span>

                    {/* Non-Creator: if it's user's own contribution, show subtle (You) */}
                    {!isCreator && field.isOwnContribution && (
                      <span className="collab-you-tag"> (You)</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom metadata inside the bubble: timestamp, lock/edit icon, hover menu trigger */}
          <div className="collab-bubble-footer">
            {isLocked ? (
              <span className="collab-status-icon" title="Message is locked">🔒</span>
            ) : (
              <span className="collab-status-icon edit-active" title="Collaborative: right-click to append">✎</span>
            )}
            <span className="collab-time">{formatTs(message.timestamp)}</span>
            <button
              type="button"
              className="btn-bubble-menu"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({ x: rect.right - 10, y: rect.bottom + 5 });
              }}
              title="Message options"
            >
              ⋯
            </button>
          </div>
        </div>
      </div>

      {/* WhatsApp-Style Floating Context Menu */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={menuActions}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Append Detail Modal */}
      <AppendDetailModal
        isOpen={isAppendOpen}
        onClose={() => setIsAppendOpen(false)}
        messageId={payload.messageId}
      />

      {/* Edit Detail Modal */}
      <EditDetailModal
        isOpen={Boolean(editField)}
        onClose={() => setEditField(null)}
        messageId={payload.messageId}
        field={editField}
        isCreator={isCreator}
      />

      {/* Full Audit History Modal (Creator Only) */}
      {isHistoryOpen && (
        <FillableMessageHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          messageId={payload.messageId}
          revisions={historyRevisions}
        />
      )}
    </div>
  );
};
