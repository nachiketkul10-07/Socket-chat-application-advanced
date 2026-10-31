import React, { useState } from 'react';
import { wsService } from '../websocket';

interface AppendDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
}

export const AppendDetailModal: React.FC<AppendDetailModalProps> = ({
  isOpen,
  onClose,
  messageId
}) => {
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      alert('Please enter a detail or value.');
      return;
    }

    setIsSubmitting(true);
    const mutationId = `mut_dyn_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

    wsService.send({
      type: 'append_fillable_detail',
      messageId,
      label: label.trim() || 'Detail',
      value: value.trim(),
      clientMutationId: mutationId
    });

    setIsSubmitting(false);
    setLabel('');
    setValue('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content append-detail-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        <div className="modal-header">
          <h3>➕ Append Detail to Message</h3>
          <button className="btn-close-modal" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ gap: '14px', padding: '16px 20px' }}>
            <div className="form-group">
              <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
                Field / Topic (Optional):
              </label>
              <input
                type="text"
                className="builder-intro-input"
                placeholder="e.g. PRN, Pickup Location, Dietary"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
                Your Detail / Value: <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                className="builder-intro-input"
                rows={3}
                placeholder="e.g. 1251076777 or Pune Station, 7:30 AM"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer" style={{ padding: '12px 18px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              ➕ Append to Message
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

