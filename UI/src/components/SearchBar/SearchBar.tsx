import React, { useState, useEffect, useRef, useCallback } from 'react';
import SearchInput from './SearchInput';
import SearchResultsPanel from './SearchResultsPanel';
import { motionApi, type StopSearchResult } from '../../services/api';
export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
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
    setLastSearchedQuery('');
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
  const handleSelect = useCallback(
    (result: StopSearchResult) => {
      setFocusedResult(result);
      const idx = results.findIndex((r) => r.stop_id === result.stop_id);
      if (idx !== -1) {
        setSelectedIndex(idx);
      }
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
    },
    [results]
  );

  // Trigger Navigate action
  const handleNavigate = useCallback(
    (result: StopSearchResult, e?: React.MouseEvent | MouseEvent | React.KeyboardEvent | KeyboardEvent) => {
      if (e && 'stopPropagation' in e) {
        e.stopPropagation();
      }

      // Focus result and fly camera
      handleSelect(result);
      setIsOpen(false);

      // Dispatch navigate command event for routing engine
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
    },
    [handleSelect]
  );

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

  // Listen for route clear event to synchronize search bar state
  useEffect(() => {
    const handleRouteCleared = () => {
      handleClear();
    };
    window.addEventListener('motion:cmd:clear-route', handleRouteCleared);
    return () => {
      window.removeEventListener('motion:cmd:clear-route', handleRouteCleared);
    };
  }, [handleClear]);

  // Execute search across GTFS stops, landmarks, and OpenStreetMap
  const executeSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setHasSearched(true);
    setIsOpen(true);
    setFocusedResult(null);

    try {
      const searchData = await motionApi.searchStops(trimmed, 12);
      setResults(searchData);
      setLastSearchedQuery(trimmed);
      setSelectedIndex(searchData.length > 0 ? 0 : -1);
    } catch (err) {
      console.warn('[SearchBar] Search error:', err);
      setResults([]);
      setSelectedIndex(-1);
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  // Unified submission handler (invoked on Enter from search input or action button)
  const handleInputSubmit = useCallback(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    const isNewQuery = trimmedQuery.toLowerCase() !== lastSearchedQuery.trim().toLowerCase();

    // 1. If user typed a new query (or results are not open), Enter MUST trigger a new search
    if (isNewQuery || !isOpen || results.length === 0) {
      executeSearch();
      return;
    }

    // 2. If search results are currently open for this exact query and no option is focused,
    // hitting Enter selects the highlighted search option
    if (isOpen && !focusedResult && results.length > 0 && !isLoading) {
      const targetIdx = selectedIndex >= 0 && selectedIndex < results.length ? selectedIndex : 0;
      setSelectedIndex(targetIdx);
      handleSelect(results[targetIdx]);
      return;
    }

    // 3. If an option is already focused for this query, hitting Enter triggers navigation
    if (isOpen && focusedResult && !isLoading) {
      handleNavigate(focusedResult);
      return;
    }

    // 4. Default fallback: execute search
    executeSearch();
  }, [
    query,
    isOpen,
    focusedResult,
    results,
    isLoading,
    lastSearchedQuery,
    selectedIndex,
    handleSelect,
    handleNavigate,
    executeSearch,
  ]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const activeEl = document.activeElement;
        const isSearchInputFocused = activeEl === inputRef.current;

        // If the search input is focused, SearchInput's onKeyDown handles Enter via handleInputSubmit
        if (isSearchInputFocused) {
          return;
        }

        const isOtherInputFocused =
          (activeEl instanceof HTMLInputElement && activeEl !== inputRef.current) ||
          activeEl instanceof HTMLTextAreaElement ||
          activeEl?.getAttribute('contenteditable') === 'true';

        if (isOtherInputFocused) {
          return;
        }

        const trimmedQuery = query.trim();
        const isNewQuery = trimmedQuery.toLowerCase() !== lastSearchedQuery.trim().toLowerCase();

        // If query was modified since last search, Enter triggers a new search
        if (isNewQuery) {
          e.preventDefault();
          executeSearch();
          return;
        }

        // If in results list and not inside an input, Enter selects the search option
        if (isOpen && !focusedResult && results.length > 0 && !isLoading) {
          e.preventDefault();
          const targetIdx = selectedIndex >= 0 && selectedIndex < results.length ? selectedIndex : 0;
          setSelectedIndex(targetIdx);
          handleSelect(results[targetIdx]);
          return;
        }

        // If in single focused result view, Enter triggers navigate
        if (isOpen && focusedResult && !isLoading) {
          e.preventDefault();
          handleNavigate(focusedResult, e);
          return;
        }

        // If search bar is unfocused and no panel is open, Enter focuses the input
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
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
  }, [
    isOpen,
    results,
    focusedResult,
    selectedIndex,
    isLoading,
    query,
    lastSearchedQuery,
    handleNextOption,
    handlePrevOption,
    handleSelect,
    handleNavigate,
    executeSearch,
    handleEscape,
  ]);

  const handleBackToResults = () => {
    setFocusedResult(null);
  };

  const isNewQuery = query.trim().toLowerCase() !== lastSearchedQuery.trim().toLowerCase();
  let submitActionType: 'search' | 'select' | 'navigate' = 'search';
  if (isOpen && focusedResult && !isNewQuery) {
    submitActionType = 'navigate';
  } else if (isOpen && !focusedResult && results.length > 0 && !isNewQuery) {
    submitActionType = 'select';
  } else {
    submitActionType = 'search';
  }

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
            setLastSearchedQuery('');
            window.dispatchEvent(new CustomEvent('motion:cmd:clear-search-target'));
          } else {
            // Typing after getting a result resets focused option so Enter searches
            if (focusedResult) {
              setFocusedResult(null);
            }
            if (val.trim().toLowerCase() !== lastSearchedQuery.trim().toLowerCase()) {
              setSelectedIndex(-1);
            }
          }
        }}
        onSubmit={handleInputSubmit}
        onClear={handleClear}
        onEscape={handleEscape}
        escapeActionLabel={isOpen && focusedResult ? 'Back' : isOpen ? 'Close' : 'Clear'}
        isLoading={isLoading}
        isOpen={isOpen}
        submitActionType={submitActionType}
      />
    </div>
  );
}
