import React, { useMemo } from 'react';
import {
  getTagCategoriesInOrder,
  getTagColor,
  type TagCategoryConfig
} from '../lib/tag-constants';
import { useVisualizationStore } from '../store/index';
import { parseSAEId, getLLMExplainerNames } from '../lib/utils';
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

  // Get sankeyTree from left panel for color mapping
  const sankeyTree = useVisualizationStore(state => state.leftPanel.sankeyTree);

  // Get SAE metadata and LLM explainer information
  const tableData = useVisualizationStore(state => state.tableData);
  const currentFilters = useVisualizationStore(state => state.leftPanel.filters);
  const filterOptions = useVisualizationStore(state => state.filterOptions);

  // Parse SAE metadata - use selected SAE from filters, or first available from filterOptions
  const saeMetadata = useMemo(() => {
    // Try to get SAE from current filters first
    let saeId = currentFilters.sae_id?.[0];

    // If no SAE selected, use the first available SAE from filterOptions
    if (!saeId && filterOptions?.sae_id && filterOptions.sae_id.length > 0) {
      saeId = filterOptions.sae_id[0];
    }

    if (!saeId) {
      return null;
    }

    const parsed = parseSAEId(saeId);
    return parsed;
  }, [currentFilters, filterOptions]);

  // Get LLM explainer names
  const llmExplainerNames = useMemo(() => {
    if (!tableData?.explainer_ids || tableData.explainer_ids.length === 0) {
      return null;
    }

    const names = getLLMExplainerNames(tableData.explainer_ids);
    return names;
  }, [tableData]);

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
                <div className="stage-tab__number">
                  {isCompleted ? '✓' : stage.stageOrder}
                </div>
                <div className="stage-tab__label">{stage.label}</div>
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
                    color: 'white'
                  };

                  return (
                    <div
                      key={tag}
                      className={`tag-tab ${isActive ? 'tag-tab--active' : ''} ${isCompleted ? 'tag-tab--completed' : ''}`}
                      style={tagStyle}
                      title={`${tag}: ${tagCounts[tag]} features`}
                    >
                      <span className="tag-tab__label">{tag}</span>
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

      {/* Right: SAE Model Info */}
      {saeMetadata && (
        <div className="tag-category-panel__sae-info">
          <div className="sae-info__header">SAE Model</div>
          <div className="sae-info__details">
            <div className="sae-info__row">
              <span className="sae-info__label">Model:</span>
              <span className="sae-info__value">{saeMetadata.modelName}</span>
            </div>
            <div className="sae-info__row">
              <span className="sae-info__label">Layer:</span>
              <span className="sae-info__value">{saeMetadata.layer}</span>
            </div>
            <div className="sae-info__row">
              <span className="sae-info__label">Features:</span>
              <span className="sae-info__value">{saeMetadata.width}</span>
            </div>
            {llmExplainerNames && (
              <div className="sae-info__row">
                <span className="sae-info__label">Explainers:</span>
                <span className="sae-info__value">{llmExplainerNames}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TagCategoryPanel;
