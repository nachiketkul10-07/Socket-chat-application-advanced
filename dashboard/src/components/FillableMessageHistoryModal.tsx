import React from 'react';
import { FillableRevision } from '../types';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  revisions: FillableRevision[];
}

export const FillableMessageHistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  revisions
}) => {
  if (!isOpen) return null;

  const formatTs = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleString();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content history-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📜 Live Fill-in Activity & Revision History</h3>
          <button className="btn-close-modal" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body history-body">
          {revisions.length === 0 ? (
            <div className="empty-state">No revisions recorded yet.</div>
          ) : (
            <div className="revision-timeline">
              {revisions.map((rev) => (
                <div key={rev.id} className="revision-item">
                  <div className="rev-icon">✏️</div>
                  <div className="rev-details">
                    <div className="rev-top">
                      <span className="rev-editor">{rev.editorUsername}</span>
                      <span className="rev-action">updated</span>
                      <span className="rev-field">{rev.fieldLabel}</span>
                      <span className="rev-version">v{rev.revisionNumber}</span>
                    </div>
                    <div className="rev-values">
                      {rev.previousValue !== null && rev.previousValue !== undefined && (
                        <div className="val-prev">
                          <span className="val-tag">Before:</span>{' '}
                          <code>
                            {typeof rev.previousValue === 'object'
                              ? JSON.stringify(rev.previousValue)
                              : String(rev.previousValue)}
                          </code>
                        </div>
                      )}
                      <div className="val-new">
                        <span className="val-tag">Now:</span>{' '}
                        <code>
                          {typeof rev.newValue === 'object'
                            ? JSON.stringify(rev.newValue)
                            : String(rev.newValue)}
                        </code>
                      </div>
                    </div>
                    <div className="rev-time">{formatTs(rev.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

