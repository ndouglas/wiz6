export function StubBanner({ stage, description }: { stage: string; description: string }) {
  return (
    <p
      style={{
        padding: 'var(--space-4)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 4,
        color: 'var(--color-text-muted)',
      }}
    >
      Coming in stage {stage}: {description}
    </p>
  );
}
