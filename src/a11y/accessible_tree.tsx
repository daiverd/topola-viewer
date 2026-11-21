import {useEffect, useRef} from 'react';
import {AccessibleItem} from 'topola';
import {ChartNavigator, TREE_HINT} from './use_chart_navigator';

/** DOM id for an item's treeitem element. */
export function htmlItemId(key: string) {
  return 'a11y-item-' + key.replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * HTML mode: the accessible model rendered as a visually hidden ARIA tree.
 * The SVG chart is hidden from assistive technology; the focus ring is drawn
 * on the chart by the host.
 */
export function AccessibleTree({navigator}: {navigator: ChartNavigator}) {
  const treeRef = useRef<HTMLUListElement>(null);
  const {model, focusedKey, expanded, focusRequest} = navigator;

  useEffect(() => {
    if (!focusRequest || !focusedKey) return;
    document
      .getElementById(htmlItemId(focusedKey))
      ?.focus({preventScroll: true});
  }, [focusRequest, focusedKey]);

  if (!model) return null;

  const renderItem = (
    item: AccessibleItem,
    level: number,
    pos: number,
    size: number,
  ) => {
    const id = htmlItemId(item.key);
    const isExpanded = expanded.has(item.key);
    return (
      <li
        key={item.key}
        id={id}
        role="treeitem"
        tabIndex={item.key === focusedKey ? 0 : -1}
        aria-labelledby={id + '-label'}
        aria-describedby={item.description ? id + '-desc' : undefined}
        aria-level={level}
        aria-posinset={pos}
        aria-setsize={size}
        aria-expanded={item.children.length ? isExpanded : undefined}
        onClick={(e) => {
          e.stopPropagation();
          navigator.setFocusedKey(item.key);
        }}
      >
        <span id={id + '-label'}>{item.label}</span>
        {item.description ? (
          <span id={id + '-desc'}>{item.description}</span>
        ) : null}
        {item.children.length && isExpanded ? (
          <ul role="group">
            {item.children.map((c, i) =>
              renderItem(c, level + 1, i + 1, item.children.length),
            )}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <ul
      ref={treeRef}
      role="tree"
      aria-label={model.summary}
      aria-description={TREE_HINT}
      className="a11y-visually-hidden"
      onKeyDown={navigator.onKeyDown}
      onFocus={navigator.onFocusIn}
      onBlur={navigator.onFocusOut}
    >
      {renderItem(model.root, 1, 1, 1)}
    </ul>
  );
}
