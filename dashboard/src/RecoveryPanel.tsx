import React, { useState } from 'react';
import { RecoveryBatch, MissingRange } from './types';

interface Props {
  conversationId: string;
  onRecover: (fromSeq?: number, toSeq?: number) => void;
  onAck: (planId: string, ackedSeq: number, missing?: MissingRange[]) => void;
  onComplete: (planId: string) => void;
  lastBatch: RecoveryBatch | null;
  cursor: number;
}

export const RecoveryPanel: React.FC<Props> = ({ conversationId, onRecover, onAck, onComplete, lastBatch, cursor }) => {
  const [fromSeq, setFromSeq] = useState<string>('');
  const [toSeq, setToSeq] = useState<string>('');
  const [status, setStatus] = useState<string>('idle');

  const start = () => {
    setStatus('recovering');
    onRecover(fromSeq ? parseInt(fromSeq, 10) : undefined, toSeq ? parseInt(toSeq, 10) : undefined);
  };

  const ackAll = () => {
    if (!lastBatch) return;
    const last = (lastBatch.messages.length && lastBatch.messages[lastBatch.messages.length - 1].seq !== undefined)
      ? lastBatch.messages[lastBatch.messages.length - 1].seq!
      : cursor;
    onAck(lastBatch.planId, last, []);
    if (!lastBatch.hasMore) { onComplete(lastBatch.planId); setStatus('complete'); }
    else { setStatus('recovering'); onRecover(lastBatch.nextSeq, undefined); }
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: 8, margin: 8 }}>
      <h4>Recovery: {conversationId}</h4>
      <div>Cursor (contiguous): {cursor}</div>
      {lastBatch && (
        <div>
          <div>Plan: {lastBatch.planId.slice(0, 8)}... batch={lastBatch.batchSize} hasMore={String(lastBatch.hasMore)}</div>
          <div>Received {lastBatch.messages.length} messages (seq {lastBatch.messages.length ? lastBatch.messages[0].seq : '-'}..{lastBatch.messages.length ? lastBatch.messages[lastBatch.messages.length-1].seq : '-'})</div>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <input placeholder="fromSeq" value={fromSeq} onChange={e => setFromSeq(e.target.value)} style={{ width: 80 }} />
        <input placeholder="toSeq" value={toSeq} onChange={e => setToSeq(e.target.value)} style={{ width: 80, marginLeft: 4 }} />
        <button onClick={start} style={{ marginLeft: 4 }}>Recover</button>
        <button onClick={ackAll} style={{ marginLeft: 4 }} disabled={!lastBatch}>Ack Batch</button>
      </div>
      <div>Status: {status}</div>
    </div>
  );
};
