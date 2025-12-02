import React, { useMemo } from 'react';
import { useVisualizationStore } from '../store/index';
import { parseSAEId, getLLMExplainerNames } from '../lib/utils';
import featureValidatorLogo from '../assets/feature-validator-logo.svg';
import '../styles/AppHeader.css';

/**
 * Header component that displays InSAEght branding and SAE model information
 */
const Header: React.FC = () => {
  // Get data from store
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

  return (
    <div className="header">
      {/* InSAEght Branding */}
      <div className="header__branding">
        <img src={featureValidatorLogo} alt="InSAEght" className="header__logo" />
        <h1 className="header__title">InSAEght</h1>
      </div>

      {/* Badge Container - Horizontal Layout */}
      <div className="header__badges">
        {/* SAE Model Info Badge */}
        {saeMetadata && (
          <div className="header__sae-info">
            <span className="header__sae-label">Model:</span>
            <span className="header__sae-value">{saeMetadata.modelName}</span>
            <span className="header__sae-separator"></span>
            <span className="header__sae-label">Layer:</span>
            <span className="header__sae-value">{saeMetadata.layer}</span>
            <span className="header__sae-separator"></span>
            <span className="header__sae-label">Features:</span>
            <span className="header__sae-value">{saeMetadata.width}</span>
          </div>
        )}

        {/* LLM Explainers Badge */}
        {llmExplainerNames && (
          <div className="header__sae-info">
            <span className="header__sae-label">LLM Explainers:</span>
            <span className="header__sae-value">{llmExplainerNames}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;
