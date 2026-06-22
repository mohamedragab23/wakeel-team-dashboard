import { NextResponse } from 'next/server';
import { isTicketingDbConfigured } from '@/lib/ticketing/db/client';

export function ticketingDbUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: 'نظام التذاكر غير مهيأ — يرجى ضبط TICKETING_DATABASE_URL وتشغيل migrate:ticketing',
    },
    { status: 503 }
  );
}

export function wrapTicketingHandler<T extends (...args: never[]) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    if (!isTicketingDbConfigured()) {
      return ticketingDbUnavailableResponse();
    }
    try {
      return await handler(...args);
    } catch (err) {
      console.error('[ticketing]', err);
      const message = err instanceof Error ? err.message : 'خطأ داخلي';
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  }) as T;
}
