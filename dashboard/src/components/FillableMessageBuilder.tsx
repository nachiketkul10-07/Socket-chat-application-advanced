import React, { useState } from 'react';
import { User, FillableFieldType } from '../types';

interface BuilderField {
  fieldId: string;
  label: string;
  fieldType: FillableFieldType;
  placeholder: string;
  required: boolean;
  optionsStr: string;
  assignmentMode: 'all' | 'creator' | 'custom';
  assignedUserIds: string[];
}

interface FillableMessageBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  conversationParticipants: User[];
  currentUserId: string;
  onSubmit: (payload: any) => void;
}

export const FillableMessageBuilder: React.FC<FillableMessageBuilderProps> = ({
  isOpen,
  onClose,
  conversationId,
  conversationParticipants,
  currentUserId,
  onSubmit
}) => {
  const [mode, setMode] = useState<'freeform' | 'structured'>('freeform');
  const [introText, setIntroText] = useState('Please share your details below:');
  const [freeformAssignment, setFreeformAssignment] = useState<'all' | 'custom' | 'creator'>('all');
  const [freeformAssignedUsers, setFreeformAssignedUsers] = useState<string[]>([]);

  // Structured fields state
  const [fields, setFields] = useState<BuilderField[]>([
    {
      fieldId: 'fld_' + Math.floor(Math.random() * 1e5),
      label: 'Detail',
      fieldType: 'text',
      placeholder: 'e.g. PRN or Pickup Location',
      required: false,
      optionsStr: '',
      assignmentMode: 'all',
      assignedUserIds: []
    }
  ]);

  // Finalization settings
  const [requireAllMandatory, setRequireAllMandatory] = useState(false);
  const [allowReopen, setAllowReopen] = useState(true);
  const [lockOnCompletion, setLockOnCompletion] = useState(true);
  const [finalizePermission, setFinalizePermission] = useState<'creator_only' | 'assigned_or_creator' | 'all'>('creator_only');
  const [deadlineStr, setDeadlineStr] = useState('');

  if (!isOpen) return null;

  const handleAddField = () => {
    const newField: BuilderField = {
      fieldId: 'fld_' + Date.now().toString().slice(-6) + '_' + Math.floor(Math.random() * 1000),
      label: `Field ${fields.length + 1}`,
      fieldType: 'text',
      placeholder: '',
      required: false,
      optionsStr: '',
      assignmentMode: 'all',
      assignedUserIds: []
    };
    setFields([...fields, newField]);
  };

  const handleRemoveField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx));
  };

  const handleFieldChange = (idx: number, patch: Partial<BuilderField>) => {
    setFields(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const handleToggleParticipant = (idx: number, userId: string) => {
    const field = fields[idx];
    const exists = field.assignedUserIds.includes(userId);
    const updatedIds = exists
      ? field.assignedUserIds.filter((id) => id !== userId)
      : [...field.assignedUserIds, userId];
    handleFieldChange(idx, { assignedUserIds: updatedIds });
  };

  const handleToggleFreeformParticipant = (userId: string) => {
    setFreeformAssignedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!introText.trim()) {
      alert('Please enter a message.');
      return;
    }

    let formattedFields: any[] = [];
    if (mode === 'structured') {
      formattedFields = fields.map((f) => {
        const rules: any = {};
        if (f.fieldType === 'select' || f.fieldType === 'multiselect') {
          rules.options = f.optionsStr
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }

        return {
          fieldId: f.fieldId,
          label: f.label.trim() || 'Detail',
          fieldType: f.fieldType,
          placeholder: f.placeholder.trim(),
          required: f.required,
          validationRules: rules,
          assignmentMode: f.assignmentMode,
          assignedUserIds: f.assignmentMode === 'custom' ? f.assignedUserIds : []
        };
      });
    }

    let deadlineEpoch: number | null = null;
    if (deadlineStr) {
      deadlineEpoch = Math.floor(new Date(deadlineStr).getTime() / 1000);
    }

    const payload = {
      type: 'create_fillable_message',
      conversationId,
      introText: introText.trim(),
      fields: formattedFields,
      finalizationSettings: {
        requireAllMandatory: mode === 'structured' ? requireAllMandatory : false,
        allowReopen,
        lockOnCompletion,
        finalizePermission,
        deadline: deadlineEpoch
      }
    };

    onSubmit(payload);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content builder-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📋 Create Collaborative Message</h3>
          <button className="btn-close-modal" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #222f4c', padding: '0 18px', background: '#0e1628' }}>
          <button
            type="button"
            onClick={() => setMode('freeform')}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: mode === 'freeform' ? '2px solid #3b82f6' : '2px solid transparent',
              color: mode === 'freeform' ? '#60a5fa' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            ⚡ Simple / Freeform Appends (Recommended)
          </button>
          <button
            type="button"
            onClick={() => setMode('structured')}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: mode === 'structured' ? '2px solid #3b82f6' : '2px solid transparent',
              color: mode === 'structured' ? '#60a5fa' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            📑 Pre-defined Form Fields
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body builder-body">
            {/* Intro text */}
            <div className="form-group">
              <label>Message Content:</label>
              <textarea
                className="builder-intro-input"
                rows={2}
                value={introText}
                onChange={(e) => setIntroText(e.target.value)}
                placeholder="e.g. Please share your PRN and pickup location below"
                required
                autoFocus
              />
            </div>

            {mode === 'freeform' ? (
              <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>
                  💡 How this works:
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.6', marginBottom: '14px' }}>
                  • The message appears as a normal chat bubble in the conversation.<br />
                  • Participants can <strong>right-click on the message</strong> to append any detail (e.g. PRN, location, name).<br />
                  • <strong>Only you (creator) will see who contributed which detail.</strong> Other participants will see the data without other people's names.
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '6px', display: 'block' }}>
                    Who can append details to this message?
                  </label>
                  <div className="radio-group" style={{ display: 'flex', gap: '14px' }}>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="freeform_mode"
                        checked={freeformAssignment === 'all'}
                        onChange={() => setFreeformAssignment('all')}
                      />
                      Everyone in Conversation
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="freeform_mode"
                        checked={freeformAssignment === 'creator'}
                        onChange={() => setFreeformAssignment('creator')}
                      />
                      Only Me
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="freeform_mode"
                        checked={freeformAssignment === 'custom'}
                        onChange={() => setFreeformAssignment('custom')}
                      />
                      Specific Participants
                    </label>
                  </div>

                  {freeformAssignment === 'custom' && (
                    <div className="participant-chips" style={{ marginTop: '10px' }}>
                      {conversationParticipants
                        .filter(p => p.id !== currentUserId)
                        .map((p) => (
                          <div
                            key={p.id}
                            className={`chip ${freeformAssignedUsers.includes(p.id) ? 'selected' : ''}`}
                            onClick={() => handleToggleFreeformParticipant(p.id)}
                          >
                            {p.username}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Structured Fields Mode */
              <div className="form-group">
                <div className="section-title-bar">
                  <label>Interactive Fields ({fields.length}):</label>
                  <button type="button" className="btn-add-field" onClick={handleAddField}>
                    + Add Another Field
                  </button>
                </div>

                <div className="fields-list">
                  {fields.map((field, idx) => (
                    <div key={field.fieldId} className="builder-field-card">
                      <div className="field-card-header">
                        <span className="field-index-badge">#{idx + 1}</span>
                        <input
                          type="text"
                          className="field-label-input"
                          placeholder="Field Label (e.g. Pickup Location)"
                          value={field.label}
                          onChange={(e) => handleFieldChange(idx, { label: e.target.value })}
                          required
                        />
                        <select
                          className="builder-field-type-select"
                          value={field.fieldType}
                          onChange={(e) =>
                            handleFieldChange(idx, { fieldType: e.target.value as FillableFieldType })
                          }
                        >
                          <option value="text">Short Text</option>
                          <option value="textarea">Long Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="time">Time</option>
                          <option value="select">Dropdown Single Select</option>
                          <option value="multiselect">Multiple Selection</option>
                          <option value="checkbox">Checkbox (Yes/No)</option>
                        </select>
                        <button
                          type="button"
                          className="btn-remove-field"
                          onClick={() => handleRemoveField(idx)}
                          title="Remove field"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="field-card-body">
                        <div className="field-options-row">
                          <input
                            type="text"
                            className="field-placeholder-input"
                            placeholder="Placeholder / Hint"
                            value={field.placeholder}
                            onChange={(e) => handleFieldChange(idx, { placeholder: e.target.value })}
                          />
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => handleFieldChange(idx, { required: e.target.checked })}
                            />
                            Mandatory
                          </label>
                        </div>

                        <div className="assignment-section">
                          <span className="assign-title">Who can edit this field?</span>
                          <div className="radio-group">
                            <label className="radio-label">
                              <input
                                type="radio"
                                name={`assign_${field.fieldId}`}
                                checked={field.assignmentMode === 'all'}
                                onChange={() => handleFieldChange(idx, { assignmentMode: 'all' })}
                              />
                              Everyone in Conversation
                            </label>
                            <label className="radio-label">
                              <input
                                type="radio"
                                name={`assign_${field.fieldId}`}
                                checked={field.assignmentMode === 'custom'}
                                onChange={() => handleFieldChange(idx, { assignmentMode: 'custom' })}
                              />
                              Specific Participants
                            </label>
                            <label className="radio-label">
                              <input
                                type="radio"
                                name={`assign_${field.fieldId}`}
                                checked={field.assignmentMode === 'creator'}
                                onChange={() => handleFieldChange(idx, { assignmentMode: 'creator' })}
                              />
                              Only Me
                            </label>
                          </div>

                          {field.assignmentMode === 'custom' && (
                            <div className="participant-chips" style={{ marginTop: '8px' }}>
                              {conversationParticipants
                                .filter(p => p.id !== currentUserId)
                                .map((p) => (
                                  <div
                                    key={p.id}
                                    className={`chip ${field.assignedUserIds.includes(p.id) ? 'selected' : ''}`}
                                    onClick={() => handleToggleParticipant(idx, p.id)}
                                  >
                                    {p.username}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Finalization Settings */}
            <div className="finalization-settings-card">
              <h4>⚙️ Finalization & Lock Settings</h4>
              <div className="settings-grid">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={requireAllMandatory}
                    onChange={(e) => setRequireAllMandatory(e.target.checked)}
                  />
                  Require all mandatory fields before finalization
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={lockOnCompletion}
                    onChange={(e) => setLockOnCompletion(e.target.checked)}
                  />
                  Lock fields on finalization
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={allowReopen}
                    onChange={(e) => setAllowReopen(e.target.checked)}
                  />
                  Allow creator to reopen after finalization
                </label>

                <div className="setting-input-row">
                  <label>Who can finalize:</label>
                  <select
                    className="builder-field-type-select"
                    value={finalizePermission}
                    onChange={(e) => setFinalizePermission(e.target.value as any)}
                  >
                    <option value="creator_only">Creator Only</option>
                    <option value="assigned_or_creator">Assigned Contributors or Creator</option>
                    <option value="all">Any Conversation Member</option>
                  </select>
                </div>

                <div className="setting-input-row">
                  <label>Completion Deadline (optional):</label>
                  <input
                    type="datetime-local"
                    className="deadline-picker"
                    value={deadlineStr}
                    onChange={(e) => setDeadlineStr(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              🚀 Send Collaborative Message
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
