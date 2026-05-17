/**
 * MarksDisplay — header chip showing progression toward the level pass.
 */

'use client';

export interface MarksDisplayProps {
  total: number;
  required: number;
  /** Pulse the newest dot on win. */
  justEarned: boolean;
}

export function MarksDisplay({
  total,
  required,
  justEarned,
}: MarksDisplayProps): JSX.Element {
  const passed = total >= required;

  return (
    <div className="marks" aria-live="polite">
      <span className="marks-label">Marks</span>
      {passed ? (
        <span className="marks-passed">Level passed!</span>
      ) : (
        <>
          <span className="marks-dots" role="img" aria-label={`${total} of ${required} marks`}>
            {Array.from({ length: required }).map((_, i) => {
              const filled = i < total;
              const isNew = justEarned && i === total - 1;
              return (
                <span
                  key={i}
                  className={[
                    'marks-dot',
                    filled ? 'filled' : '',
                    isNew ? 'just-earned' : '',
                  ].filter(Boolean).join(' ')}
                />
              );
            })}
          </span>
          <span style={{ color: 'var(--ui-text-dim)' }}>
            {total} / {required}
          </span>
        </>
      )}
    </div>
  );
}
