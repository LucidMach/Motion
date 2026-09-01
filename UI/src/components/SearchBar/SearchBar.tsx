import React, { useState, useEffect, useRef, useCallback } from 'react';
import SearchInput from './SearchInput';
import SearchResultsPanel from './SearchResultsPanel';
import { motionApi, type StopSearchResult } from '../../services/api';
export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StopSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [focusedResult, setFocusedResult] = useState<StopSearchResult | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle global click outside to dismiss panel
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setIsOpen(false);
    setSelectedIndex(-1);
    setFocusedResult(null);

    // Clear the 3D map target dot pin
    window.dispatchEvent(new CustomEvent('motion:cmd:clear-search-target'));

    inputRef.current?.focus();
  }, []);

  // Select a result from list, focus it (hiding other options), fly camera to it, and render the map dot
  const handleSelect = useCallback((result: StopSearchResult) => {
    setFocusedResult(result);
    if (result.stop_lon !== undefined && result.stop_lat !== undefined) {
      window.dispatchEvent(
        new CustomEvent('motion:cmd:fly-to', {
          detail: {
            coords: [result.stop_lon, result.stop_lat],
            zoom: 17.0,
            pitch: 62,
            title: result.stop_name,
            subtitle: result.street_name || result.mode || 'Transit Stop',
          },
        })
      );
    }
  }, []);

  // Next & previous option cycling (Right/Left arrows)
  const handleNextOption = useCallback(() => {
    if (results.length === 0) return;
    const currentIdx = focusedResult
      ? results.findIndex((r) => r.stop_id === focusedResult.stop_id)
      : selectedIndex;
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % results.length : 0;
    setSelectedIndex(nextIdx);
    handleSelect(results[nextIdx]);
  }, [results, focusedResult, selectedIndex, handleSelect]);

  const handlePrevOption = useCallback(() => {
    if (results.length === 0) return;
    const currentIdx = focusedResult
      ? results.findIndex((r) => r.stop_id === focusedResult.stop_id)
      : selectedIndex;
    const prevIdx = currentIdx >= 0 ? (currentIdx - 1 + results.length) % results.length : results.length - 1;
    setSelectedIndex(prevIdx);
    handleSelect(results[prevIdx]);
  }, [results, focusedResult, selectedIndex, handleSelect]);

  const handleEscape = useCallback(() => {
    if (isOpen && focusedResult) {
      // 1. If in focused view, Esc acts as the "Back" button to return to match list
      setFocusedResult(null);
    } else if (isOpen) {
      // 2. If results panel is open, Esc goes back and dismisses it
      setIsOpen(false);
      setSelectedIndex(-1);
    } else {
      // 3. If there is nothing to go back to, Esc clears the search bar
      handleClear();
    }
  }, [isOpen, focusedResult, handleClear]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        // If in results list with a keyboard-highlighted item, Enter selects that item
        if (isOpen && !focusedResult && selectedIndex >= 0 && selectedIndex < results.length) {
          e.preventDefault();
          handleSelect(results[selectedIndex]);
          return;
        }

        const activeEl = document.activeElement;
        const isSearchInputFocused = activeEl === inputRef.current;
        const isOtherInputFocused =
          (activeEl instanceof HTMLInputElement && activeEl !== inputRef.current) ||
          activeEl instanceof HTMLTextAreaElement ||
          activeEl?.getAttribute('contenteditable') === 'true';

        if (!isSearchInputFocused && !isOtherInputFocused) {
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }
      } else if (e.key === 'Escape') {
        handleEscape();
      } else if (e.key === 'ArrowDown' && isOpen && results.length > 0) {
        e.preventDefault();
        if (focusedResult) {
          // Switch to next option in focused view
          handleNextOption();
        } else {
          // Navigate highlighted item in results list
          setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        }
      } else if (e.key === 'ArrowUp' && isOpen && results.length > 0) {
        e.preventDefault();
        if (focusedResult) {
          // Switch to previous option in focused view
          handlePrevOption();
        } else {
          // Navigate highlighted item in results list
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, focusedResult, selectedIndex, handleNextOption, handlePrevOption, handleSelect, handleEscape]);

  // Execute search across GTFS stops, landmarks, and OpenStreetMap
  const executeSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setHasSearched(true);
    setIsOpen(true);
    setSelectedIndex(-1);
    setFocusedResult(null);

    try {
      const searchData = await motionApi.searchStops(trimmed, 12);
      setResults(searchData);
    } catch (err) {
      console.warn('[SearchBar] Search error:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  // Trigger Navigate action
  const handleNavigate = (result: StopSearchResult, e: React.MouseEvent) => {
    e.stopPropagation();

    // Focus result and fly camera
    handleSelect(result);

    // Dispatch navigate command event for future navigation routing engine
    window.dispatchEvent(
      new CustomEvent('motion:cmd:navigate-to', {
        detail: {
          stop_id: result.stop_id,
          stop_name: result.stop_name,
          stop_lat: result.stop_lat,
          stop_lon: result.stop_lon,
          mode: result.mode,
        },
      })
    );

    console.info(`[Motion Search] Navigate triggered for target: ${result.stop_name} (${result.stop_id})`);
  };

  const handleBackToResults = () => {
    setFocusedResult(null);
  };

  return (
    <div
      ref={containerRef}
      aria-label="Transit Stop & Location Search"
      className="pointer-events-auto fixed bottom-5 left-1/2 z-20 w-[92%] max-w-xl -translate-x-1/2 max-[768px]:bottom-3.5 max-[768px]:w-[94%]"
    >
      {/* Floating Results Panel */}
      <SearchResultsPanel
        isOpen={isOpen}
        isLoading={isLoading}
        hasSearched={hasSearched}
        query={query}
        results={results}
        selectedIndex={selectedIndex}
        focusedResult={focusedResult}
        onSelect={handleSelect}
        onNavigate={handleNavigate}
        onBackToResults={handleBackToResults}
        onNextOption={handleNextOption}
        onPrevOption={handlePrevOption}
        onClose={() => {
          setIsOpen(false);
          setFocusedResult(null);
        }}
      />

      {/* Main Search Input Pill */}
      <SearchInput
        inputRef={inputRef}
        query={query}
        onChange={(val) => {
          setQuery(val);
          if (!val.trim()) {
            setIsOpen(false);
            setResults([]);
            setHasSearched(false);
            setFocusedResult(null);
            window.dispatchEvent(new CustomEvent('motion:cmd:clear-search-target'));
          }
        }}
        onSubmit={executeSearch}
        onClear={handleClear}
        onEscape={handleEscape}
        escapeActionLabel={isOpen && focusedResult ? 'Back' : isOpen ? 'Close' : 'Clear'}
        isLoading={isLoading}
        isOpen={isOpen}
      />
    </div>
  );
}
