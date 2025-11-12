import React, { useMemo } from 'react';
import {
  getTagCategoriesInOrder,
  getTagColor,
  type TagCategoryConfig
} from '../lib/tag-constants';
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

  // Get activateCategoryTable action from store
  const activateCategoryTable = useVisualizationStore(state => state.activateCategoryTable);

  // Handle stage click
  const handleStageClick = (categoryId: string) => {
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
          const tagCounts = getTagCounts(stage);

          return (
            <React.Fragment key={stage.id}>
              {/* Stage tab */}
              <button
                className={`stage-tab ${
                  isActive ? 'stage-tab--active' : ''
                } ${
                  isCompleted ? 'stage-tab--completed' : ''
                }`}
                onClick={() => handleStageClick(stage.id)}
                title={stage.description}
              >
                <div className="stage-tab__header">
                  <div className="stage-tab__number">
                    {isCompleted ? '✓' : stage.stageOrder}
                  </div>
                  <div className="stage-tab__label">{stage.label}</div>
                </div>
                <div className="stage-tab__instruction">{stage.instruction}</div>
              </button>

              {/* Tags for this stage (small notebook tabs) */}
              <div className="tag-tabs-group">
                {stage.tags.map((tag, _tagIndex) => {
                  // Get color from tag-constants (pre-computed at module load)
                  const color = getTagColor(stage.id, tag);
                  const fallbackColor = '#94a3b8'; // Neutral grey
                  const tagColor = color || fallbackColor;

                  // Use higher opacity for active stage (90% vs 50%)
                  const opacityHex = isActive ? 'E6' : '80'; // 90% : 50%

                  // Create style object for dynamic coloring
                  const tagStyle = {
                    borderColor: tagColor,
                    backgroundColor: `${tagColor}${opacityHex}`,
                  };

                  const countStyle = {
                    backgroundColor: tagColor,
                    color: 'black',
                    opacity: 1.0
                  };

                  return (
                    <div
                      key={tag}
                      className={`tag-tab ${isActive ? 'tag-tab--active' : ''} ${isCompleted ? 'tag-tab--completed' : ''}`}
                      style={tagStyle}
                      title={`${tag}: ${tagCounts[tag]} features`}
                    >
                      <div className="tag-tab__header">
                        <svg
                          className="tag-tab__icon"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M2 3.5C2 2.67157 2.67157 2 3.5 2H7.08579C7.351 2 7.60536 2.10536 7.79289 2.29289L13.7071 8.20711C14.0976 8.59763 14.0976 9.23077 13.7071 9.62132L9.62132 13.7071C9.23077 14.0976 8.59763 14.0976 8.20711 13.7071L2.29289 7.79289C2.10536 7.60536 2 7.351 2 7.08579V3.5Z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
                        </svg>
                        {/* <span className="tag-tab__icon">🏷️</span> */}
                        <span className="tag-tab__label">{tag}</span>
                      </div>
                      <span
                        className="tag-tab__count"
                        style={countStyle}
                      >
                        {tagCounts[tag] || 0}
                      </span>
                    </div>
                  );
                })}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default TagCategoryPanel;
