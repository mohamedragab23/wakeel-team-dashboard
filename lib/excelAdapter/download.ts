/** Browser-only download helper. Does not parse Excel. */
export function downloadBuffer(
  buffer: ArrayBuffer | Uint8Array | Buffer,
  filename: string
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('downloadBuffer is browser-only');
  }
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
