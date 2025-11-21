import React, { useMemo } from 'react';
import {
  getTagCategoriesInOrder,
  getTagColor
} from '../lib/tag-system';
import { type TagCategoryConfig } from '../lib/constants';
import { useVisualizationStore } from '../store/index';
import '../styles/TagStagePanel.css';

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

  // Get sankeyTree from left panel for color mapping
  const sankeyTree = useVisualizationStore(state => state.leftPanel.sankeyTree);

  // Check if threshold preview is active
  const thresholdVisualization = useVisualizationStore(state => state.thresholdVisualization);
  const isPreviewActive = thresholdVisualization?.visible ?? false;

  // Calculate dynamic tag counts based on filtered features from Sankey tree
  const getTagCounts = (category: TagCategoryConfig): Record<string, number> => {
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
                      title={`${tag}: ${tagCounts[tag]} features`}
                    >
                      <span className="stage-tag-badge__label">{tag}</span>
                      <span className="stage-tag-badge__count">{tagCounts[tag] || 0}</span>
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
