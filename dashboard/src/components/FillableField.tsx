import React, { useState, useEffect } from 'react';
import { FillableFieldDetail } from '../types';

interface FillableFieldProps {
  field: FillableFieldDetail;
  messageStatus: string;
  onUpdate: (fieldId: string, value: any, expectedFieldVersion: number) => void;
}

export const FillableField: React.FC<FillableFieldProps> = ({ field, messageStatus, onUpdate }) => {
  const [localVal, setLocalVal] = useState<any>(field.currentValue ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setLocalVal(field.currentValue ?? '');
    setIsSaving(false);
  }, [field.currentValue, field.version]);

  const canEdit = field.canCurrentUserEdit && (messageStatus === 'open' || messageStatus === 'ready');

  const handleSave = () => {
    setErrorMsg(null);
    let valToSubmit = localVal;

    if (field.fieldType === 'number') {
      if (localVal === '' || localVal === null) {
        valToSubmit = null;
      } else {
        const num = Number(localVal);
        if (isNaN(num)) {
          setErrorMsg('Please enter a valid number');
          return;
        }
        valToSubmit = num;
      }
    }

    if (field.required && (valToSubmit === null || valToSubmit === '' || (Array.isArray(valToSubmit) && valToSubmit.length === 0))) {
      setErrorMsg('This field is required');
      return;
    }

    setIsSaving(true);
    onUpdate(field.fieldId, valToSubmit, field.version);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleCheckboxToggle = (checked: boolean) => {
    setLocalVal(checked);
    setIsSaving(true);
    onUpdate(field.fieldId, checked, field.version);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleMultiSelectToggle = (opt: string) => {
    const currentArr: string[] = Array.isArray(localVal) ? [...localVal] : [];
    const idx = currentArr.indexOf(opt);
    if (idx >= 0) {
      currentArr.splice(idx, 1);
    } else {
      currentArr.push(opt);
    }
    setLocalVal(currentArr);
    setIsSaving(true);
    onUpdate(field.fieldId, currentArr, field.version);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const renderAssignedBadge = () => {
    if (field.assignmentMode === 'all') {
      return <span className="assigned-tag all">👥 Everyone</span>;
    }
    if (field.assignmentMode === 'creator') {
      return <span className="assigned-tag creator">👑 Creator only</span>;
    }
    const names = field.assignedUsernames && field.assignedUsernames.length > 0
      ? field.assignedUsernames.join(', ')
      : 'Unassigned';
    return <span className="assigned-tag custom">👤 Assigned to {names}</span>;
  };

  const renderControl = () => {
    if (!canEdit) {
      // Read-only display
      let displayVal = '—';
      if (field.currentValue !== null && field.currentValue !== undefined && field.currentValue !== '') {
        if (field.fieldType === 'checkbox') {
          displayVal = field.currentValue ? '✓ Yes' : '✕ No';
        } else if (Array.isArray(field.currentValue)) {
          displayVal = field.currentValue.join(', ');
        } else {
          displayVal = String(field.currentValue);
        }
      }

      return (
        <div className="field-readonly-view">
          <span className={`readonly-value ${!field.isComplete ? 'empty' : ''}`}>
            {displayVal}
          </span>
          {!canEdit && (
            <span className="readonly-lock-icon" title="You are not authorized to edit this field">
              🔒
            </span>
          )}
        </div>
      );
    }

    // Editable controls
    switch (field.fieldType) {
      case 'textarea':
        return (
          <div className="editable-control-group">
            <textarea
              className="fillable-textarea"
              placeholder={field.placeholder || 'Enter text...'}
              value={localVal}
              onChange={(e) => setLocalVal(e.target.value)}
              rows={3}
            />
            <div className="control-btn-bar">
              <button className="btn-field-save" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        );

      case 'number':
        return (
          <div className="editable-control-group inline">
            <input
              type="number"
              className="fillable-input"
              placeholder={field.placeholder || 'Enter number...'}
              value={localVal}
              onChange={(e) => setLocalVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button className="btn-field-save" onClick={handleSave} disabled={isSaving}>
              {isSaving ? '...' : 'Save'}
            </button>
          </div>
        );

      case 'date':
        return (
          <div className="editable-control-group inline">
            <input
              type="date"
              className="fillable-input"
              value={localVal}
              onChange={(e) => setLocalVal(e.target.value)}
              onBlur={handleSave}
            />
            <button className="btn-field-save" onClick={handleSave} disabled={isSaving}>
              Save
            </button>
          </div>
        );

      case 'time':
        return (
          <div className="editable-control-group inline">
            <input
              type="time"
              className="fillable-input"
              value={localVal}
              onChange={(e) => setLocalVal(e.target.value)}
              onBlur={handleSave}
            />
            <button className="btn-field-save" onClick={handleSave} disabled={isSaving}>
              Save
            </button>
          </div>
        );

      case 'select': {
        const options = field.validationRules.options || [];
        return (
          <div className="editable-control-group inline">
            <select
              className="fillable-select"
              value={localVal}
              onChange={(e) => {
                setLocalVal(e.target.value);
                onUpdate(field.fieldId, e.target.value, field.version);
              }}
            >
              <option value="">-- Choose an option --</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        );
      }

      case 'multiselect': {
        const options = field.validationRules.options || [];
        const currentArr = Array.isArray(localVal) ? localVal : [];
        return (
          <div className="multiselect-pill-group">
            {options.map((opt) => {
              const selected = currentArr.includes(opt);
              return (
                <button
                  type="button"
                  key={opt}
                  className={`multiselect-pill ${selected ? 'selected' : ''}`}
                  onClick={() => handleMultiSelectToggle(opt)}
                >
                  {selected ? '✓ ' : '+ '}
                  {opt}
                </button>
              );
            })}
          </div>
        );
      }

      case 'checkbox':
        return (
          <label className="checkbox-toggle-container">
            <input
              type="checkbox"
              checked={Boolean(localVal)}
              onChange={(e) => handleCheckboxToggle(e.target.checked)}
            />
            <span className="toggle-label">{field.placeholder || 'Yes / Completed'}</span>
          </label>
        );

      case 'text':
      default:
        return (
          <div className="editable-control-group inline">
            <input
              type="text"
              className="fillable-input"
              placeholder={field.placeholder || 'Enter value...'}
              value={localVal}
              onChange={(e) => setLocalVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button className="btn-field-save" onClick={handleSave} disabled={isSaving}>
              {isSaving ? '...' : 'Save'}
            </button>
          </div>
        );
    }
  };

  return (
    <div className={`fillable-field-item ${field.isComplete ? 'complete' : 'pending'} ${canEdit ? 'can-edit' : 'readonly'}`}>
      <div className="field-header">
        <div className="field-title-area">
          <span className="field-label">
            {field.label}
            {field.required && <span className="required-star">*</span>}
          </span>
          {renderAssignedBadge()}
        </div>
        <div className="field-meta">
          {field.isComplete ? (
            <span className="field-badge complete">✓ Filled</span>
          ) : field.required ? (
            <span className="field-badge required">Mandatory</span>
          ) : (
            <span className="field-badge optional">Optional</span>
          )}
          {saveSuccess && <span className="field-saved-toast">Saved!</span>}
        </div>
      </div>

      <div className="field-body">{renderControl()}</div>

      {errorMsg && <div className="field-error-text">{errorMsg}</div>}

      {field.lastEditorUsername && (
        <div className="field-footer-info">
          Last edited by <strong>{field.lastEditorUsername}</strong> (v{field.version})
        </div>
      )}
    </div>
  );
};
