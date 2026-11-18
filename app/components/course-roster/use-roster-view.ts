import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import {
  DEFAULT_ROSTER_VIEW,
  parseRosterView,
  type RosterSortColumn,
  type RosterView,
  type SortDirection,
} from "~/modules/course-roster";

// Highest first reads best for numbers and dates; A to Z for text.
const FIRST_DIRECTION: Record<RosterSortColumn, SortDirection> = {
  name: "asc",
  enrolled: "desc",
  progress: "desc",
  status: "asc",
  quiz: "desc",
};

// Every URL change reruns the app layout's loader, so the search box writes
// to the URL once typing pauses rather than on each keystroke.
const SEARCH_URL_DELAY_MS = 300;

function useUrlRosterView() {
  const [searchParams, setSearchParams] = useSearchParams();

  const update = useCallback(
    (changes: Partial<RosterView>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value === DEFAULT_ROSTER_VIEW[key as keyof RosterView]) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      setSearchParams(next, {
        replace: true,
        preventScrollReset: true,
        flushSync: true,
      });
    },
    [searchParams, setSearchParams]
  );

  return { urlView: parseRosterView(searchParams), update };
}

/** The roster view held in the URL, and setters that leave the rest of the URL alone. */
export function useRosterView() {
  const { urlView, update } = useUrlRosterView();
  const [query, setQuery] = useState(urlView.q);
  // The last `q` this hook wrote. A URL `q` that differs came from somewhere
  // else (Back, a link) and replaces the box's text; the hook's own write can
  // land after more typing, and must not.
  const [writtenQuery, setWrittenQuery] = useState(urlView.q);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlView.q);
  if (urlView.q !== seenUrlQuery) {
    setSeenUrlQuery(urlView.q);
    if (urlView.q !== writtenQuery) {
      setWrittenQuery(urlView.q);
      setQuery(urlView.q);
    }
  }

  useEffect(() => {
    if (query === urlView.q) return;
    const timer = setTimeout(() => {
      setWrittenQuery(query);
      update({ q: query });
    }, SEARCH_URL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, urlView.q, update]);

  const view: RosterView = { ...urlView, q: query };

  function change({ q, ...rest }: Partial<RosterView>) {
    if (q !== undefined) setQuery(q);
    if (Object.keys(rest).length > 0) update(rest);
  }

  function sortBy(column: RosterSortColumn) {
    if (column === view.sort) {
      update({ dir: view.dir === "asc" ? "desc" : "asc" });
    } else {
      update({ sort: column, dir: FIRST_DIRECTION[column] });
    }
  }

  function clearFilters() {
    setQuery("");
    setWrittenQuery("");
    update({ q: "", from: "", to: "", status: "" });
  }

  return { view, change, sortBy, clearFilters };
}
