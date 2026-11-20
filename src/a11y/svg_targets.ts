import {AccessibleItem, AccessibleModel} from 'topola';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_CLASS = 'a11y-focus-ring';
const TARGET_CLASS = 'a11y-target';

function nodeGroup(chart: Element, nodeId: string): SVGGElement | null {
  return chart.querySelector(`g.node[data-node-id="${CSS.escape(nodeId)}"]`);
}

/**
 * Returns the drawn element an item corresponds to: the person's box, or for
 * marriages and missing parents, the whole couple node.
 */
export function drawnElement(
  chart: Element,
  item: AccessibleItem,
): SVGGraphicsElement | null {
  if (!item.nodeId) return null;
  const node = nodeGroup(chart, item.nodeId);
  if (!node) return null;
  if (item.kind === 'person') {
    return node.querySelector(
      `g.indi[data-indi-id="${CSS.escape(item.indiId!)}"]`,
    );
  }
  return node;
}

/** Draws the keyboard focus ring around the item's drawn box. */
export function showFocusRing(
  chart: Element,
  item: AccessibleItem | undefined,
  scroll: boolean,
) {
  chart.querySelectorAll(`.${RING_CLASS}`).forEach((e) => e.remove());
  if (!item) return;
  const element = drawnElement(chart, item);
  if (!element) return;
  const box = element.getBBox();
  const pad = 5;
  const ring = document.createElementNS(SVG_NS, 'g');
  ring.setAttribute('class', RING_CLASS);
  ring.setAttribute('aria-hidden', 'true');
  ring.setAttribute('pointer-events', 'none');
  // Dark ring with a white halo, visible on any box colour.
  for (const [stroke, width] of [
    ['#ffffff', 8],
    ['#1a1aa6', 4],
  ] as const) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(box.x - pad));
    rect.setAttribute('y', String(box.y - pad));
    rect.setAttribute('width', String(box.width + 2 * pad));
    rect.setAttribute('height', String(box.height + 2 * pad));
    rect.setAttribute('rx', '8');
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', String(width));
    ring.appendChild(rect);
  }
  element.appendChild(ring);
  if (scroll) {
    ring.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }
}

/**
 * Returns the element that takes keyboard focus for an item in SVG mode,
 * creating an invisible target inside the node for items that have no box of
 * their own (marriages, missing parents).
 */
function focusTarget(chart: Element, item: AccessibleItem): SVGElement | null {
  if (item.kind === 'person') return drawnElement(chart, item);
  if (!item.nodeId) return null;
  const node = nodeGroup(chart, item.nodeId);
  if (!node) return null;
  const existing = node.querySelector<SVGElement>(
    `g.${TARGET_CLASS}[data-a11y-key="${CSS.escape(item.key)}"]`,
  );
  if (existing) return existing;
  const target = document.createElementNS(SVG_NS, 'g');
  target.setAttribute('class', TARGET_CLASS);
  node.appendChild(target);
  return target;
}

export function svgItemElement(chart: Element, key: string): SVGElement | null {
  return chart.querySelector(`[data-a11y-key="${CSS.escape(key)}"]`);
}

/**
 * SVG mode: puts tree semantics directly on the drawn SVG elements. Items are
 * flat in the DOM, so level, position and set size are given explicitly.
 */
export function decorateSvg(
  chart: Element,
  model: AccessibleModel | undefined,
  visibleKeys: Set<string>,
  expanded: Set<string>,
  focusedKey: string | undefined,
) {
  chart.querySelectorAll('[data-a11y-key]').forEach((e) => {
    [
      'role',
      'tabindex',
      'aria-label',
      'aria-description',
      'aria-level',
      'aria-posinset',
      'aria-setsize',
      'aria-expanded',
      'aria-hidden',
      'data-a11y-key',
    ].forEach((a) => e.removeAttribute(a));
  });
  if (!model) {
    chart.removeAttribute('role');
    return;
  }
  chart.setAttribute('role', 'tree');
  chart.setAttribute('aria-label', model.summary);
  const walk = (
    item: AccessibleItem,
    level: number,
    pos: number,
    size: number,
  ) => {
    const element = focusTarget(chart, item);
    if (element) {
      element.setAttribute('data-a11y-key', item.key);
      element.setAttribute('role', 'treeitem');
      element.setAttribute('tabindex', item.key === focusedKey ? '0' : '-1');
      element.setAttribute('aria-label', item.label);
      if (item.description) {
        element.setAttribute('aria-description', item.description);
      }
      element.setAttribute('aria-level', String(level));
      element.setAttribute('aria-posinset', String(pos));
      element.setAttribute('aria-setsize', String(size));
      if (item.children.length) {
        element.setAttribute('aria-expanded', String(expanded.has(item.key)));
      }
      if (!visibleKeys.has(item.key)) {
        element.setAttribute('aria-hidden', 'true');
      }
    }
    item.children.forEach((c, i) =>
      walk(c, level + 1, i + 1, item.children.length),
    );
  };
  walk(model.root, 1, 1, 1);
}
