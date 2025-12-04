import React, { useMemo, useState } from 'react';
import {
  getTagCategoriesInOrder,
} from '../lib/tag-system';
import { type TagCategoryConfig } from '../lib/constants';
import { useVisualizationStore } from '../store/index';
import FlowPanel from './FlowPanel';
import TagFlowPanel from './TagFlowPanel';
import '../styles/TagStagePanel.css';

interface TagCategoryPanelProps {
  selectedCategory?: string | null;
  onCategoryClick?: (categoryId: string) => void;
}

const TagCategoryPanel: React.FC<TagCategoryPanelProps> = ({
  selectedCategory,
  onCategoryClick
}) => {
  // Help popup state
  const [showHelp, setShowHelp] = useState(false);

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

    const segmentNode = sankeyStructure.nodes.find((n: any) => n.id === stageNodeId);
    if (!segmentNode?.segments) return {};

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

  // Compute tag counts for ALL stages (for TagFlowPanel)
  // Combines selection states + threshold-filtered counts from Sankey
  const allTagCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    for (const stage of stages) {
      counts[stage.id] = getTagCounts(stage);
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, getFeatureSplittingCounts, getQualityCounts, pairSelectionStates, featureSelectionStates, sankeyStructure]);

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

      {/* Main content: Stage tabs interspersed with their tags */}
      <div className="tag-category-panel__main-content">
        {stages.map((stage) => {
          const isActive = selectedCategory === stage.id;
          const isCompleted = isStageCompleted(stage.stageOrder);
          const isFuture = isStageFuture(stage.stageOrder);

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
              <div className="stage-tab__header">
                <div className="stage-tab__number">
                  {isCompleted ? '✓' : stage.stageOrder}
                </div>
                <div className="stage-tab__label">{stage.label}</div>
              </div>
              <div className="stage-tab__instruction">{stage.instruction}</div>
            </button>
          );
        })}
      </div>

      {/* Tag Flow Panel - displays all tags with flow connections */}
      <TagFlowPanel
        tagCounts={allTagCounts}
        activeStage={selectedCategory}
      />
    </div>
  );
};

export default TagCategoryPanel;
