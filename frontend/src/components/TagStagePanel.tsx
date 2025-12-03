import React, { useMemo, useState } from 'react';
import {
  getTagCategoriesInOrder,
  getTagColor
} from '../lib/tag-system';
import { type TagCategoryConfig } from '../lib/constants';
import { useVisualizationStore } from '../store/index';
import FlowPanel from './FlowPanel';
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

  // Get sankeyTree from left panel for color mapping
  const sankeyTree = useVisualizationStore(state => state.leftPanel.sankeyTree);

  // Get sankeyStructure for stage-based counts (segments vs nodes)
  const sankeyStructure = useVisualizationStore(state => state.leftPanel.sankeyStructure);

  // Get feature splitting counts getter for live pair-derived counts
  const getFeatureSplittingCounts = useVisualizationStore(state => state.getFeatureSplittingCounts);

  // Check if threshold preview is active
  const thresholdVisualization = useVisualizationStore(state => state.thresholdVisualization);
  const isPreviewActive = thresholdVisualization?.visible ?? false;

  // Calculate dynamic tag counts based on filtered features from Sankey tree
  const getTagCounts = (category: TagCategoryConfig): Record<string, number> => {
    // Special case: Feature Splitting stage combines Sankey threshold + pair selection states
    if (category.id === 'feature_splitting') {
      const fsCounts = getFeatureSplittingCounts();

      // Get count of features below threshold from Sankey (inherently monosemantic)
      // Structure differs based on stage: segment (active) vs node (complete)
      let belowThresholdCount = 0;
      if (sankeyStructure && sankeyStructure.nodes) {
        const currentStage = sankeyStructure.currentStage || 1;

        if (currentStage === 1) {
          // Stage 1 active: look for stage1_segment with segments array
          const segmentNode = sankeyStructure.nodes.find((n: any) => n.id === 'stage1_segment') as any;
          if (segmentNode?.segments?.[0]) {
            // segments[0] = Monosemantic (below threshold)
            belowThresholdCount = segmentNode.segments[0].featureCount || 0;
          }
        } else {
          // Stage 2+: look for separate monosemantic node
          const monosematicNode = sankeyStructure.nodes.find((n: any) => n.id === 'monosemantic');
          if (monosematicNode) {
            belowThresholdCount = monosematicNode.featureCount || 0;
          }
        }
      }

      return {
        'Fragmented': fsCounts.fragmented,
        'Monosemantic': fsCounts.monosemantic + belowThresholdCount
      };
    }

    const counts: Record<string, number> = {};

    if (!sankeyTree || sankeyTree.size === 0) {
      // No tree available, return zeros
      category.tags.forEach((tag) => {
        counts[tag] = 0;
      });
      return counts;
    }

    const targetDepth = category.stageOrder;

    category.tags.forEach((tag, tagIndex) => {
      // Determine node suffix based on stage type
      let nodeSuffix: string;
      if (category.id === 'cause') {
        // Convert tag name to snake_case
        nodeSuffix = `_${tag.toLowerCase().replace(/\s+/g, '_')}`;
      } else {
        nodeSuffix = `_group${tagIndex}`;
      }

      // Find matching node in tree
      let matchedCount = 0;
      for (const [nodeId, node] of sankeyTree.entries()) {
        // Check if node is at the right depth
        if (node.depth !== targetDepth) continue;

        // Check if node ID ends with the expected suffix
        if (nodeId.endsWith(nodeSuffix)) {
          // For stages with metrics, verify the parent's metric
          if (category.metric && node.parentId) {
            const parentNode = sankeyTree.get(node.parentId);
            if (parentNode && parentNode.metric === category.metric) {
              matchedCount = node.featureCount;
              break;
            }
          } else {
            // For pre-defined categories (like Cause)
            matchedCount = node.featureCount;
            break;
          }
        }
      }

      counts[tag] = matchedCount;
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
          const tagCounts = getTagCounts(stage);

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

              {/* Tag badges displayed inline below instruction */}
              <div className="stage-tab__badges">
                {stage.tags.map((tag) => {
                  // Get color from tag-constants (pre-computed at module load)
                  const color = getTagColor(stage.id, tag);
                  const fallbackColor = '#94a3b8'; // Neutral grey
                  const tagColor = color || fallbackColor;

                  // Create style object for badge background (full opacity)
                  const badgeStyle = {
                    backgroundColor: tagColor,
                    borderColor: tagColor,
                  };

                  return (
                    <div
                      key={tag}
                      className={`stage-tag-badge ${isActive ? 'stage-tag-badge--active' : ''} ${isCompleted ? 'stage-tag-badge--completed' : ''}`}
                      style={badgeStyle}
                      title={`${tag}: ${(tagCounts[tag] || 0).toLocaleString()} features`}
                    >
                      <span className="stage-tag-badge__label">{tag}</span>
                      <span className="stage-tag-badge__count">{(tagCounts[tag] || 0).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TagCategoryPanel;
