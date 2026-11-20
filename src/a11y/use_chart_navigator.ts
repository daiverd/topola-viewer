import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {AccessibleItem, AccessibleModel, IndiInfo} from 'topola';

/** Callbacks from the chart navigator to the host. */
export interface NavigatorCallbacks {
  /** Re-centre the chart on a person (Enter). */
  onSelection: (indiInfo: IndiInfo) => void;
  /** Show a person in the details panel without re-centring (Space). */
  onDetailSelection: (indiInfo: IndiInfo) => void;
}

export interface ChartNavigator {
  model?: AccessibleModel;
  focusedKey?: string;
  expanded: Set<string>;
  /** Text for the polite live region. */
  announcement: string;
  /** Key handler for the element that contains the tree items. */
  onKeyDown: (event: KeyboardEvent) => void;
  /** Focus tracking for the element that contains the tree items. */
  onFocusIn: () => void;
  onFocusOut: (event: React.FocusEvent) => void;
  /** Set focus to an item by clicking it etc. */
  setFocusedKey: (key: string) => void;
  /**
   * Incremented whenever DOM focus should move to the focused item. Hosts
   * focus the item's element when this changes.
   */
  focusRequest: number;
  /** Incremented when the focused item should be scrolled into view. */
  scrollRequest: number;
}

export const HELP_TEXT =
  'Family chart keys. ' +
  'Up and down arrows: previous and next person. ' +
  'Right arrow: expand, or go to first parent, marriage or child. ' +
  'Left arrow: collapse, or go back towards the centre person. ' +
  'Home: centre person. End: last item. ' +
  'F: father. M: mother. S: spouse, press again for the next spouse. ' +
  'C: children, press again for the next child. B: next brother or sister. ' +
  'G: other place this person is shown. ' +
  'Enter: centre the chart on this person. Browser Back returns. ' +
  'Space: show details in the side panel. ' +
  'Question mark: where am I. Asterisk: expand everything. H: this help.';

function generationPhrase(item: AccessibleItem, root: AccessibleItem): string {
  const diff = item.generation - root.generation;
  const rootName = root.label.split(',')[0];
  if (diff === 0) return `Same generation as ${rootName}`;
  const n = Math.abs(diff);
  const gens = n === 1 ? '1 generation' : `${n} generations`;
  return `${gens} ${diff < 0 ? 'above' : 'below'} ${rootName}`;
}

/** Returns a marriage item's spouse and children as relatives. */
function relativesOf(item: AccessibleItem) {
  if (item.kind !== 'marriage') return item.relatives;
  const people = item.children.filter((c) => c.kind === 'person');
  const spouse = people.find(
    (c) => !item.parent?.relatives.children.includes(c.key),
  );
  return {
    spouses: spouse ? [spouse.key] : [],
    children: people.filter((c) => c !== spouse).map((c) => c.key),
    siblings: [],
    father: undefined,
    mother: undefined,
  };
}

interface Cycle {
  letter: string;
  originKey: string;
  targets: string[];
  index: number;
}

/**
 * Keyboard navigation, expansion state and announcements for an accessible
 * chart model. Independent of how the tree is exposed (HTML or SVG).
 */
