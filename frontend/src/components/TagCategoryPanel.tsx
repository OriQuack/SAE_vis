import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  getTagCategoriesInOrder,
  type TagCategoryConfig
} from '../lib/tag-categories';
import { useVisualizationStore } from '../store/index';
import type { SankeyTreeNode } from '../types';
import '../styles/TagCategoryPanel.css';

interface TagCategoryPanelProps {
  selectedCategory?: string | null;
  onCategoryClick?: (categoryId: string) => void;
}

const TagCategoryPanel: React.FC<TagCategoryPanelProps> = ({
  selectedCategory,
  onCategoryClick
}) => {
  // Get all stages in order
  const stages = useMemo(() => getTagCategoriesInOrder(), []);

  // Stage instructions mapping
  const stageInstructions: Record<string, string> = {
    'feature_splitting': 'Single or multiple concepts?',
    'quality': 'Rate explanation quality',
    'cause': 'Identify root cause'
  };

  // Get sankeyTree from left panel for color mapping
  const sankeyTree = useVisualizationStore(state => state.leftPanel.sankeyTree);

  // Helper function to get tag color from Sankey tree
  const getTagColor = (stageId: string, tagIndex: number): string | null => {
    if (!sankeyTree || sankeyTree.size === 0) {
      console.log('[TagCategoryPanel.getTagColor] No sankeyTree available');
      return null;
    }

    // Find the stage configuration
    const stage = stages.find(s => s.id === stageId);
    if (!stage) {
      console.log('[TagCategoryPanel.getTagColor] Stage not found:', stageId);
      return null;
    }

    // Get expected depth for this stage
    const targetDepth = stage.stageOrder;

    console.log('[TagCategoryPanel.getTagColor] Looking for color:', {
      stageId,
      tagIndex,
      targetDepth,
      metric: stage.metric,
      treeSize: sankeyTree.size
    });

    // Debug: log all nodes
    console.log('[TagCategoryPanel.getTagColor] All tree nodes:');
    for (const [nodeId, node] of sankeyTree.entries()) {
      console.log('  -', nodeId, '| depth:', node.depth, '| metric:', node.metric, '| color:', node.colorHex);
    }

    // Find matching nodes in the tree
    // Strategy: look for nodes at the target depth whose ID contains the group index
    const groupSuffix = `_group${tagIndex}`;

    for (const [nodeId, node] of sankeyTree.entries()) {
      // Check if node is at the right depth
      if (node.depth !== targetDepth) continue;

      console.log('[TagCategoryPanel.getTagColor] Found node at target depth:', nodeId, 'checking suffix:', groupSuffix);

      // Check if node ID ends with the group suffix we're looking for
      if (nodeId.endsWith(groupSuffix)) {
        console.log('[TagCategoryPanel.getTagColor] Node ID matches suffix!');
        // If stage has a metric, verify the node uses that metric
        if (stage.metric) {
          console.log('[TagCategoryPanel.getTagColor] Checking metric:', node.metric, 'vs', stage.metric);
          if (node.metric === stage.metric) {
            console.log('[TagCategoryPanel.getTagColor] ✅ MATCH! Returning color:', node.colorHex);
            return node.colorHex || null;
          }
        } else {
          // For pre-defined categories (like Cause), just match by group index
          console.log('[TagCategoryPanel.getTagColor] ✅ MATCH (no metric check)! Returning color:', node.colorHex);
          return node.colorHex || null;
        }
      }
    }

    console.log('[TagCategoryPanel.getTagColor] ❌ No matching node found');
    return null;
  };

  // Refs for flow line positioning
  const monosematicCountRef = useRef<HTMLSpanElement>(null);
  const needRevisionCountRef = useRef<HTMLSpanElement>(null);
  const stage2IndicatorRef = useRef<HTMLDivElement>(null);
  const stage3IndicatorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // State for flow paths
  const [flowPaths, setFlowPaths] = useState({ path1: '', path2: '' });

  // Get selected node feature count from store for dynamic counts
  // Use a stable selector that doesn't create new objects
  const featureCount = useVisualizationStore(
    state => {
      // Get the root node from left panel
      const leftPanel = state.leftPanel;
      if (!leftPanel?.sankeyTree) return 0;

      // Get root node feature count
      const rootNode = leftPanel.sankeyTree.get('root');
      return rootNode?.featureCount ?? 0;
    }
  );

  // Calculate dynamic tag counts based on filtered features
  const getTagCounts = (category: TagCategoryConfig): Record<string, number> => {
    // TODO: Implement actual tag counting logic
    // For now, return placeholder counts based on total feature count
    const counts: Record<string, number> = {};
    const baseCount = featureCount > 0 ? Math.floor(featureCount / category.tags.length) : 50;

    category.tags.forEach((tag, index) => {
      // Placeholder: distribute counts across tags
      counts[tag] = baseCount + index * 10;
    });
    return counts;
  };

  // Check if a stage is completed (comes before selected stage)
  const isStageCompleted = (stageOrder: number): boolean => {
    if (!selectedCategory) return false;
    const selectedStage = stages.find(s => s.id === selectedCategory);
    return selectedStage ? stageOrder < selectedStage.stageOrder : false;
  };

  // Handle stage click
  const handleStageClick = (categoryId: string) => {
    if (onCategoryClick) {
      onCategoryClick(categoryId);
    }
  };

  // Calculate flow paths
  const calculateFlowPaths = () => {
    if (!monosematicCountRef.current || !needRevisionCountRef.current ||
        !stage2IndicatorRef.current || !stage3IndicatorRef.current ||
        !panelRef.current) {
      return;
    }

    const panelRect = panelRef.current.getBoundingClientRect();

    // Get positions relative to panel
    const monoCount = monosematicCountRef.current.getBoundingClientRect();
    const needRevCount = needRevisionCountRef.current.getBoundingClientRect();
    const stage2 = stage2IndicatorRef.current.getBoundingClientRect();
    const stage3 = stage3IndicatorRef.current.getBoundingClientRect();

    // Helper to create tapered ribbon path
    const createRibbon = (
      x1: number, y1: number, x2: number, y2: number, width: number
    ) => {
      const dx = x2 - x1;

      const startWidth = width;
      const endWidth = width * 0.3; // Taper to 30%

      // Control points for Bezier curve
      const cx1 = x1 + dx * 0.5;
      const cy1 = y1;
      const cx2 = x1 + dx * 0.5;
      const cy2 = y2;

      // Simplified tapered path
      return `M ${x1},${y1 - startWidth/2}
              C ${cx1},${cy1 - startWidth/2} ${cx2},${cy2 - endWidth/2} ${x2},${y2 - endWidth/2}
              L ${x2},${y2 + endWidth/2}
              C ${cx2},${cy2 + endWidth/2} ${cx1},${cy1 + startWidth/2} ${x1},${y1 + startWidth/2}
              Z`;
    };

    // Flow 1: monosemantic count badge → stage 2 indicator
    const x1_1 = monoCount.left + monoCount.width;
    const y1_1 = monoCount.top + monoCount.height / 2 - panelRect.top;
    const x2_1 = stage2.left - panelRect.left;
    const y2_1 = stage2.top + stage2.height / 2 - panelRect.top;

    // Flow 2: need revision count badge → stage 3 indicator
    const x1_2 = needRevCount.left + needRevCount.width;
    const y1_2 = needRevCount.top + needRevCount.height / 2 - panelRect.top;
    const x2_2 = stage3.left - panelRect.left;
    const y2_2 = stage3.top + stage3.height / 2 - panelRect.top;

    setFlowPaths({
      path1: createRibbon(x1_1, y1_1, x2_1, y2_1, 6),
      path2: createRibbon(x1_2, y1_2, x2_2, y2_2, 6)
    });
  };

  // Update flow paths on mount and resize
  useEffect(() => {
    calculateFlowPaths();

    const observer = new ResizeObserver(calculateFlowPaths);
    if (panelRef.current) {
      observer.observe(panelRef.current);
    }

    return () => observer.disconnect();
  }, [stages, selectedCategory]);

  return (
    <div className="tag-category-panel" ref={panelRef}>
      <div className="tag-category-panel__content">
        {/* Left: Stage buttons and instructions */}
        <div className="tag-category-panel__stages">
          <div className="tag-category-panel__stages-buttons">
            {stages.map((stage) => {
              const isActive = selectedCategory === stage.id;
              const isCompleted = isStageCompleted(stage.stageOrder);

              return (
                <button
                  key={stage.id}
                  className={`tag-category-panel__stage-button ${
                    isActive ? 'tag-category-panel__stage-button--active' : ''
                  } ${
                    isCompleted ? 'tag-category-panel__stage-button--completed' : ''
                  }`}
                  onClick={() => handleStageClick(stage.id)}
                  title={stage.description}
                >
                  <span className="stage-number">
                    {isCompleted ? '✓' : stage.stageOrder}
                  </span>
                  <span className="stage-name">{stage.label}</span>
                </button>
              );
            })}
          </div>

          {/* Stage instructions below buttons */}
          <div className="tag-category-panel__stages-instructions">
            {stages.map((stage) => {
              const isActive = selectedCategory === stage.id;

              return (
                <div
                  key={`instruction-${stage.id}`}
                  className={`stage-instruction ${
                    isActive ? 'stage-instruction--active' : ''
                  }`}
                >
                  {stageInstructions[stage.id]}
                </div>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="tag-category-panel__divider" />

        {/* Middle: All tags flowing horizontally, each stage's tags stacked vertically */}
        <div className="tag-category-panel__tags-area">
          {stages.map((stage) => {
            const isActive = selectedCategory === stage.id;
            const isCompleted = isStageCompleted(stage.stageOrder);
            const tagCounts = getTagCounts(stage);
            const isCauseStage = stage.id === 'cause';

            return (
              <div
                key={stage.id}
                className={`tag-category-panel__stage-container ${
                  isActive ? 'tag-category-panel__stage-container--active' : ''
                } ${
                  isCompleted ? 'tag-category-panel__stage-container--completed' : ''
                }`}
              >
                {/* Stage number indicator */}
                <div
                  className="tag-category-panel__stage-indicator"
                  ref={stage.stageOrder === 2 ? stage2IndicatorRef :
                       stage.stageOrder === 3 ? stage3IndicatorRef : null}
                >
                  {isCompleted ? '✓' : stage.stageOrder}
                </div>

                {/* Tags column */}
                <div
                  className={`tag-category-panel__tag-column ${
                    isCauseStage ? 'tag-category-panel__tag-column--grid' : ''
                  }`}
                >
                  {stage.tags.map((tag, tagIndex) => {
                    const isMonosemantic = stage.id === 'feature_splitting' && tag === 'monosemantic';
                    const isNeedRevision = stage.id === 'quality' && tag === 'need revision';

                    // Get color from Sankey tree
                    const color = getTagColor(stage.id, tagIndex);
                    const fallbackColor = '#94a3b8'; // Neutral grey
                    const tagColor = color || fallbackColor;

                    // Create style object for dynamic coloring
                    const tagStyle = {
                      borderLeftColor: tagColor,
                      backgroundColor: `${tagColor}14` // 8% opacity (14 in hex)
                    };

                    const countStyle = {
                      backgroundColor: tagColor,
                      color: 'white'
                    };

                    return (
                      <span
                        key={tag}
                        className="tag-badge"
                        style={tagStyle}
                        title={`${tag}: ${tagCounts[tag]} features`}
                      >
                        <span className="tag-badge__label">{tag}</span>
                        <span
                          className="tag-badge__count"
                          style={countStyle}
                          ref={isMonosemantic ? monosematicCountRef :
                               isNeedRevision ? needRevisionCountRef : null}
                        >
                          {tagCounts[tag] || 0}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Action buttons */}
        <div className="tag-category-panel__actions">
          <button
            className="action-button"
            disabled
            title="Regenerate tag assignments (coming soon)"
          >
            Regenerate
          </button>
          <button
            className="action-button"
            disabled
            title="Export tag data (coming soon)"
          >
            Export
          </button>
        </div>
      </div>

      {/* Flow overlay */}
      {flowPaths.path1 && flowPaths.path2 && (() => {
        const flow1Active = selectedCategory === 'quality';
        const flow2Active = selectedCategory === 'cause';

        return (
          <svg className="tag-flow-overlay">
            <defs>
              <filter id="flow-glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <path
              className={`tag-flow-path ${flow1Active ? 'tag-flow-path--active' : ''}`}
              d={flowPaths.path1}
              data-flow="monosemantic-to-stage2"
            />
            <path
              className={`tag-flow-path ${flow2Active ? 'tag-flow-path--active' : ''}`}
              d={flowPaths.path2}
              data-flow="needrevision-to-stage3"
            />
          </svg>
        );
      })()}
    </div>
  );
};

export default TagCategoryPanel;
