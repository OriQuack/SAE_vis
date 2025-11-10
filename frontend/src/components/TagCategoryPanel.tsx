import React, { useState } from 'react';
import {
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_CAUSE
} from '../lib/tag-categories';
import '../styles/TagCategoryPanel.css';

interface TagCategoryPanelProps {
  selectedCategory?: string | null;
  onCategoryClick?: (categoryId: string) => void;
}

const TagCategoryPanel: React.FC<TagCategoryPanelProps> = ({
  selectedCategory,
  onCategoryClick
}) => {
  // Track hover state for visual feedback
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  // Three circles with stage labels and interactive properties
  const stages = [
    {
      label: 'FEATURE SPLITTING',
      categoryId: TAG_CATEGORY_FEATURE_SPLITTING,
      cx: 150,
      cy: 65,
      enabled: true  // Clickable
    },
    {
      label: 'QUALITY',
      categoryId: TAG_CATEGORY_QUALITY,
      cx: 500,
      cy: 65,
      enabled: true  // Clickable
    },
    {
      label: 'CAUSE',
      categoryId: TAG_CATEGORY_CAUSE,
      cx: 850,
      cy: 65,
      enabled: false  // Disabled (future implementation)
    }
  ];

  const circleRadius = 25;

  // Get circle visual state based on selection and hover
  const getCircleStyle = (stage: typeof stages[0], stageIndex: number) => {
    const isSelected = selectedCategory === stage.categoryId;
    const isHovered = hoveredCategory === stage.categoryId && stage.enabled;

    // Find the index of the selected stage
    const selectedStageIndex = stages.findIndex(s => s.categoryId === selectedCategory);

    // Check if this stage is "below" (comes before) the selected stage
    const isBeforeSelected = selectedStageIndex !== -1 && stageIndex < selectedStageIndex;

    if (isSelected) {
      // Selected state: Blue fill with bold stroke
      return {
        fill: '#3b82f6',  // blue-500
        stroke: '#2563eb',  // blue-600
        strokeWidth: '3',
        cursor: stage.enabled ? 'pointer' : 'not-allowed'
      };
    } else if (isBeforeSelected) {
      // Stage is before the selected stage: Make it blue too
      return {
        fill: '#3b82f6',  // blue-500
        stroke: '#2563eb',  // blue-600
        strokeWidth: '2',
        cursor: stage.enabled ? 'pointer' : 'not-allowed'
      };
    } else if (isHovered) {
      // Hover state: Light blue fill
      return {
        fill: '#eff6ff',  // blue-50
        stroke: '#cbd5e1',  // slate-300
        strokeWidth: '2',
        cursor: 'pointer'
      };
    } else if (!stage.enabled) {
      // Disabled state: Grayed out
      return {
        fill: '#f1f5f9',  // slate-100
        stroke: '#cbd5e1',  // slate-300
        strokeWidth: '2',
        opacity: '0.5',
        cursor: 'not-allowed'
      };
    } else {
      // Default state
      return {
        fill: '#f8fafc',  // slate-50
        stroke: '#cbd5e1',  // slate-300
        strokeWidth: '2',
        cursor: 'pointer'
      };
    }
  };

  // Handle circle click
  const handleCircleClick = (stage: typeof stages[0]) => {
    if (stage.enabled && onCategoryClick) {
      console.log('[TagCategoryPanel] Category clicked:', stage.categoryId);
      onCategoryClick(stage.categoryId);
    }
  };

  return (
    <div className="tag-category-panel">
      <svg viewBox="0 0 1000 110" preserveAspectRatio="xMidYMid meet">
        {/* Connection lines between circles */}
        <line
          x1={stages[0].cx + circleRadius}
          y1={stages[0].cy}
          x2={stages[1].cx - circleRadius}
          y2={stages[1].cy}
          stroke="#cbd5e1"
          strokeWidth="3"
        />
        <line
          x1={stages[1].cx + circleRadius}
          y1={stages[1].cy}
          x2={stages[2].cx - circleRadius}
          y2={stages[2].cy}
          stroke="#cbd5e1"
          strokeWidth="3"
        />

        {/* Render circles and labels */}
        {stages.map((stage, i) => {
          const style = getCircleStyle(stage, i);

          return (
            <g key={i}>
              {/* Stage label above circle */}
              <text
                x={stage.cx}
                y={stage.cy - circleRadius - 15}
                textAnchor="middle"
                fontSize="18"
                fill="#6b7280"
                fontWeight="600"
                letterSpacing="0.5"
              >
                {stage.label}
              </text>

              {/* Circle with interactive styling */}
              <circle
                cx={stage.cx}
                cy={stage.cy}
                r={circleRadius}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                opacity={style.opacity || '1'}
                style={{ cursor: style.cursor }}
                onClick={() => handleCircleClick(stage)}
                onMouseEnter={() => stage.enabled && setHoveredCategory(stage.categoryId)}
                onMouseLeave={() => setHoveredCategory(null)}
              />
            </g>
          );
        })}
      </svg>
      <div style={{
        position: 'absolute',
        bottom: '0px',
        right: '10px',
        display: 'flex',
        gap: '4px'
      }}>
        <button
          disabled
          style={{
            padding: '0px 6px',
            fontSize: '10px',
            backgroundColor: '#3b82f6', // blue-500
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            opacity: 0.5,
            cursor: 'not-allowed',
          }}
        >
          Regenerate
        </button>
        <button
          disabled
          style={{
            padding: '1px 6px',
            fontSize: '10px',
            backgroundColor: '#3b82f6', // blue-500
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            opacity: 0.5,
            cursor: 'not-allowed',
          }}
        >
          Export
        </button>
      </div>
    </div>
  );
};

export default TagCategoryPanel;
