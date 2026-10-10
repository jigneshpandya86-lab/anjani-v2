import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Search, ChevronDown, Check, X, Package } from 'lucide-react'
import { WATER_SKUS, getSkuMeta, DEFAULT_SKU } from '../constants/skus'

/**
 * Returns brand badge color classes.
 */
function getBrandBadgeClass(brand) {
  switch (brand) {
    case 'Bailey':
      return 'bg-cyan-100 text-cyan-800 border-cyan-200'
    case 'Bisleri':
      return 'bg-teal-100 text-teal-800 border-teal-200'
    case 'Rushi':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'Anjani':
    default:
      return 'bg-blue-100 text-blue-800 border-blue-200'
  }
}

/**
 * SkuSelect - Search and Select Combobox for Water SKUs
 *
 * @param {object} props
 * @param {string} props.value - Currently selected SKU label (e.g. 'Rushi 500ml')
 * @param {function} props.onChange - Callback with newly selected SKU label: (skuLabel) => void
 * @param {string} [props.id] - Element ID for htmlFor labels
 * @param {string} [props.placeholder] - Custom placeholder
 * @param {boolean} [props.disabled] - Disabled state
 * @param {string} [props.className] - Extra wrapper classes
 * @param {Array} [props.skusList] - Custom SKU array (defaults to WATER_SKUS)
 */
export default function SkuSelect({
  value,
  onChange,
  id,
  placeholder = 'Select SKU...',
  disabled = false,
  className = '',
  skusList = WATER_SKUS,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const containerRef = useRef(null)
  const searchInputRef = useRef(null)
  const listRef = useRef(null)

  const currentSku = useMemo(() => {
    return getSkuMeta(value || DEFAULT_SKU)
  }, [value])

  // Filter SKUs based on search query
  const filteredSkus = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return skusList

    return skusList.filter((s) => {
      const labelMatch = s.label.toLowerCase().includes(q)
      const brandMatch = s.brand.toLowerCase().includes(q)
      const sizeMatch = s.size.toLowerCase().includes(q)
      const shortMatch = s.shortLabel.toLowerCase().includes(q)
      const idMatch = s.id.toLowerCase().includes(q)
      return labelMatch || brandMatch || sizeMatch || shortMatch || idMatch
    })
  }, [searchQuery, skusList])

  // Reset highlight index when filter changes
  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredSkus])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    } else {
      setSearchQuery('')
    }
  }, [isOpen])

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (sku) => {
    if (disabled) return
    onChange?.(sku.label)
    setIsOpen(false)
    setSearchQuery('')
  }

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (disabled) return

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev < filteredSkus.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredSkus.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredSkus[highlightedIndex]) {
        handleSelect(filteredSkus[highlightedIndex])
      }
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Hidden input for form data / test query */}
      <input type="hidden" value={currentSku.label} readOnly data-testid="sku-select-value" />

      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={currentSku.label}
        className={`w-full flex items-center justify-between gap-2 p-2.5 bg-white border rounded-xl text-left transition-all outline-none ${
          isOpen
            ? 'border-[#ff9900] ring-2 ring-[#ff9900]/20 shadow-xs'
            : 'border-gray-300 hover:border-gray-400 focus:ring-1 focus:ring-[#ff9900]'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border shrink-0 ${getBrandBadgeClass(
              currentSku.brand,
            )}`}
          >
            {currentSku.brand}
          </span>
          <span className="text-xs font-bold text-gray-900 truncate">
            {currentSku.label || placeholder}
          </span>
          <span className="text-[10px] text-gray-400 hidden sm:inline truncate">
            ({currentSku.size})
          </span>
        </div>

        <ChevronDown
          size={15}
          className={`text-gray-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-[#ff9900]' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Search Box Header */}
          <div className="p-2 border-b border-gray-100 bg-gray-50/70">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search SKU or brand (e.g. Rushi, 500, 1L)..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 placeholder-gray-400 outline-none focus:border-[#ff9900] focus:ring-1 focus:ring-[#ff9900]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 p-0.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* List of SKUs */}
          <div ref={listRef} className="max-h-56 overflow-y-auto p-1 divide-y divide-gray-50">
            {filteredSkus.length === 0 ? (
              <div className="p-4 text-center">
                <Package className="w-5 h-5 mx-auto text-gray-300 mb-1" />
                <p className="text-xs text-gray-500 font-semibold">No SKUs match "{searchQuery}"</p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-1.5 text-[11px] font-bold text-amber-600 hover:underline"
                >
                  Clear search
                </button>
              </div>
            ) : (
              filteredSkus.map((sku, index) => {
                const isSelected = sku.label === currentSku.label
                const isHighlighted = index === highlightedIndex

                return (
                  <button
                    key={sku.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(sku)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50 text-gray-900 font-bold'
                        : isHighlighted
                        ? 'bg-gray-50 text-gray-800'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border shrink-0 ${getBrandBadgeClass(
                          sku.brand,
                        )}`}
                      >
                        {sku.brand}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{sku.label}</p>
                        <p className="text-[10px] text-gray-400 font-medium">
                          {sku.size} • {sku.unit}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <Check size={14} className="text-[#ff9900] shrink-0 font-bold" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
