'use client';

import React from 'react';

export const TableSkeleton = () => (
  <div className="rounded-[var(--v2-radius-xl)] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] overflow-hidden animate-pulse">
    <div className="p-6">
      <div className="h-4 bg-[rgba(255,255,255,0.12)] rounded w-1/4 mb-4"></div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 bg-[rgba(255,255,255,0.12)] rounded flex-1"></div>
            <div className="h-4 bg-[rgba(255,255,255,0.12)] rounded flex-1"></div>
            <div className="h-4 bg-[rgba(255,255,255,0.12)] rounded flex-1"></div>
            <div className="h-4 bg-[rgba(255,255,255,0.12)] rounded flex-1"></div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const CardSkeleton = () => (
  <div className="rounded-[var(--v2-radius-xl)] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] p-6 animate-pulse">
    <div className="h-4 bg-[rgba(255,255,255,0.12)] rounded w-1/3 mb-4"></div>
    <div className="h-8 bg-[rgba(255,255,255,0.12)] rounded w-1/2"></div>
  </div>
);

export const StatsSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {[1, 2, 3, 4].map((i) => (
      <CardSkeleton key={i} />
    ))}
  </div>
);