export function useChartNavigator(
  model: AccessibleModel | undefined,
  callbacks: NavigatorCallbacks,
): ChartNavigator {
  const [focusedKey, setFocusedKeyState] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const [focusRequest, setFocusRequest] = useState(0);
  const [scrollRequest, setScrollRequest] = useState(0);
  const hasFocus = useRef(false);
  const pendingRecentre = useRef<string>();
  const cycle = useRef<Cycle>();
  const previousRootIndi = useRef<string>();
  const announceTimer = useRef<number>();

  const announce = useCallback((text: string) => {
    // Clear first so that repeating the same text is announced again.
    setAnnouncement('');
    window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => setAnnouncement(text), 100);
  }, []);

  // React to a new model: a new chart, or the same chart re-rendered.
  useEffect(() => {
    if (!model) return;
    const allExpanded = new Set(
      Array.from(model.items.values())
        .filter((i) => i.children.length)
        .map((i) => i.key),
    );
    const rootIndi = model.root.indiId;
    const newRoot = rootIndi !== previousRootIndi.current;
    previousRootIndi.current = rootIndi;
    if (newRoot) {
      setExpanded(allExpanded);
      setFocusedKeyState(model.root.key);
      cycle.current = undefined;
      if (hasFocus.current || pendingRecentre.current) {
        announce(model.summary);
        setFocusRequest((n) => n + 1);
      }
      pendingRecentre.current = undefined;
    } else {
      setExpanded((old) => {
        // Keep collapsed items collapsed if they still exist.
        const next = new Set(allExpanded);
        allExpanded.forEach((k) => {
          if (old.size && !old.has(k) && model.items.has(k)) next.delete(k);
        });
        return next;
      });
      setFocusedKeyState((old) =>
        old && model.items.has(old) ? old : model.root.key,
      );
      if (hasFocus.current) setFocusRequest((n) => n + 1);
    }
  }, [model, announce]);

  const visible = useMemo(() => {
    const list: AccessibleItem[] = [];
    const walk = (item: AccessibleItem) => {
      list.push(item);
      if (expanded.has(item.key)) item.children.forEach(walk);
    };
    if (model) walk(model.root);
    return list;
  }, [model, expanded]);

  const moveTo = useCallback(
    (key: string | undefined, notFound?: string) => {
      if (!model) return;
      if (!key || !model.items.has(key)) {
        if (notFound) announce(notFound);
        return;
      }
      // Expand the path to the target so it is in the visible tree.
      const toExpand: string[] = [];
      for (let p = model.items.get(key)!.parent; p; p = p.parent) {
        toExpand.push(p.key);
      }
      if (toExpand.some((k) => !expanded.has(k))) {
        setExpanded((old) => new Set([...old, ...toExpand]));
      }
      setFocusedKeyState(key);
      setFocusRequest((n) => n + 1);
      setScrollRequest((n) => n + 1);
    },
    [model, expanded, announce],
  );

  const setFocusedKey = useCallback(
    (key: string) => {
      cycle.current = undefined;
      moveTo(key);
    },
    [moveTo],
  );

  /** Moves through a list of related items, advancing on repeated presses. */
  const cycleTo = useCallback(
    (letter: string, item: AccessibleItem, targets: string[], none: string) => {
      const c = cycle.current;
      if (c && c.letter === letter && c.targets[c.index] === item.key) {
        c.index = (c.index + 1) % c.targets.length;
        moveTo(c.targets[c.index]);
        if (c.targets.length > 1) {
          announce(`${c.index + 1} of ${c.targets.length}`);
        }
        return;
      }
      if (!targets.length) {
        announce(none);
        return;
      }
      cycle.current = {letter, originKey: item.key, targets, index: 0};
      moveTo(targets[0]);
      if (targets.length > 1) announce(`1 of ${targets.length}`);
    },
    [moveTo, announce],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!model || !focusedKey) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const item = model.items.get(focusedKey);
      if (!item) return;
      const index = visible.findIndex((i) => i.key === focusedKey);
      const name = item.label.split(',')[0];
      const relatives = relativesOf(item);
      let handled = true;
      let key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      // Shift+Slash is "?" on many layouts; accept it whatever key it reports.
      if (event.code === 'Slash' && event.shiftKey) key = '?';
      if (!['s', 'c', 'b', 'g'].includes(key)) cycle.current = undefined;

      switch (key) {
        case 'ArrowDown':
          moveTo(visible[index + 1]?.key);
          break;
        case 'ArrowUp':
          moveTo(visible[index - 1]?.key);
          break;
        case 'ArrowRight':
          if (item.children.length && !expanded.has(item.key)) {
            setExpanded((old) => new Set([...old, item.key]));
          } else {
            moveTo(item.children[0]?.key);
          }
          break;
        case 'ArrowLeft':
          if (item.children.length && expanded.has(item.key)) {
            setExpanded((old) => {
              const next = new Set(old);
              next.delete(item.key);
              return next;
            });
          } else {
            moveTo(item.parent?.key);
          }
          break;
        case 'Home':
          moveTo(visible[0]?.key);
          break;
        case 'End':
          moveTo(visible[visible.length - 1]?.key);
          break;
        case 'Enter':
          if (item.kind !== 'person') {
            announce(
              'Enter centres the chart on a person. This item is not a person.',
            );
          } else if (event.shiftKey) {
            callbacks.onDetailSelection({
              id: item.indiId!,
              generation: item.generation,
            });
            announce(`Details for ${name} shown in the side panel`);
          } else if (item === model.root) {
            announce(
              `The chart is already centred on ${name}. ${model.summary}`,
            );
          } else {
            pendingRecentre.current = item.indiId;
            callbacks.onSelection({
              id: item.indiId!,
              generation: item.generation,
            });
          }
          break;
        case ' ':
          if (item.kind === 'person') {
            callbacks.onDetailSelection({
              id: item.indiId!,
              generation: item.generation,
            });
            announce(`Details for ${name} shown in the side panel`);
          }
          break;
        case 'f':
          moveTo(relatives.father, `No father shown for ${name}`);
          break;
        case 'm':
          moveTo(relatives.mother, `No mother shown for ${name}`);
          break;
        case 's':
          cycleTo('s', item, relatives.spouses, `No spouse shown for ${name}`);
          break;
        case 'c':
          cycleTo(
            'c',
            item,
            relatives.children,
            `No children shown for ${name}`,
          );
          break;
        case 'b':
          cycleTo(
            'b',
            item,
            relatives.siblings,
            `No brothers or sisters shown for ${name}`,
          );
          break;
        case 'g': {
          const first = item.duplicateOf || item.key;
          const all = [first, ...model.items.get(first)!.otherOccurrences];
          if (all.length < 2) {
            announce(`${name} is shown only once`);
          } else {
            const next = all[(all.indexOf(item.key) + 1) % all.length];
            moveTo(next);
            announce(`Occurrence ${all.indexOf(next) + 1} of ${all.length}`);
          }
          break;
        }
        case '?':
          announce(
            item.kind === 'person'
              ? [
                  item.path,
                  generationPhrase(item, model.root),
                  item.description,
                ]
                  .filter((x) => !!x)
                  .join('. ')
              : item.label,
          );
          break;
        case 'h':
          announce(HELP_TEXT);
          break;
        case '*':
          setExpanded(
            new Set(
              Array.from(model.items.values())
                .filter((i) => i.children.length)
                .map((i) => i.key),
            ),
          );
          announce('All expanded');
          break;
        default:
          handled = false;
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [
      model,
      focusedKey,
      visible,
      expanded,
      moveTo,
      cycleTo,
      announce,
      callbacks,
    ],
  );

  const onFocusIn = useCallback(() => {
    hasFocus.current = true;
  }, []);
  const onFocusOut = useCallback((event: React.FocusEvent) => {
    // relatedTarget is null when the focused element is removed during a
    // re-render; keep treating the tree as focused in that case.
    const next = event.relatedTarget as Node | null;
    if (next && !(event.currentTarget as Node).contains(next)) {
      hasFocus.current = false;
    }
  }, []);

  return {
    model,
    focusedKey,
    expanded,
    announcement,
    onKeyDown,
    onFocusIn,
    onFocusOut,
    setFocusedKey,
    focusRequest,
    scrollRequest,
  };
}
