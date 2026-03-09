import React, { useMemo, useState } from 'react';
import {
  getTagCategoriesInOrder,
  getTagColor,
} from '../lib/tag-system';
import { type TagCategoryConfig, TAG_CATEGORY_REGENERATION } from '../lib/constants';
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

/** Flow annotations for all stages: prefix (A: Yes/No), terminal/suffix for flow indicators */
const FLOW_ANNOTATIONS: Record<string, { prefix?: string; terminal?: boolean; suffix?: string }> = {
  'Monosemantic':          { prefix: 'A: Yes', suffix: 'To next stage →' },
  'Incoherent Splitting':  { prefix: 'A: No', terminal: true },
  'Well-Explained':        { prefix: 'A: Yes', terminal: true },
  'Need Revision':         { prefix: 'A: No', suffix: 'To next stage →' },
  'Missed Syntax':         { prefix: 'A:', terminal: true },
  'Missed Context':        { prefix: 'A:', terminal: true },
  'Noisy Activation':      { prefix: 'A:', terminal: true },
};

const TagCategoryPanel: React.FC<TagCategoryPanelProps> = ({
  selectedCategory,
  onCategoryClick
}) => {
  // Help popup state
  const [showHelp, setShowHelp] = useState(false);

  // // Refs for SVG flow paths
  // const containerRef = useRef<HTMLDivElement>(null);
  // const [badgePositions, setBadgePositions] = useState<Record<string, { left: number; right: number; y: number }>>({});

  // Get all stages in order
  const stages = useMemo(() => getTagCategoriesInOrder().filter(s => s.id !== TAG_CATEGORY_REGENERATION), []);

  // Get store getters for consistent counts with SelectionBar
  const getFeatureSplittingCounts = useVisualizationStore(state => state.getFeatureSplittingCounts);
  const getQualityCounts = useVisualizationStore(state => state.getQualityCounts);
  const getCauseCounts = useVisualizationStore(state => state.getCauseCounts);

  // Subscribe to selection states to trigger re-render when tagging changes
  const pairSelectionStates = useVisualizationStore(state => state.pairSelectionStates);
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates);
  const causeSelectionStates = useVisualizationStore(state => state.causeSelectionStates);

  // Get sankeyStructure for threshold-filtered counts (auto-considered features)
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

  /**
   * Calculate tag counts with hierarchical structure:
   * - Below threshold (continuation tag) = explicitly tagged + ALL features in segment (auto-considered)
   * - Above threshold (terminal tag) = ONLY explicitly tagged
   */
  const getTagCounts = (category: TagCategoryConfig): Record<string, number> => {
    if (category.id === 'feature_splitting') {
      const fsCounts = getFeatureSplittingCounts();
      const segmentCounts = getSegmentCounts('stage1_segment');
      const hasSegments = Object.keys(segmentCounts).length > 0;

      if (hasSegments) {
        // Stage 1 active: Monosemantic segment (below threshold) is auto-considered
        return {
          'Incoherent Splitting': fsCounts.fragmented,
          'Monosemantic': fsCounts.monosemantic + (segmentCounts['Monosemantic'] || 0)
        };
      } else {
        // Stage 2+: stage 1 completed, use fixed node counts only
        // Don't add fsCounts because when revisiting Stage 1, getSelectedNodeFeatures()
        // returns restored feature IDs, causing double-counting
        return {
          'Incoherent Splitting': getNodeFeatureCount('fragmented_terminal'),
          'Monosemantic': getNodeFeatureCount('monosemantic')
        };
      }
    }

    if (category.id === 'quality') {
      const qCounts = getQualityCounts();
      const segmentCounts = getSegmentCounts('stage2_segment');
      const hasSegments = Object.keys(segmentCounts).length > 0;

      if (hasSegments) {
        // Stage 2 active: Need Revision segment (below threshold) is auto-considered
        return {
          'Well-Explained': qCounts.wellExplained,
          'Need Revision': qCounts.needRevision + (segmentCounts['Need Revision'] || 0)
        };
      } else {
        // Stage 3+: stage 2 completed, use fixed node counts only
        // Don't add qCounts because getSelectedNodeFeatures() returns current stage's features (need_revision),
        // not Stage 2's features, causing double-counting of features that have 'rejected' state
        return {
          'Well-Explained': getNodeFeatureCount('well_explained_terminal'),
          'Need Revision': getNodeFeatureCount('need_revision')
        };
      }
    }

    if (category.id === 'cause') {
      // Use cause counts from causeSelectionStates for all cause categories
      const cCounts = getCauseCounts();
      return {
        'Missed Syntax': cCounts.missedNgram,
        'Missed Context': cCounts.missedContext,
        'Noisy Activation': cCounts.noisyActivation,
        'Well-Explained': cCounts.wellExplained
      };
    }

    // Stage 4 (summary) or unknown: return empty counts
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

  // Compute tag counts for ALL stages with hierarchical structure
  const allTagCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    for (const stage of stages) {
      counts[stage.id] = getTagCounts(stage);
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, getFeatureSplittingCounts, getQualityCounts, getCauseCounts, pairSelectionStates, featureSelectionStates, causeSelectionStates, sankeyStructure]);

  // Compute tag nodes for each stage
  const nodesByStage = useMemo(() => {
    const grouped: Record<number, TagNode[]> = { 1: [], 2: [], 3: [], 4: [] };

    for (const stage of stages) {
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

  // // Measure badge + stage number positions after render
  // useLayoutEffect(() => {
  //   function measurePositions() {
  //     if (!containerRef.current) return;
  //     const positions: Record<string, { left: number; right: number; y: number }> = {};
  //     const container = containerRef.current;
  //     const containerRect = container.getBoundingClientRect();
  //     container.querySelectorAll('[data-node-id]').forEach((el) => {
  //       const nodeId = el.getAttribute('data-node-id');
  //       if (!nodeId) return;
  //       const rect = el.getBoundingClientRect();
  //       positions[nodeId] = { left: rect.left - containerRect.left, right: rect.right - containerRect.left, y: rect.top - containerRect.top + rect.height / 2 };
  //     });
  //     container.querySelectorAll('[data-stage-number]').forEach((el) => {
  //       const stageNum = el.getAttribute('data-stage-number');
  //       if (!stageNum) return;
  //       const rect = el.getBoundingClientRect();
  //       positions[`stage-number-${stageNum}`] = { left: rect.left - containerRect.left, right: rect.right - containerRect.left, y: rect.top - containerRect.top + rect.height / 2 };
  //     });
  //     setBadgePositions(positions);
  //   }
  //   measurePositions();
  //   window.addEventListener('resize', measurePositions);
  //   return () => window.removeEventListener('resize', measurePositions);
  // }, [nodesByStage, allTagCounts]);

  // // Generate SVG paths: Monosemantic → Stage 2 number, Need Revision → Stage 3 number
  // const flowPaths = useMemo(() => {
  //   const paths: Array<{ d: string; key: string; color: string }> = [];
  //   const stage1 = nodesByStage[1] || [];
  //   const stage2 = nodesByStage[2] || [];
  //   const monoNode = stage1.find(n => n.tag === 'Monosemantic');
  //   const stage2Num = badgePositions['stage-number-2'];
  //   if (monoNode) {
  //     const source = badgePositions[monoNode.id];
  //     if (source && stage2Num) {
  //       const x1 = source.right; const x2 = stage2Num.left - 4; const midX = (x1 + x2) / 2;
  //       paths.push({ key: 'mono-to-s2', d: `M ${x1} ${source.y} C ${midX} ${source.y}, ${midX} ${stage2Num.y}, ${x2} ${stage2Num.y}`, color: monoNode.color });
  //     }
  //   }
  //   const nrNode = stage2.find(n => n.tag === 'Need Revision');
  //   const stage3Num = badgePositions['stage-number-3'];
  //   if (nrNode) {
  //     const source = badgePositions[nrNode.id];
  //     if (source && stage3Num) {
  //       const x1 = source.right; const x2 = stage3Num.left - 4; const midX = (x1 + x2) / 2;
  //       paths.push({ key: 'nr-to-s3', d: `M ${x1} ${source.y} C ${midX} ${source.y}, ${midX} ${stage3Num.y}, ${x2} ${stage3Num.y}`, color: nrNode.color });
  //     }
  //   }
  //   return paths;
  // }, [badgePositions, nodesByStage]);

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
    <div className="tag-category-panel">
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

      {/* Flow lines: Monosemantic → Stage 2, Need Revision → Stage 3 */}
      {/* {flowPaths.length > 0 && (
        <svg className="tag-category-panel__flow-svg">
          {flowPaths.map(({ key, d, color }) => (
            <path
              key={key}
              d={d}
              className="tag-category-panel__flow-path"
              stroke={color}
            />
          ))}
        </svg>
      )} */}

      {/* Main content: Stage tabs with inline tags */}
      <div className="tag-category-panel__main-content">
        {stages.map((stage) => {
          const isActive = selectedCategory === stage.id;
          const isCompleted = isStageCompleted(stage.stageOrder);
          const isFuture = isStageFuture(stage.stageOrder);
          const stageTags = (nodesByStage[stage.stageOrder] || []).slice();

          // Sort tags at display time: "Yes" prefix first (stages 1-2 only)
          if (stage.stageOrder <= 2) {
            stageTags.sort((a, b) => {
              const aIsYes = FLOW_ANNOTATIONS[a.tag]?.prefix?.includes('Yes') ? 0 : 1;
              const bIsYes = FLOW_ANNOTATIONS[b.tag]?.prefix?.includes('Yes') ? 0 : 1;
              return aIsYes - bIsYes;
            });
          }

          return (
              <button
                key={stage.id}
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
                <div className="stage-tab__info">
                  <div className="stage-tab__header">
                    <div className="stage-tab__number" data-stage-number={stage.stageOrder}>
                      {isCompleted ? '✓' : stage.stageOrder}
                    </div>
                    <div className="stage-tab__label">{stage.label}</div>
                  </div>
                  {stage.instruction && (
                    <span className="stage-tab__instruction">{stage.instruction}</span>
                  )}
                </div>
                {stageTags.length > 0 && (
                  <div className="stage-tab__tags">
                    {stageTags.map((node) => {
                      const annotation = FLOW_ANNOTATIONS[node.tag];
                      return (
                        <div key={node.id} className="stage-tag-row">
                          {annotation?.prefix && (
                            <span className="stage-tag-row__prefix">{annotation.prefix}</span>
                          )}
                          <div
                            data-node-id={node.id}
                            className="stage-tag-badge"
                            style={{ backgroundColor: node.color, borderColor: node.color }}
                            title={`${node.tag}: ${node.count.toLocaleString()} features`}
                          >
                            <span className="stage-tag-badge__label">{node.tag}</span>
                            <span className="stage-tag-badge__count">{node.count.toLocaleString()}</span>
                          </div>
                          {annotation?.terminal && (
                            <span className="stage-tag-row__terminal">Terminal</span>
                          )}
                          {annotation?.suffix && (
                            <span className="stage-tag-row__suffix">{annotation.suffix}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </button>
          );
        })}
      </div>
    </div>
  );
};

export default TagCategoryPanel;
