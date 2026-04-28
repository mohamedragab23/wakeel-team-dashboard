'use client';

import dynamic from 'next/dynamic';

// Use dynamic import for better code splitting
const RechartsComponents = dynamic(
  () =>
    import('recharts').then((mod) => ({
      default: function RechartsWrapper({ data, dataKeys, colors }: any) {
        const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = mod;
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              {dataKeys.map((key: string, index: number) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      },
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    ),
  }
);

interface ChartData {
  name: string;
  [key: string]: any;
}

interface LazyChartProps {
  data: ChartData[];
  dataKeys: string[];
  colors?: string[];
}

export default function LazyChart({ data, dataKeys, colors = ['#3b82f6', '#10b981'] }: LazyChartProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100 min-w-0 overflow-hidden text-[#1e1e2f]">
      <RechartsComponents data={data} dataKeys={dataKeys} colors={colors} />
    </div>
  );
}

