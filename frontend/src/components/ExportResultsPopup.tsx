import React from 'react'
import SankeyDiagram from './SankeyDiagram'
import OverviewSummary from './OverviewSummary'
import '../styles/ExportResultsPopup.css'

interface ExportResultsPopupProps {
  onClose: () => void
  fileName: string
}

const ExportResultsPopup: React.FC<ExportResultsPopupProps> = ({ onClose, fileName }) => {
  return (
    <>
      <div className="export-popup__backdrop" onClick={onClose} />
      <div className="export-popup">
        <div className="export-popup__header">
          <span className="export-popup__title">Export Results</span>
          <button className="export-popup__close" onClick={onClose}>&times;</button>
        </div>
        <div className="export-popup__content">
          <div className="export-popup__sankey">
            <SankeyDiagram />
          </div>
          <div className="export-popup__summary">
            <OverviewSummary />
          </div>
        </div>
        <div className="export-popup__footer">
          <span className="export-popup__saved">{fileName} saved</span>
        </div>
      </div>
    </>
  )
}

export default React.memo(ExportResultsPopup)
