'use client';

export const dynamic = 'force-dynamic';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'Cairo, sans-serif',
      padding: '20px',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '72px', margin: '0', color: '#dc2626' }}>500</h1>
      <h2 style={{ fontSize: '24px', margin: '10px 0', color: '#4b5563' }}>حدث خطأ</h2>
      <p style={{ fontSize: '16px', color: '#6b7280', margin: '20px 0' }}>
        عذراً، حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.
      </p>
      {process.env.NODE_ENV === 'development' && error.message && (
        <pre style={{
          backgroundColor: '#f3f4f6',
          padding: '15px',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#dc2626',
          margin: '20px 0',
          textAlign: 'left',
          maxWidth: '600px',
          overflow: 'auto'
        }}>
          {error.message}
        </pre>
      )}
      <button
        onClick={reset}
        style={{
          padding: '12px 24px',
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          marginTop: '20px'
        }}
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

