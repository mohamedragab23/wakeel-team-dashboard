/**
 * KPI Card Component
 * 
 * Displays a single KPI with trend, comparison, and health indicator.
 * Implements SRS-002 Section 2: KPI Cards.
 * 
 * @module KPICard
 * @version 1.0
 */

import type { KPI } from '@/lib/strategicOps/kpi';
import { formatKPIValue } from '@/lib/strategicOps/kpi/types';
import { getKPIHealthColor } from '@/lib/strategicOps/kpi/integration';

type KPICardProps = {
  kpi: KPI;
  size?: 'small' | 'medium' | 'large';
  showComparison?: boolean;
  onClick?: () => void;
};

export function KPICard({ kpi, size = 'medium', showComparison = true, onClick }: KPICardProps) {
  const { value, format, nameAr, name } = kpi;
  
  // Format values
  const currentFormatted = formatKPIValue(value.current, format);
  const previousFormatted = value.previous !== null ? formatKPIValue(value.previous, format) : null;
  
  // Health color
  const healthColor = getKPIHealthColor(kpi.id, value.current);
  const healthBg = 
    healthColor === 'green' ? 'border-emerald-500/40 bg-emerald-500/5' :
    healthColor === 'yellow' ? 'border-amber-500/40 bg-amber-500/5' :
    'border-red-500/40 bg-red-500/5';
  
  // Trend color
  const trendColor = 
    value.trend === 'up' ? 'text-emerald-400' :
    value.trend === 'down' ? 'text-red-400' :
    'text-gray-400';
  
  // Size classes
  const sizeClasses = {
    small: 'p-3',
    medium: 'p-4',
    large: 'p-5',
  };
  
  const valueSizeClasses = {
    small: 'text-xl',
    medium: 'text-2xl',
    large: 'text-3xl',
  };
  
  return (
    <div
      className={`rounded-xl border ${healthBg} backdrop-blur-sm transition-all hover:scale-102 ${sizeClasses[size]} ${onClick ? 'cursor-pointer hover:border-white/20' : ''}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="text-xs text-gray-400 mb-1">{kpi.id}</p>
          <h3 className="text-sm font-semibold text-white leading-tight">{nameAr}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{name}</p>
        </div>
        
        {/* Trend Arrow */}
        {showComparison && value.growthPercent !== null && (
          <div className={`text-lg ${trendColor}`}>
            {value.trendArrow}
          </div>
        )}
      </div>
      
      {/* Main Value */}
      <div className="mt-3">
        <p className={`${valueSizeClasses[size]} font-bold text-white`}>
          {currentFormatted}
        </p>
      </div>
      
      {/* Comparison */}
      {showComparison && value.previous !== null && (
        <div className="mt-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">السابق:</span>
            <span className="text-gray-300">{previousFormatted}</span>
          </div>
          
          {value.difference !== null && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-400">الفرق:</span>
              <span className={trendColor}>
                {value.difference > 0 ? '+' : ''}{value.difference.toFixed(1)}
                {value.growthPercent !== null && ` (${value.growthPercent.toFixed(1)}%)`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * KPI Cards Grid
 * Displays multiple KPI cards in a responsive grid
 */
type KPICardsGridProps = {
  kpis: KPI[];
  columns?: 2 | 3 | 4 | 5;
  size?: 'small' | 'medium' | 'large';
  showComparison?: boolean;
  onKPIClick?: (kpi: KPI) => void;
};

export function KPICardsGrid({ 
  kpis, 
  columns = 4, 
  size = 'medium',
  showComparison = true,
  onKPIClick 
}: KPICardsGridProps) {
  const gridCols = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  };
  
  return (
    <div className={`grid ${gridCols[columns]} gap-4`}>
      {kpis.map((kpi) => (
        <KPICard
          key={kpi.id}
          kpi={kpi}
          size={size}
          showComparison={showComparison}
          onClick={onKPIClick ? () => onKPIClick(kpi) : undefined}
        />
      ))}
    </div>
  );
}

/**
 * KPI Category Section
 * Groups KPIs by category with title
 */
type KPICategorySectionProps = {
  title: string;
  titleAr: string;
  kpis: KPI[];
  columns?: 2 | 3 | 4 | 5;
  defaultExpanded?: boolean;
};

export function KPICategorySection({ 
  title, 
  titleAr, 
  kpis,
  columns = 4,
  defaultExpanded = true 
}: KPICategorySectionProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between mb-4 hover:opacity-80 transition-opacity"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h2 className="text-lg font-semibold text-white text-right">{titleAr}</h2>
          <p className="text-sm text-gray-400 text-right">{title}</p>
        </div>
        <span className="text-xl text-gray-400">
          {expanded ? '▼' : '►'}
        </span>
      </button>
      
      {/* Content */}
      {expanded && (
        <KPICardsGrid kpis={kpis} columns={columns} />
      )}
    </div>
  );
}

// React import (needed for useState)
import React from 'react';
