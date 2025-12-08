import React, { useMemo, useState, useRef, useLayoutEffect } from 'react';
import {
  getTagCategoriesInOrder,
  getTagColor,
} from '../lib/tag-system';
import { type TagCategoryConfig } from '../lib/constants';
import { useVisualizationStore } from '../store/index';
import FlowPanel from './FlowPanel';
import '../styles/TagStagePanel.css';

interface TagCategoryPanelProps {
  selectedCategory?: string | null;
  onCategoryClick?: (categoryId: string) => void;
}

interface TagNode {
  id: string;
  categoryId: string;
  tag: string;
  color: string;
  count: number;
  stageOrder: number;
}

const TagCategoryPanel: React.FC<TagCategoryPanelProps> = ({
  selectedCategory,
  onCategoryClick
}) => {
  // Help popup state
  const [showHelp, setShowHelp] = useState(false);

  // Refs for SVG flow paths
  const containerRef = useRef<HTMLDivElement>(null);
  const [badgePositions, setBadgePositions] = useState<Record<string, { left: number; right: number; y: number }>>({});

  // Get all stages in order
  const stages = useMemo(() => getTagCategoriesInOrder(), []);

  // Get store getters for consistent counts with SelectionBar
  const getFeatureSplittingCounts = useVisualizationStore(state => state.getFeatureSplittingCounts);
  const getQualityCounts = useVisualizationStore(state => state.getQualityCounts);

  // Subscribe to selection states to trigger re-render when tagging changes
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates);
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates);

  // Get sankeyStructure for threshold-filtered counts (non-selected portion)
  const sankeyStructure = useVisualizationStore(state => state.leftPanel.sankeyStructure);

  // Check if threshold preview is active
  const thresholdVisualization = useVisualizationStore(state => state.thresholdVisualization);
  const isPreviewActive = thresholdVisualization?.visible ?? false;

  // Helper: Get node feature count from sankeyStructure
  const getNodeFeatureCount = (nodeId: string): number => {
    if (!sankeyStructure?.nodes) return 0;
    const node = sankeyStructure.nodes.find((n: any) => n.id === nodeId);
    return node?.featureCount || 0;
  };

  // Helper: Get segment counts from sankeyStructure for a stage
  const getSegmentCounts = (stageNodeId: string): Record<string, number> => {
    if (!sankeyStructure?.nodes) return {};

    const segmentNode = sankeyStructure.nodes.find(n => n.id === stageNodeId);
    if (!segmentNode || segmentNode.type !== 'segment') return {};

    const counts: Record<string, number> = {};
    for (const seg of segmentNode.segments) {
      counts[seg.tagName] = seg.featureCount || 0;
    }
    return counts;
  };

  // Calculate tag counts: selection states + non-selected threshold-filtered features
  const getTagCounts = (category: TagCategoryConfig): Record<string, number> => {
    if (category.id === 'feature_splitting') {
      const fsCounts = getFeatureSplittingCounts();

      // Try segment counts first (stage 1 active), then fixed node counts (stage 2+)
      const segmentCounts = getSegmentCounts('stage1_segment');
      const hasSegments = Object.keys(segmentCounts).length > 0;

      if (hasSegments) {
        // Stage 1 active: use segment counts
        return {
          'Fragmented': fsCounts.fragmented,
          'Monosemantic': fsCounts.monosemantic + (segmentCounts['Monosemantic'] || 0)
        };
      } else {
        // Stage 2+: stage 1 completed, use fixed node counts
        return {
          'Fragmented': fsCounts.fragmented + getNodeFeatureCount('fragmented'),
          'Monosemantic': fsCounts.monosemantic + getNodeFeatureCount('monosemantic')
        };
      }
    }

    if (category.id === 'quality') {
      const qCounts = getQualityCounts();

      // Try segment counts first (stage 2 active), then fixed node counts (stage 3+)
      const segmentCounts = getSegmentCounts('stage2_segment');
      const hasSegments = Object.keys(segmentCounts).length > 0;

      if (hasSegments) {
        // Stage 2 active: use segment counts
        return {
          'Well-Explained': qCounts.wellExplained,
          'Need Revision': qCounts.needRevision + (segmentCounts['Need Revision'] || 0)
        };
      } else {
        // Stage 3+: stage 2 completed, use fixed node counts
        return {
          'Well-Explained': qCounts.wellExplained + getNodeFeatureCount('well_explained'),
          'Need Revision': qCounts.needRevision + getNodeFeatureCount('need_revision')
        };
      }
    }

    // Stage 3 (cause): TODO - use causeSelectionStates when implemented
    const counts: Record<string, number> = {};
    category.tags.forEach((tag) => {
      counts[tag] = 0;
    });
    return counts;
  };

  // Check if a stage is completed (comes before selected stage)
  const isStageCompleted = (stageOrder: number): boolean => {
    if (!selectedCategory) return false;
    const selectedStage = stages.find(s => s.id === selectedCategory);
    return selectedStage ? stageOrder < selectedStage.stageOrder : false;
  };

  // Check if a stage is in the future (comes after selected stage, not yet clicked)
  const isStageFuture = (stageOrder: number): boolean => {
    if (!selectedCategory) return true; // All stages are future if none selected
    const selectedStage = stages.find(s => s.id === selectedCategory);
    return selectedStage ? stageOrder > selectedStage.stageOrder : true;
  };

  // Compute tag counts for ALL stages
  // Combines selection states + threshold-filtered counts from Sankey
  const allTagCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    for (const stage of stages) {
      counts[stage.id] = getTagCounts(stage);
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, getFeatureSplittingCounts, getQualityCounts, pairSelectionStates, featureSelectionStates, sankeyStructure]);

  // Compute tag nodes for each stage
  const nodesByStage = useMemo(() => {
    const grouped: Record<number, TagNode[]> = { 1: [], 2: [], 3: [] };

    for (const stage of stages) {
      if (stage.stageOrder > 3) continue;
      const counts = allTagCounts[stage.id] || {};

      stage.tags.forEach((tag) => {
        // Skip "Well-Explained" in cause category (stage 3)
        if (stage.id === 'cause' && tag === 'Well-Explained') return;

        grouped[stage.stageOrder]?.push({
          id: `${stage.id}:${tag}`,
          categoryId: stage.id,
          tag,
          color: getTagColor(stage.id, tag) || '#94a3b8',
          count: counts[tag] || 0,
          stageOrder: stage.stageOrder,
        });
      });
    }
    return grouped;
  }, [stages, allTagCounts]);

  // Measure badge positions after render
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const positions: Record<string, { left: number; right: number; y: number }> = {};
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();

    container.querySelectorAll('[data-node-id]').forEach((el) => {
      const nodeId = el.getAttribute('data-node-id');
      if (!nodeId) return;
      const rect = el.getBoundingClientRect();
      positions[nodeId] = {
        left: rect.left - containerRect.left,
        right: rect.right - containerRect.left,
        y: rect.top - containerRect.top + rect.height / 2,
      };
    });

    setBadgePositions(positions);
  }, [nodesByStage, allTagCounts]);

  // Generate SVG paths for flow connections (currently unused - for future flow visualization)
  // @ts-expect-error Unused variable kept for future flow visualization feature
  const _svgPaths = useMemo(() => {
    const paths: Array<{
      d: string;
      key: string;
      gradientId: string;
      sourceColor: string;
      targetColor: string;
      x1: number;
      x2: number;
      y1: number;
      y2: number;
    }> = [];

    const stage1 = nodesByStage[1] || [];
    const stage2 = nodesByStage[2] || [];
    const stage3 = nodesByStage[3] || [];

    // Find the Monosemantic node (first node in stage 1)
    const monosematicNode = stage1.find(n => n.tag === 'Monosemantic');

    // Connector 1→2: Monosemantic → Stage 2 tags
    if (monosematicNode && stage2.length > 0) {
      const source = badgePositions[monosematicNode.id];

      if (source) {
        stage2.forEach((target, idx) => {
          const targetPos = badgePositions[target.id];
          if (targetPos) {
            const x1 = source.right;
            const x2 = targetPos.left;
            const midX = (x1 + x2) / 2;
            paths.push({
              key: `c1-${idx}`,
              gradientId: `grad-c1-${idx}`,
              d: `M ${x1} ${source.y} C ${midX} ${source.y}, ${midX} ${targetPos.y}, ${x2} ${targetPos.y}`,
              sourceColor: monosematicNode.color,
              targetColor: target.color,
              x1,
              x2,
              y1: 0,
              y2: 0,
            });
          }
        });
      }
    }

    // Connector 2→3: Need Revision → Stage 3 tags
    const needRevisionNode = stage2.find(n => n.tag === 'Need Revision');
    if (needRevisionNode && stage3.length > 0) {
      const source = badgePositions[needRevisionNode.id];

      if (source) {
        stage3.forEach((target, idx) => {
          const targetPos = badgePositions[target.id];
          if (targetPos) {
            const x1 = source.right;
            const x2 = targetPos.left;
            const midX = (x1 + x2) / 2;
            paths.push({
              key: `c2-${idx}`,
              gradientId: `grad-c2-${idx}`,
              d: `M ${x1} ${source.y} C ${midX} ${source.y}, ${midX} ${targetPos.y}, ${x2} ${targetPos.y}`,
              sourceColor: needRevisionNode.color,
              targetColor: target.color,
              x1,
              x2,
              y1: 0,
              y2: 0,
            });
          }
        });
      }
    }

    // Special connector: Need Revision → Well-Explained (within Stage 2)
    const wellExplainedNode = stage2.find(n => n.tag === 'Well-Explained');
    if (needRevisionNode && wellExplainedNode) {
      const sourcePos = badgePositions[needRevisionNode.id];
      const targetPos = badgePositions[wellExplainedNode.id];

      if (sourcePos && targetPos) {
        const x1 = sourcePos.right;
        const x2 = targetPos.right;
        const controlOffset = 40;
        paths.push({
          key: 'c-need-to-well',
          gradientId: 'grad-need-to-well',
          d: `M ${x1} ${sourcePos.y} C ${x1 + controlOffset} ${sourcePos.y}, ${x2 + controlOffset} ${targetPos.y}, ${x2} ${targetPos.y}`,
          sourceColor: needRevisionNode.color,
          targetColor: wellExplainedNode.color,
          x1: 0,
          x2: 0,
          y1: sourcePos.y,
          y2: targetPos.y,
        });
      }
    }

    return paths;
  }, [badgePositions, nodesByStage]);

  // Get activateCategoryTable action from store
  const activateCategoryTable = useVisualizationStore(state => state.activateCategoryTable);

  // Handle stage click
  const handleStageClick = (categoryId: string) => {
    // Disable clicking when threshold preview is active
    if (isPreviewActive) return;

    // Activate the category table (this will also set the selected node)
    activateCategoryTable(categoryId);

    // Also notify parent component if callback provided
    if (onCategoryClick) {
      onCategoryClick(categoryId);
    }
  };

  return (
    <div className="tag-category-panel" ref={containerRef}>
      {/* Help button */}
      <button
        className="tag-category-panel__help-button"
        onClick={() => setShowHelp(true)}
        title="Show data flow diagram"
      >
        ?
      </button>

      {/* Help popup */}
      {showHelp && (
        <div className="tag-category-panel__help-overlay" onClick={() => setShowHelp(false)}>
          <div className="tag-category-panel__help-popup" onClick={(e) => e.stopPropagation()}>
            <button
              className="tag-category-panel__help-close"
              onClick={() => setShowHelp(false)}
            >
              ×
            </button>
            <FlowPanel />
          </div>
        </div>
      )}

      {/* TODO: Flow lines between tags - trying different visualization methods
      <svg className="tag-category-panel__flow-svg">
        <defs>
          {_svgPaths.map(({ gradientId, sourceColor, targetColor, x1, x2, y1, y2 }) => (
            <linearGradient
              key={gradientId}
              id={gradientId}
              x1={x1}
              x2={x2}
              y1={y1}
              y2={y2}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={sourceColor} />
              <stop offset="100%" stopColor={targetColor} />
            </linearGradient>
          ))}
        </defs>
        {_svgPaths.map(({ key, d, gradientId }) => (
          <path
            key={key}
            d={d}
            className="tag-category-panel__flow-path"
            stroke={`url(#${gradientId})`}
          />
        ))}
      </svg>
      */}

      {/* Main content: Stage tabs with inline tags */}
      <div className="tag-category-panel__main-content">
        {stages.map((stage) => {
          const isActive = selectedCategory === stage.id;
          const isCompleted = isStageCompleted(stage.stageOrder);
          const isFuture = isStageFuture(stage.stageOrder);
          const stageTags = nodesByStage[stage.stageOrder] || [];

          return (
            <React.Fragment key={stage.id}>
              {/* Stage Tab */}
              <button
                className={`stage-tab ${
                  isActive ? 'stage-tab--active' : ''
                } ${
                  isCompleted ? 'stage-tab--completed' : ''
                } ${
                  isFuture ? 'stage-tab--future' : ''
                } ${
                  isPreviewActive ? 'stage-tab--disabled' : ''
                }`}
                onClick={() => handleStageClick(stage.id)}
                disabled={isPreviewActive}
                title={isPreviewActive ? "Close threshold preview to switch stages" : stage.description}
              >
                <div className="stage-tab__header">
                  <div className="stage-tab__number">
                    {isCompleted ? '✓' : stage.stageOrder}
                  </div>
                  <div className="stage-tab__label">{stage.label}</div>
                </div>
                <div className="stage-tab__instruction">{stage.instruction}</div>
              </button>

              {/* Inline Tags for this stage */}
              <div className={`stage-tags ${isActive ? 'stage-tags--active' : ''} ${isCompleted ? 'stage-tags--completed' : ''} ${isFuture ? 'stage-tags--future' : ''}`}>
                {stageTags.map((node) => (
                  <div
                    key={node.id}
                    data-node-id={node.id}
                    className={`stage-tag-badge ${isActive ? 'stage-tag-badge--active' : ''}`}
                    style={{ backgroundColor: node.color, borderColor: node.color }}
                    title={`${node.tag}: ${node.count.toLocaleString()} features`}
                  >
                    <span className="stage-tag-badge__label">{node.tag}</span>
                    <span className="stage-tag-badge__count">{node.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default TagCategoryPanel;
