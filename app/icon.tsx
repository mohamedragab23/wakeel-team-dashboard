import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2563eb',
          color: '#fff',
          fontSize: 28,
          fontWeight: 700,
          borderRadius: 16,
        }}
      >
        WT
      </div>
    ),
    { width: size.width, height: size.height }
  );
}

