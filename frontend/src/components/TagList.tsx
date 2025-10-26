// ============================================================================
// TAG LIST COMPONENT
// Template tags list with add/select functionality and assign button
// ============================================================================

import React, { useMemo, useRef, useEffect, useState } from 'react'
import { useVisualizationStore } from '../store/index'
import '../styles/TagList.css'

interface TagListProps {
  className?: string
}

const TagList: React.FC<TagListProps> = ({ className = '' }) => {
  // Store state
  const tags = useVisualizationStore(state => state.tags)
  const selectedFeatureIds = useVisualizationStore(state => state.selectedFeatureIds)
  const activeTagId = useVisualizationStore(state => state.activeTagId)

  // Store actions
  const createTag = useVisualizationStore(state => state.createTag)
  const setActiveTag = useVisualizationStore(state => state.setActiveTag)
  const assignFeaturesToTag = useVisualizationStore(state => state.assignFeaturesToTag)

  // Local state for adding new tags
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Get active tag
  const activeTag = tags.find(t => t.id === activeTagId)

  // Scroll tracking for template tags list
  const [tagListScrollState, setTagListScrollState] = useState({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })
  const tagListRef = useRef<HTMLDivElement>(null)
  const tagListRafIdRef = useRef<number | null>(null)

  useEffect(() => {
    const list = tagListRef.current
    if (!list) return

    const updateScrollState = () => {
      setTagListScrollState({
        scrollTop: list.scrollTop,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight
      })
    }

    // Throttled scroll handler using requestAnimationFrame
    const handleScroll = () => {
      if (tagListRafIdRef.current !== null) return // Already scheduled

      tagListRafIdRef.current = requestAnimationFrame(() => {
        updateScrollState()
        tagListRafIdRef.current = null
      })
    }

    // Initial measurement (immediate)
    updateScrollState()

    // Scroll events (throttled with RAF)
    list.addEventListener('scroll', handleScroll)

    // Resize events (immediate, since they're infrequent)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(list)

    return () => {
      list.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
      if (tagListRafIdRef.current !== null) {
        cancelAnimationFrame(tagListRafIdRef.current)
      }
    }
  }, [tags])

  // Handle add tag button click
  const handleAddTagClick = () => {
    setIsAddingTag(true)
    setNewTagName('')
  }

  // Handle creating new tag
  const handleCreateTag = () => {
    const trimmedName = newTagName.trim()
    if (trimmedName === '') {
      setIsAddingTag(false)
      setNewTagName('')
      return
    }

    const newTagId = createTag(trimmedName)
    setActiveTag(newTagId)
    setIsAddingTag(false)
    setNewTagName('')
  }

  // Handle input key press
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCreateTag()
    } else if (e.key === 'Escape') {
      setIsAddingTag(false)
      setNewTagName('')
    }
  }

  // Auto-focus input when entering add mode
  useEffect(() => {
    if (isAddingTag && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAddingTag])

  // Handle tag assignment
  const handleAssignFeatures = () => {
    if (!activeTagId) {
      alert('Please select a tag first')
      return
    }

    if (selectedFeatureIds.size === 0) {
      alert('No features selected. Please select features from the table.')
      return
    }

    assignFeaturesToTag(activeTagId)
    alert(`Assigned ${selectedFeatureIds.size} features to tag "${activeTag?.name}"`)
  }

  // Calculate scroll indicator position for template tags list
  const tagListMaxScroll = tagListScrollState.scrollHeight - tagListScrollState.clientHeight
  const tagListScrollPercent = tagListMaxScroll > 0 ? tagListScrollState.scrollTop / tagListMaxScroll : 0
  const tagListIsScrollable = tagListScrollState.scrollHeight > tagListScrollState.clientHeight

  return (
    <div className={`tag-panel__column tag-panel__templates ${className}`}>
      <h4 className="tag-panel__column-title">Tags</h4>
      <div className="template-tags-list-wrapper">
        <div className="template-tags-list" ref={tagListRef}>
          {tags.map(tag => (
            <div
              key={tag.id}
              className={`template-tag-card ${activeTagId === tag.id ? 'template-tag-card--active' : ''}`}
              onClick={() => setActiveTag(activeTagId === tag.id ? null : tag.id)}
              title={activeTagId === tag.id ? 'Click to deselect' : `Click to select ${tag.name}`}
            >
              <div className="template-tag-card__info">
                <div className="template-tag-card__name">{tag.name}</div>
                <div className="template-tag-card__count">
                  {tag.featureIds.size} feature{tag.featureIds.size !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}

          {/* Add new tag button/input */}
          {isAddingTag ? (
            <div className="template-tag-card template-tag-card--add-mode">
              <input
                ref={inputRef}
                type="text"
                className="template-tag-card__input"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={handleKeyPress}
                onBlur={handleCreateTag}
                placeholder="Enter tag name..."
                maxLength={50}
              />
            </div>
          ) : (
            <div
              className="template-tag-card template-tag-card--add"
              onClick={handleAddTagClick}
              title="Add new tag"
            >
              <div className="template-tag-card__info">
                <div className="template-tag-card__name template-tag-card__name--add">
                  + Add New Tag
                </div>
              </div>
            </div>
          )}
        </div>
        {tagListIsScrollable && (
          <div className="scroll-indicator">
            <div
              className="scroll-indicator__thumb"
              style={{
                height: `${(tagListScrollState.clientHeight / tagListScrollState.scrollHeight) * 100}%`,
                top: `${tagListScrollPercent * (100 - (tagListScrollState.clientHeight / tagListScrollState.scrollHeight) * 100)}%`
              }}
            />
          </div>
        )}
      </div>

      {/* Assign Button - always visible with different states */}
      <button
        className="assign-button"
        onClick={handleAssignFeatures}
        disabled={!activeTagId || selectedFeatureIds.size === 0}
        title={
          !activeTagId
            ? 'Select a tag first'
            : selectedFeatureIds.size === 0
            ? 'Select features from the table first'
            : `Assign ${selectedFeatureIds.size} features to ${activeTag?.name}`
        }
      >
        {!activeTagId
          ? 'Select a Tag'
          : `Add ${selectedFeatureIds.size} Feature${selectedFeatureIds.size !== 1 ? 's' : ''}`
        }
      </button>
    </div>
  )
}

export default TagList
