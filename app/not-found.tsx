export const dynamic = 'force-dynamic';

export default function NotFound() {
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
      <h1 style={{ fontSize: '72px', margin: '0', color: '#1f2937' }}>404</h1>
      <h2 style={{ fontSize: '24px', margin: '10px 0', color: '#4b5563' }}>الصفحة غير موجودة</h2>
      <p style={{ fontSize: '16px', color: '#6b7280', margin: '20px 0' }}>
        عذراً، الصفحة التي تبحث عنها غير موجودة.
      </p>
      <a
        href="/"
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#2563eb',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '8px',
          marginTop: '20px'
        }}
      >
        العودة إلى الصفحة الرئيسية
      </a>
    </div>
  );
}

