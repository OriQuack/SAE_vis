import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  getTagCategoriesInOrder,
  type TagCategoryConfig
} from '../lib/tag-categories';
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

  // Stage instructions mapping
  const stageInstructions: Record<string, string> = {
    'feature_splitting': 'Single or multiple concepts?',
    'quality': 'Rate explanation quality',
    'cause': 'Identify root cause'
  };

  // Get sankeyTree from left panel for color mapping
  const sankeyTree = useVisualizationStore(state => state.leftPanel.sankeyTree);

  // Get SAE metadata and LLM explainer information
  const tableData = useVisualizationStore(state => state.tableData);
  const currentFilters = useVisualizationStore(state => state.leftPanel.filters);
  const filterOptions = useVisualizationStore(state => state.filterOptions);

  // Parse SAE metadata - use selected SAE from filters, or first available from filterOptions
  const saeMetadata = useMemo(() => {
    console.log('[TagCategoryPanel] Current filters:', currentFilters);
    console.log('[TagCategoryPanel] Filter options:', filterOptions);

    // Try to get SAE from current filters first
    let saeId = currentFilters.sae_id?.[0];

    // If no SAE selected, use the first available SAE from filterOptions
    if (!saeId && filterOptions?.sae_id && filterOptions.sae_id.length > 0) {
      saeId = filterOptions.sae_id[0];
      console.log('[TagCategoryPanel] Using first available SAE from filterOptions:', saeId);
    }

    if (!saeId) {
      console.log('[TagCategoryPanel] No SAE ID found');
      return null;
    }

    const parsed = parseSAEId(saeId);
    console.log('[TagCategoryPanel] Parsed SAE metadata:', parsed);
    return parsed;
  }, [currentFilters, filterOptions]);

  // Get LLM explainer names
  const llmExplainerNames = useMemo(() => {
    console.log('[TagCategoryPanel] Table data:', tableData);
    console.log('[TagCategoryPanel] Explainer IDs:', tableData?.explainer_ids);

    if (!tableData?.explainer_ids || tableData.explainer_ids.length === 0) {
      console.log('[TagCategoryPanel] No explainer IDs found');
      return null;
    }

    const names = getLLMExplainerNames(tableData.explainer_ids);
    console.log('[TagCategoryPanel] LLM Explainer Names:', names);
    return names;
  }, [tableData]);

  // Helper function to get tag color from Sankey tree
  const getTagColor = (stageId: string, tagIndex: number, tagName: string): string | null => {
    if (!sankeyTree || sankeyTree.size === 0) {
      return null;
    }

    // Find the stage configuration
    const stage = stages.find(s => s.id === stageId);
    if (!stage) {
      return null;
    }

    // Get expected depth for this stage
    const targetDepth = stage.stageOrder;

    // Find matching nodes in the tree
    // Strategy depends on the stage:
    // - Stages 1 & 2: look for nodes ending with _group{index}
    // - Stage 3 (Cause): look for nodes ending with snake_case tag name
    let nodeSuffix: string;

    if (stageId === 'cause') {
      // Convert tag name to snake_case (e.g., "Missed Context" -> "missed_context")
      nodeSuffix = `_${tagName.toLowerCase().replace(/\s+/g, '_')}`;
    } else {
      nodeSuffix = `_group${tagIndex}`;
    }

    for (const [nodeId, node] of sankeyTree.entries()) {
      // Check if node is at the right depth
      if (node.depth !== targetDepth) continue;

      // Check if node ID ends with the expected suffix
      if (nodeId.endsWith(nodeSuffix)) {
        // For stages with metrics, we need to verify the parent created these nodes with that metric
        // But child nodes themselves have metric: null, so we check the parent instead
        if (stage.metric && node.parentId) {
          const parentNode = sankeyTree.get(node.parentId);
          if (parentNode && parentNode.metric === stage.metric) {
            return node.colorHex || null;
          }
        } else {
          // For pre-defined categories (like Cause) or when no metric validation needed
          return node.colorHex || null;
        }
      }
    }

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

  // Calculate flow paths - automatically adjusts when elements move
  const calculateFlowPaths = () => {
    if (!monosematicCountRef.current || !needRevisionCountRef.current ||
        !stage2IndicatorRef.current || !stage3IndicatorRef.current ||
        !panelRef.current) {
      return;
    }

    const panelRect = panelRef.current.getBoundingClientRect();

    // Helper to get element center position relative to panel
    const getRelativeCenter = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - panelRect.left,
        y: rect.top + rect.height / 2 - panelRect.top,
        right: rect.right - panelRect.left
      };
    };

    // Get positions relative to panel
    const monoPos = getRelativeCenter(monosematicCountRef.current);
    const needRevPos = getRelativeCenter(needRevisionCountRef.current);
    const stage2Pos = getRelativeCenter(stage2IndicatorRef.current);
    const stage3Pos = getRelativeCenter(stage3IndicatorRef.current);

    // Helper to create tapered ribbon path
    const createRibbon = (
      x1: number, y1: number, x2: number, y2: number, width: number
    ) => {
      const dx = x2 - x1;
      const startWidth = width;
      const endWidth = width * 0.3; // Taper to 30%

      // Control points for smooth Bezier curve
      const cx1 = x1 + dx * 0.5;
      const cy1 = y1;
      const cx2 = x1 + dx * 0.5;
      const cy2 = y2;

      // Create tapered path
      return `M ${x1},${y1 - startWidth/2}
              C ${cx1},${cy1 - startWidth/2} ${cx2},${cy2 - endWidth/2} ${x2},${y2 - endWidth/2}
              L ${x2},${y2 + endWidth/2}
              C ${cx2},${cy2 + endWidth/2} ${cx1},${cy1 + startWidth/2} ${x1},${y1 + startWidth/2}
              Z`;
    };

    // Flow 1: monosemantic count badge (right edge) → stage 2 indicator (center)
    const x1_1 = monoPos.right;
    const y1_1 = monoPos.y;
    const x2_1 = stage2Pos.x;
    const y2_1 = stage2Pos.y;

    // Flow 2: need revision count badge (right edge) → stage 3 indicator (center)
    const x1_2 = needRevPos.right;
    const y1_2 = needRevPos.y;
    const x2_2 = stage3Pos.x;
    const y2_2 = stage3Pos.y;

    setFlowPaths({
      path1: createRibbon(x1_1, y1_1, x2_1, y2_1, 6),
      path2: createRibbon(x1_2, y1_2, x2_2, y2_2, 6)
    });
  };

  // Update flow paths on mount, resize, and when layout changes
  useEffect(() => {
    // Initial calculation with a small delay to ensure layout is complete
    const timeoutId = setTimeout(() => {
      calculateFlowPaths();
    }, 0);

    // ResizeObserver for panel size changes
    const resizeObserver = new ResizeObserver(() => {
      calculateFlowPaths();
    });

    // MutationObserver for DOM changes
    const mutationObserver = new MutationObserver(() => {
      calculateFlowPaths();
    });

    if (panelRef.current) {
      resizeObserver.observe(panelRef.current);
      mutationObserver.observe(panelRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }

    // Also recalculate on scroll (in case parent scrolls)
    window.addEventListener('scroll', calculateFlowPaths, true);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('scroll', calculateFlowPaths, true);
    };
  }, [stages, selectedCategory, featureCount, sankeyTree]);

  return (
    <div className="tag-category-panel" ref={panelRef}>
      <div className="tag-category-panel__content">
        {/* SAE Info - left of stage buttons */}
        {saeMetadata && (
          <div className="tag-category-panel__sae-info">
            <div className="sae-info__row">
              <span className="sae-info__label">Model:</span>
              <span className="sae-info__value">{saeMetadata.modelName}</span>
            </div>
            <div className="sae-info__row">
              <span className="sae-info__label">Layer:</span>
              <span className="sae-info__value">{saeMetadata.layer}</span>
              <span className="sae-info__separator">|</span>
              <span className="sae-info__label">Width:</span>
              <span className="sae-info__value">{saeMetadata.width}</span>
            </div>
            {llmExplainerNames && (
              <div className="sae-info__row">
                <span className="sae-info__label">LLM Explainers:</span>
                <span className="sae-info__value">{llmExplainerNames}</span>
              </div>
            )}
          </div>
        )}

        {/* Separator between SAE info and stages */}
        {saeMetadata && (
          <div className="tag-category-panel__sae-separator" />
        )}

        {/* Stage buttons and instructions */}
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
                    const color = getTagColor(stage.id, tagIndex, tag);
                    const fallbackColor = '#94a3b8'; // Neutral grey
                    const tagColor = color || fallbackColor;

                    // Use higher opacity for active stage (85% vs 45%)
                    const opacityHex = isActive ? 'C6' : '73'; // 85% : 45%

                    // Create style object for dynamic coloring
                    const tagStyle = {
                      borderLeftColor: tagColor,
                      backgroundColor: `${tagColor}${opacityHex}`
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
