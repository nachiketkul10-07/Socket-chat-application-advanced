import React, { useState, useRef } from 'react';
import { Message, User, FillableRevision, FillableFieldDetail, getAvatarGradient } from '../types';
import { FillableMessageHistoryModal } from './FillableMessageHistoryModal';
import { MessageContextMenu, ContextMenuAction } from './MessageContextMenu';
import { AppendDetailModal } from './AppendDetailModal';
import { EditDetailModal } from './EditDetailModal';
import { wsService } from '../websocket';

interface FillableMessageCardProps {
  message: Message;
  currentUser: User;
  users: Map<string, User>;
  onPromptDelete?: (message: Message) => void;
}

export const FillableMessageCard: React.FC<FillableMessageCardProps> = ({
  message,
  currentUser,
  users,
  onPromptDelete
}) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyRevisions, setHistoryRevisions] = useState<FillableRevision[]>([]);
  const [isAppendOpen, setIsAppendOpen] = useState(false);
  const [editField, setEditField] = useState<FillableFieldDetail | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const touchTimerRef = useRef<any>(null);

  const payload = message.fillable;
  if (!payload) return null;

  const isCreator = payload.creatorId === currentUser.id;
  const isOwn = (message.fromUserId || message.senderId) === currentUser.id;
  const isFinalized = payload.status === 'finalized';
  const isExpired = payload.status === 'expired';
  const isLocked = isFinalized || isExpired;

  const creatorUser = users.get(payload.creatorId) || { username: payload.creatorUsername || 'User' };
  const creatorAvatar = getAvatarGradient(creatorUser.username);

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
  };

  const handleToggleLock = () => {
    if (!isCreator) return;
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

  // Mobile long-press detection (500ms)
  const handleTouchStart = () => {
    touchTimerRef.current = setTimeout(() => {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      onPromptDelete?.(message);
    }, 500);
  };

  const handleTouchEndOrMove = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  // Find if current user has an own contribution
  const myOwnField = payload.fields?.find(f => f.isOwnContribution || (f.lastEditorId === currentUser.id));

  // Determine if current user is permitted to append details based on creator settings
  const segments = payload.templateSegments as any;
  const appendMode = (segments && typeof segments === 'object' && !Array.isArray(segments) && segments.appendAssignmentMode) || 'all';
  const appendAssigned = (segments && typeof segments === 'object' && !Array.isArray(segments) && Array.isArray(segments.appendAssignedUserIds))
    ? segments.appendAssignedUserIds
    : [];

  const canAppend = !isLocked && (
    appendMode === 'all' ||
    (appendMode === 'creator' && isCreator) ||
    (appendMode === 'custom' && (isCreator || appendAssigned.includes(currentUser.id)))
  );

  // Build WhatsApp-style Context Menu Actions
  const menuActions: ContextMenuAction[] = [];

  if (canAppend) {
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

  menuActions.push({
    label: 'Delete Message',
    icon: '🗑️',
    onClick: () => onPromptDelete?.(message)
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
        <div
          className="message-avatar"
          style={{
            background: creatorAvatar.bg,
            border: `1.5px solid ${creatorAvatar.border}`,
            boxShadow: `0 0 8px ${creatorAvatar.glow}`
          }}
        >
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
          onDoubleClick={() => onPromptDelete?.(message)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEndOrMove}
          onTouchMove={handleTouchEndOrMove}
          title="Right-click for options • Double-tap or hold to delete"
        >
          {/* Quick Hover Action Trigger */}
          <button
            type="button"
            className="bubble-action-trigger"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setContextMenu({ x: Math.min(rect.left, window.innerWidth - 200), y: rect.bottom + 6 });
            }}
            title="Options & Actions"
            aria-label="Options"
          >
            ⋮
          </button>

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
                    onClick={() => {
                      if (!isLocked && (isCreator || field.isOwnContribution)) {
                        setEditField(field);
                      }
                    }}
                    title={isClickable ? 'Click to edit your detail' : ''}
                  >
                    <span className="collab-detail-bullet">•</span>
                    <span className="collab-detail-label">{labelText}</span>
                    <span className="collab-detail-value">{valText}</span>

                    {/* Attribution Privacy: creator views full provenance, non-creator sees (You) for own */}
                    {isCreator && field.lastEditorUsername && (
                      <span className="collab-editor-tag-creator">
                        ({field.lastEditorUsername})
                      </span>
                    )}
                    {!isCreator && field.isOwnContribution && (
                      <span className="collab-editor-tag-self">
                        (You)
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick inline action bar */}
          {!isLocked && (canAppend || myOwnField) && (
            <div className="collab-bubble-actions">
              {canAppend && (
                <button
                  type="button"
                  className="btn-collab-append"
                  onClick={() => setIsAppendOpen(true)}
                >
                  ➕ Append Detail
                </button>
              )}
              {myOwnField && (
                <button
                  type="button"
                  className="btn-collab-edit-mine"
                  onClick={() => setEditField(myOwnField)}
                >
                  ✏️ Edit Mine
                </button>
              )}
            </div>
          )}

          {/* Status badge & timestamp */}
          <div className="collab-bubble-footer">
            {isLocked ? (
              <span className="collab-status-pill locked">🔒 Locked</span>
            ) : (
              <span className="collab-status-pill open">
                <span className="live-status-pulse"></span>
                Living Message
              </span>
            )}
            <span className="collab-bubble-time">
              {formatTs(payload.updatedAt || message.timestamp)}
            </span>
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
