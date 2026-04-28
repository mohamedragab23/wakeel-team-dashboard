'use client';

import { useEffect, useState, memo } from 'react';
import dynamic from 'next/dynamic';

// Lazy load chart component
const LazyChart = dynamic(() => import('./LazyChart'), {
  ssr: false,
  loading: () => (
    <div className="rounded-[var(--v2-radius-xl)] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] shadow-[var(--v2-shadow-soft)] p-6 backdrop-blur-md">
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--v2-accent-cyan)]"></div>
      </div>
    </div>
  ),
});

interface PerformanceChartProps {
  startDate?: string;
  endDate?: string;
}

const PerformanceChart = memo(function PerformanceChart({ startDate, endDate }: PerformanceChartProps) {
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPerformanceData();
  }, [startDate, endDate]);

  const fetchPerformanceData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const url = new URL('/api/performance', window.location.origin);
      if (startDate) url.searchParams.append('startDate', startDate);
      if (endDate) url.searchParams.append('endDate', endDate);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success && data.data && data.data.labels && data.data.labels.length > 0) {
        const chartData = data.data.labels.map((label: string, index: number) => ({
          name: label,
          طلبات: data.data.orders[index] || 0,
          ساعات: data.data.hours[index] || 0,
        }));
        setPerformanceData(chartData);
      } else {
        // Clear data if request failed or no data
        setPerformanceData(null);
        if (!data.success) {
          console.warn('Performance data fetch failed:', data.error || 'Unknown error');
        } else if (!data.data || !data.data.labels || data.data.labels.length === 0) {
          console.warn('Performance data is empty for the selected date range');
        }
      }
    } catch (err) {
      console.error('Error fetching performance data:', err);
      setPerformanceData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[var(--v2-radius-xl)] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] shadow-[var(--v2-shadow-soft)] p-6 backdrop-blur-md">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--v2-accent-cyan)]"></div>
        </div>
      </div>
    );
  }

  // Format date range for display
  const formatDateRange = () => {
    if (!startDate || !endDate) return 'أداء آخر 7 أيام';
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start.toDateString() === end.toDateString()) {
      // Same day
      return `أداء ${start.toLocaleDateString('ar-EG', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}`;
    } else {
      // Date range
      return `أداء من ${start.toLocaleDateString('ar-EG', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })} إلى ${end.toLocaleDateString('ar-EG', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}`;
    }
  };

  return (
    <div className="rounded-[var(--v2-radius-xl)] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] shadow-[var(--v2-shadow-soft)] p-4 sm:p-6 min-w-0 max-w-full overflow-hidden backdrop-blur-md">
      <h3 className="text-lg font-semibold text-[#EAF0FF] mb-4 break-words">{formatDateRange()}</h3>
      {performanceData && performanceData.length > 0 ? (
        <LazyChart data={performanceData} dataKeys={['طلبات', 'ساعات']} />
      ) : (
        <div className="text-center py-12">
          <p className="text-[rgba(234,240,255,0.65)] mb-2">لا توجد بيانات متاحة</p>
          {startDate && endDate && (
            <p className="text-sm text-[rgba(234,240,255,0.45)]">
              للفترة من {new Date(startDate).toLocaleDateString('ar-EG')} إلى {new Date(endDate).toLocaleDateString('ar-EG')}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

export default PerformanceChart;

