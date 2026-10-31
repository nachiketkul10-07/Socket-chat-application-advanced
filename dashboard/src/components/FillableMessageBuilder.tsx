import React, { useState, useMemo } from 'react';
import { User, FillableFieldType, getAvatarGradient } from '../types';

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
  availableUsers?: User[];
  currentUserId: string;
  onSubmit: (payload: any) => void;
}

export const FillableMessageBuilder: React.FC<FillableMessageBuilderProps> = ({
  isOpen,
  onClose,
  conversationId,
  conversationParticipants,
  availableUsers = [],
  currentUserId,
  onSubmit
}) => {
  const [mode, setMode] = useState<'freeform' | 'structured'>('freeform');
  const [introText, setIntroText] = useState('Please share your details below:');
  const [freeformAssignment, setFreeformAssignment] = useState<'all' | 'custom' | 'creator'>('all');
  const [freeformAssignedUsers, setFreeformAssignedUsers] = useState<string[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');

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

  // Merge conversation participants and any other available users, avoiding duplicates
  const candidateUsers = useMemo(() => {
    const map = new Map<string, User>();
    (conversationParticipants || []).forEach(u => {
      if (u && u.id && u.id !== currentUserId) map.set(u.id, u);
    });
    (availableUsers || []).forEach(u => {
      if (u && u.id && u.id !== currentUserId && !map.has(u.id)) {
        map.set(u.id, u);
      }
    });
    return Array.from(map.values());
  }, [conversationParticipants, availableUsers, currentUserId]);

  const filteredCandidates = candidateUsers.filter(u =>
    u.username.toLowerCase().includes(participantSearch.toLowerCase())
  );

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

  const handleSelectAllFreeform = () => {
    setFreeformAssignedUsers(filteredCandidates.map(u => u.id));
  };

  const handleClearAllFreeform = () => {
    setFreeformAssignedUsers([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!introText.trim()) {
      alert('Please enter a message.');
      return;
    }

    if (mode === 'freeform' && freeformAssignment === 'custom' && freeformAssignedUsers.length === 0) {
      alert('Please select at least one participant who can append details, or choose "Everyone in Conversation".');
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
      templateSegments: {
        mode,
        appendAssignmentMode: freeformAssignment,
        appendAssignedUserIds: freeformAssignment === 'custom' ? freeformAssignedUsers : []
      },
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
        <div style={{ display: 'flex', borderBottom: '1px solid #30363d', padding: '0 18px', background: '#161b22' }}>
          <button
            type="button"
            onClick={() => setMode('freeform')}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: mode === 'freeform' ? '2px solid #58a6ff' : '2px solid transparent',
              color: mode === 'freeform' ? '#58a6ff' : '#8b949e',
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
              borderBottom: mode === 'structured' ? '2px solid #58a6ff' : '2px solid transparent',
              color: mode === 'structured' ? '#58a6ff' : '#8b949e',
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
              <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '13px', color: '#58a6ff', fontWeight: 600, marginBottom: '6px' }}>
                  💡 How this works:
                </div>
                <div style={{ fontSize: '12px', color: '#8b949e', lineHeight: '1.6', marginBottom: '14px' }}>
                  • The message appears as a normal chat bubble in the conversation.<br />
                  • Permitted participants can click <strong>➕ Append Detail</strong> or right-click to add details.<br />
                  • <strong>Only you (creator) will see who contributed which detail.</strong> Other participants will see data without contributor names.
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '12px', color: '#f0f6fc', fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                    Who can append details to this message?
                  </label>
                  <div className="radio-group" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '12px' }}>
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

                  {/* Enhanced Specific Participants Picker */}
                  {freeformAssignment === 'custom' && (
                    <div className="builder-participant-picker">
                      <div className="picker-toolbar">
                        <div className="picker-search-wrap">
                          <span className="picker-search-icon">🔍</span>
                          <input
                            type="text"
                            className="picker-search-input"
                            placeholder="Filter participants by name..."
                            value={participantSearch}
                            onChange={(e) => setParticipantSearch(e.target.value)}
                          />
                          {participantSearch && (
                            <button
                              type="button"
                              className="picker-search-clear"
                              onClick={() => setParticipantSearch('')}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <div className="picker-quick-actions">
                          <button
                            type="button"
                            className="btn-picker-action"
                            onClick={handleSelectAllFreeform}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="btn-picker-action"
                            onClick={handleClearAllFreeform}
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="picker-header-info">
                        <span className="picker-count-label">
                          Permitted Participants ({freeformAssignedUsers.length} selected):
                        </span>
                      </div>

                      <div className="picker-user-list">
                        {filteredCandidates.length === 0 ? (
                          <div className="picker-empty-state">
                            <span>No other participants found{participantSearch ? ` matching "${participantSearch}"` : ''}</span>
                          </div>
                        ) : (
                          filteredCandidates.map((p) => {
                            const isSelected = freeformAssignedUsers.includes(p.id);
                            const avatar = getAvatarGradient(p.username);

                            return (
                              <div
                                key={p.id}
                                className={`picker-user-row ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleToggleFreeformParticipant(p.id)}
                              >
                                <div
                                  className="picker-user-avatar"
                                  style={{
                                    background: avatar.bg,
                                    border: `1.5px solid ${avatar.border}`,
                                    boxShadow: `0 0 8px ${avatar.glow}`
                                  }}
                                >
                                  {p.username.charAt(0).toUpperCase()}
                                </div>
                                <div className="picker-user-info">
                                  <span className="picker-user-name">{p.username}</span>
                                  <span className="picker-user-status">
                                    {p.isOnline ? '🟢 Online' : '⚫ Offline'}
                                  </span>
                                </div>
                                <div className="picker-checkbox-wrapper">
                                  <input
                                    type="checkbox"
                                    className="picker-checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    aria-label={`Select ${p.username}`}
                                  />
                                  <span className={`custom-checkbox ${isSelected ? 'checked' : ''}`}>
                                    {isSelected && '✓'}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {freeformAssignedUsers.length === 0 && (
                        <div className="picker-warning-banner">
                          ⚠️ Please check at least one participant above who can append details, or choose "Everyone in Conversation".
                        </div>
                      )}
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
                          onChange={(e) => handleFieldChange(idx, { fieldType: e.target.value as FillableFieldType })}
                        >
                          <option value="text">Text Input</option>
                          <option value="textarea">Multi-line Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="time">Time</option>
                          <option value="select">Dropdown Choice</option>
                          <option value="multiselect">Multiple Choices</option>
                          <option value="checkbox">Yes / No Checkbox</option>
                        </select>
                        {fields.length > 1 && (
                          <button
                            type="button"
                            className="btn-remove-field"
                            onClick={() => handleRemoveField(idx)}
                            title="Remove field"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      <div className="field-card-body">
                        <div className="field-setting-row">
                          <input
                            type="text"
                            className="field-placeholder-input"
                            placeholder="Placeholder / Guidance note..."
                            value={field.placeholder}
                            onChange={(e) => handleFieldChange(idx, { placeholder: e.target.value })}
                          />
                          <label className="checkbox-label-sm">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => handleFieldChange(idx, { required: e.target.checked })}
                            />
                            Required
                          </label>
                        </div>

                        {(field.fieldType === 'select' || field.fieldType === 'multiselect') && (
                          <div className="field-setting-row">
                            <input
                              type="text"
                              className="field-options-input"
                              placeholder="Comma-separated options (e.g. Morning, Afternoon, Evening)"
                              value={field.optionsStr}
                              onChange={(e) => handleFieldChange(idx, { optionsStr: e.target.value })}
                            />
                          </div>
                        )}

                        <div className="field-assignment-box">
                          <span className="setting-label">Who can edit this field?</span>
                          <div className="radio-group-sm">
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
                            <div className="builder-participant-picker mini">
                              <div className="picker-header-info">
                                <span className="picker-count-label">
                                  Assigned to ({field.assignedUserIds.length} selected):
                                </span>
                              </div>
                              <div className="picker-user-list">
                                {candidateUsers.map((p) => {
                                  const isSelected = field.assignedUserIds.includes(p.id);
                                  const avatar = getAvatarGradient(p.username);
                                  return (
                                    <div
                                      key={p.id}
                                      className={`picker-user-row ${isSelected ? 'selected' : ''}`}
                                      onClick={() => handleToggleParticipant(idx, p.id)}
                                    >
                                      <div
                                        className="picker-user-avatar sm"
                                        style={{
                                          background: avatar.bg,
                                          border: `1px solid ${avatar.border}`,
                                          boxShadow: `0 0 6px ${avatar.glow}`
                                        }}
                                      >
                                        {p.username.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="picker-user-info">
                                        <span className="picker-user-name">{p.username}</span>
                                      </div>
                                      <div className="picker-checkbox-wrapper">
                                        <input
                                          type="checkbox"
                                          className="picker-checkbox"
                                          checked={isSelected}
                                          onChange={() => {}}
                                        />
                                        <span className={`custom-checkbox ${isSelected ? 'checked' : ''}`}>
                                          {isSelected && '✓'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
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
