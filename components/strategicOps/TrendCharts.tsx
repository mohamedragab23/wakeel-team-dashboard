/**
 * Trend Chart Components
 * 
 * Line and bar charts for visualizing KPI trends over time.
 * Implements SRS-002 Section 3: Trend Analysis.
 * 
 * @module TrendCharts
 * @version 1.0
 */

import { Line, LineChart, Bar, BarChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

type TrendDataPoint = {
  date: string;
  value: number;
  label?: string;
};

type TrendChartProps = {
  data: TrendDataPoint[];
  title: string;
  titleAr: string;
  valueLabel: string;
  valueLabelAr: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  type?: 'line' | 'bar';
};

export function TrendChart({
  data,
  title,
  titleAr,
  valueLabel,
  valueLabelAr,
  color = '#3b82f6',
  height = 300,
  showGrid = true,
  type = 'line',
}: TrendChartProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{titleAr}</h3>
        <p className="text-sm text-gray-400">{title}</p>
      </div>
      
      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        {type === 'line' ? (
          <LineChart data={data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />}
            <XAxis 
              dataKey="date" 
              stroke="#94A3B8"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#94A3B8"
              style={{ fontSize: '12px' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ fill: color, r: 4 }}
              name={valueLabelAr}
            />
          </LineChart>
        ) : (
          <BarChart data={data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />}
            <XAxis 
              dataKey="date" 
              stroke="#94A3B8"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#94A3B8"
              style={{ fontSize: '12px' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#fff',
              }}
            />
            <Legend />
            <Bar
              dataKey="value"
              fill={color}
              name={valueLabelAr}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10">
        <div className="text-center">
          <p className="text-xs text-gray-400">الحد الأدنى</p>
          <p className="text-sm font-semibold text-white">
            {Math.min(...data.map(d => d.value)).toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">المتوسط</p>
          <p className="text-sm font-semibold text-white">
            {(data.reduce((sum, d) => sum + d.value, 0) / data.length).toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">الحد الأقصى</p>
          <p className="text-sm font-semibold text-white">
            {Math.max(...data.map(d => d.value)).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Multi-Line Trend Chart
 * Compare multiple metrics on the same chart
 */
type MultiLineTrendChartProps = {
  data: Array<Record<string, any>>;
  title: string;
  titleAr: string;
  lines: Array<{
    dataKey: string;
    name: string;
    nameAr: string;
    color: string;
  }>;
  height?: number;
};

export function MultiLineTrendChart({
  data,
  title,
  titleAr,
  lines,
  height = 350,
}: MultiLineTrendChartProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{titleAr}</h3>
        <p className="text-sm text-gray-400">{title}</p>
      </div>
      
      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
          <XAxis 
            dataKey="date" 
            stroke="#94A3B8"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#94A3B8"
            style={{ fontSize: '12px' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#fff',
            }}
          />
          <Legend />
          {lines.map(line => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              stroke={line.color}
              strokeWidth={2}
              dot={{ fill: line.color, r: 3 }}
              name={line.nameAr}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Trend Summary Component
 * Shows trend direction and change percentage
 */
type TrendSummaryProps = {
  current: number;
  previous: number;
  label: string;
  labelAr: string;
  format?: 'number' | 'percent' | 'decimal';
};

export function TrendSummary({
  current,
  previous,
  label,
  labelAr,
  format = 'number',
}: TrendSummaryProps) {
  const change = current - previous;
  const changePercent = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
  const isPositive = change > 0;
  const isNeutral = Math.abs(changePercent) < 1;
  
  const trendColor = isNeutral 
    ? 'text-gray-400' 
    : isPositive 
      ? 'text-emerald-400' 
      : 'text-red-400';
  
  const trendBg = isNeutral
    ? 'bg-gray-500/10 border-gray-500/20'
    : isPositive
      ? 'bg-emerald-500/10 border-emerald-500/20'
      : 'bg-red-500/10 border-red-500/20';
  
  const formatValue = (val: number) => {
    switch (format) {
      case 'percent':
        return `${val.toFixed(1)}%`;
      case 'decimal':
        return val.toFixed(2);
      case 'number':
      default:
        return Math.round(val).toLocaleString();
    }
  };
  
  return (
    <div className={`rounded-lg border ${trendBg} p-3`}>
      <p className="text-xs text-gray-400 mb-1">{labelAr}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-white">{formatValue(current)}</p>
        <div className={`text-sm ${trendColor} flex items-center gap-1`}>
          <span>{isNeutral ? '→' : isPositive ? '↑' : '↓'}</span>
          <span>{Math.abs(changePercent).toFixed(1)}%</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        السابق: {formatValue(previous)}
      </p>
    </div>
  );
}
