import React, { useState } from 'react';
import { wsService } from '../websocket';
import { FillableFieldDetail } from '../types';

interface EditDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  field: FillableFieldDetail | null;
  isCreator: boolean;
}

export const EditDetailModal: React.FC<EditDetailModalProps> = ({
  isOpen,
  onClose,
  messageId,
  field,
  isCreator
}) => {
  if (!isOpen || !field) return null;

  const [value, setValue] = useState(
    field.currentValue !== null && field.currentValue !== undefined
      ? String(field.currentValue)
      : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      alert('Value cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    const mutationId = `mut_edit_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

    wsService.send({
      type: 'update_fillable_field',
      messageId,
      fieldId: field.fieldId,
      value: value.trim(),
      expectedFieldVersion: field.version,
      clientMutationId: mutationId
    });

    setIsSubmitting(false);
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this detail entry?')) {
      wsService.send({
        type: 'delete_fillable_detail',
        messageId,
        fieldId: field.fieldId
      });
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content edit-detail-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        <div className="modal-header">
          <h3>✏️ Edit Detail ({field.label})</h3>
          <button className="btn-close-modal" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ gap: '14px', padding: '16px 20px' }}>
            <div className="form-group">
              <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
                Field / Topic:
              </label>
              <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: '14px' }}>
                {field.label}
              </div>
            </div>

            <div className="form-group">
              <label style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', display: 'block' }}>
                Your Value:
              </label>
              <textarea
                className="builder-intro-input"
                rows={3}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="modal-footer" style={{ padding: '12px 18px', justifyContent: 'space-between' }}>
            {(isCreator || field.isOwnContribution) ? (
              <button
                type="button"
                className="btn-danger-sm"
                onClick={handleDelete}
                style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}
              >
                🗑️ Delete
              </button>
            ) : <div />}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

