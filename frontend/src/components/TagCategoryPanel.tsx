import React from 'react';
import '../styles/TagCategoryPanel.css';

interface TagCategoryPanelProps {
  // Empty for now - will be extended later
}

interface TagNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  terminal: boolean;
}

interface Connection {
  id: string;
  source: string;
  target: string;
  path: string;
}

const TagCategoryPanel: React.FC<TagCategoryPanelProps> = () => {
  // Helper function to create smooth curve between nodes
  const curve = (x1: number, y1: number, x2: number, y2: number): string => {
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  };

  // Define tag nodes with positions
  const nodes: TagNode[] = [
    // Feature splitting stage
    { id: 'feature-splitting', label: 'feature splitting', x: 30, y: 45, width: 120, height: 30, terminal: true },
    { id: 'no-feature-splitting', label: 'No feature splitting', x: 30, y: 85, width: 130, height: 30, terminal: false },

    // Quality stage
    { id: 'well-explained', label: 'well-explained', x: 230, y: 45, width: 110, height: 30, terminal: true },
    { id: 'need-revision', label: 'need revision', x: 230, y: 85, width: 100, height: 30, terminal: false },

    // Cause stage
    { id: 'noisy-example', label: 'noisy activating example', x: 420, y: 30, width: 160, height: 30, terminal: true },
    { id: 'missed-context', label: 'missed context', x: 420, y: 70, width: 110, height: 30, terminal: true },
    { id: 'missed-lexicon', label: 'missed lexicon', x: 420, y: 110, width: 105, height: 30, terminal: true }
  ];

  // Define connections with smooth curves
  const connections: Connection[] = [
    // From "No feature splitting" to Quality stage (to both tags)
    {
      id: 'nofs-to-well',
      source: 'no-feature-splitting',
      target: 'well-explained',
      path: curve(30 + 130, 85 + 15, 230, 45 + 15)
    },
    {
      id: 'nofs-to-need',
      source: 'no-feature-splitting',
      target: 'need-revision',
      path: curve(30 + 130, 85 + 15, 230, 85 + 15)
    },

    // From "need revision" to all Cause tags
    {
      id: 'need-to-noisy',
      source: 'need-revision',
      target: 'noisy-example',
      path: curve(230 + 100, 85 + 15, 420, 30 + 15)
    },
    {
      id: 'need-to-context',
      source: 'need-revision',
      target: 'missed-context',
      path: curve(230 + 100, 85 + 15, 420, 70 + 15)
    },
    {
      id: 'need-to-lexicon',
      source: 'need-revision',
      target: 'missed-lexicon',
      path: curve(230 + 100, 85 + 15, 420, 110 + 15)
    }
  ];

  // Stage headers with positions
  const stageHeaders = [
    { label: 'FEATURE SPLITTING', x: 90, y: 20 },
    { label: 'QUALITY', x: 280, y: 20 },
    { label: 'CAUSE', x: 490, y: 20 }
  ];

  return (
    <div className="tag-category-panel">
      <svg viewBox="0 0 600 160" preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Arrow marker - gray */}
          <marker
            id="arrow-gray-tag"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" opacity="1.0" />
          </marker>
          {/* Arrow marker - orange for continuation */}
          <marker
            id="arrow-orange-tag"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" opacity="1.0" />
          </marker>
        </defs>

        {/* Stage headers */}
        {stageHeaders.map((header, i) => (
          <text
            key={i}
            x={header.x}
            y={header.y}
            textAnchor="middle"
            fontSize="10"
            fill="#6b7280"
            fontWeight="500"
            letterSpacing="0.5"
          >
            {header.label}
          </text>
        ))}

        {/* Render connections */}
        {connections.map((conn) => {
          const sourceNode = nodes.find(n => n.id === conn.source);
          const isFromNeedRevision = sourceNode?.id === 'need-revision';

          return (
            <path
              key={conn.id}
              d={conn.path}
              fill="none"
              stroke={isFromNeedRevision ? '#f59e0b' : '#94a3b8'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.6"
              markerEnd={isFromNeedRevision ? 'url(#arrow-orange-tag)' : 'url(#arrow-gray-tag)'}
            />
          );
        })}

        {/* Render tag nodes */}
        {nodes.map((node) => {
          const isContinuation = !node.terminal;

          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx="4"
                fill={isContinuation ? '#fef3c7' : '#f8fafc'}
                stroke={isContinuation ? '#fbbf24' : '#cbd5e1'}
                strokeWidth={isContinuation ? '2' : '1.5'}
              />
              <text
                x={node.x + node.width / 2}
                y={node.y + node.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="10"
                fill={isContinuation ? '#92400e' : '#334155'}
                fontWeight="600"
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default TagCategoryPanel;
