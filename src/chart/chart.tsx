import {useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {useLocation} from 'react-router';
import {
  AccessibleItem,
  AccessibleModel,
  buildHourglassModel,
  JsonDataProvider,
} from 'topola';
import {AccessibleTree} from '../a11y/accessible_tree';
import {decorateSvg, showFocusRing, svgItemElement} from '../a11y/svg_targets';
import {useChartNavigator} from '../a11y/use_chart_navigator';
import {PlaceDisplay} from '../sidepanel/config/config';
import {Media} from '../util/media';
import {DEFAULT_PLACE_DISPLAY_COUNT, shortenPlace} from '../util/place_util';
import {usePrevious} from '../util/previous-hook';
import {ChartProps, ChartType} from './chart_types';
import {ChartWrapper, ZOOM_FACTOR} from './chart_wrapper';

/**
 * How the accessible model is exposed, chosen with the `a11y` URL parameter:
 * - html (default): a visually hidden HTML tree; the SVG is aria-hidden.
 * - svg: tree roles and names directly on the SVG elements.
 */
type A11yMode = 'html' | 'svg';

function visibleKeys(model: AccessibleModel, expanded: Set<string>) {
  const keys = new Set<string>();
  const walk = (item: AccessibleItem) => {
    keys.add(item.key);
    if (expanded.has(item.key)) item.children.forEach(walk);
  };
  walk(model.root);
  return keys;
}

export function Chart(props: ChartProps) {
  const chartWrapper = useRef(new ChartWrapper());
  const prevProps = usePrevious(props);
  const intl = useIntl();
  const location = useLocation();
  const a11yMode: A11yMode =
    new URLSearchParams(location.search).get('a11y') === 'svg' ? 'svg' : 'html';

  const [model, setModel] = useState<AccessibleModel>();
  const [chartFocused, setChartFocused] = useState(false);
  const navigator = useChartNavigator(model, {
    onSelection: props.onSelection,
    onDetailSelection: props.onDetailSelection,
  });

  const placeDisplay = props.placeDisplay ?? PlaceDisplay.FULL;
  const placeCount = props.placeCount ?? DEFAULT_PLACE_DISPLAY_COUNT;

  const processedData = useMemo(() => {
    if (placeDisplay === PlaceDisplay.FULL) {
      return props.data;
    }
    return {
      ...props.data,
      indis: props.data.indis.map((indi) => ({
        ...indi,
        birth: indi.birth
          ? {
              ...indi.birth,
              place: shortenPlace(indi.birth.place, placeDisplay, placeCount),
            }
          : undefined,
        death: indi.death
          ? {
              ...indi.death,
              place: shortenPlace(indi.death.place, placeDisplay, placeCount),
            }
          : undefined,
      })),
      fams: props.data.fams.map((fam) => ({
        ...fam,
        marriage: fam.marriage
          ? {
              ...fam.marriage,
              place: shortenPlace(fam.marriage.place, placeDisplay, placeCount),
            }
          : undefined,
      })),
    };
  }, [props.data, placeDisplay, placeCount]);

  // Build the accessible model from every render of the chart. Only the
  // hourglass chart has a model so far.
  chartWrapper.current.onRendered = (info, renderedProps) => {
    setModel(
      renderedProps.chartType === ChartType.Hourglass && info.layout
        ? buildHourglassModel(
            info.layout,
            new JsonDataProvider(renderedProps.data),
          )
        : undefined,
    );
  };

  useEffect(() => {
    const propsWithProcessedData: ChartProps = {...props, data: processedData};
    if (prevProps) {
      const initialRender =
        props.chartType !== prevProps?.chartType ||
        props.colors !== prevProps?.colors ||
        props.hideIds !== prevProps?.hideIds ||
        props.hideSex !== prevProps?.hideSex ||
        props.placeDisplay !== prevProps?.placeDisplay ||
        props.placeCount !== prevProps?.placeCount;
      const resetPosition =
        props.chartType !== prevProps?.chartType ||
        props.data !== prevProps.data ||
        // This does not work as the objects are always different instances.
        //props.selection !== prevProps.selection;
        // Therefore, compare id and generation instead.
        props.selection.id !== prevProps.selection.id ||
        props.selection.generation !== prevProps.selection.generation;
      chartWrapper.current.renderChart(propsWithProcessedData, intl, {
        initialRender,
        resetPosition,
      });
    } else {
      chartWrapper.current.renderChart(propsWithProcessedData, intl, {
        initialRender: true,
        resetPosition: true,
      });
      // Clear the loading pill now that the chart SVG is in the DOM.
      // This fires before the D3 fade-in animation completes (~400ms), which
      // is intentional: the chart is visible and interactive at this point,
      // and keeping the pill visible during the animation would create a
      // confusing overlap.
      props.onFirstRender?.();
    }
  });

  const {focusedKey, expanded, focusRequest, scrollRequest} = navigator;

  // SVG mode: tree semantics on the SVG elements.
  useEffect(() => {
    const chart = document.getElementById('chart');
    if (!chart) return;
    decorateSvg(
      chart,
      a11yMode === 'svg' ? model : undefined,
      model ? visibleKeys(model, expanded) : new Set(),
      expanded,
      focusedKey,
    );
  }, [a11yMode, model, expanded, focusedKey]);

  useEffect(() => {
    if (a11yMode !== 'svg' || !focusRequest || !focusedKey) return;
    const chart = document.getElementById('chart');
    if (!chart) return;
    (svgItemElement(chart, focusedKey) as HTMLElement | null)?.focus({
      preventScroll: true,
    });
  }, [a11yMode, focusRequest, focusedKey, model]);

  // Focus ring on the drawn box, only while keyboard focus is in the chart.
  const lastScrollRequest = useRef(0);
  useEffect(() => {
    const chart = document.getElementById('chart');
    if (!chart) return;
    const scroll = scrollRequest !== lastScrollRequest.current;
    lastScrollRequest.current = scrollRequest;
    showFocusRing(
      chart,
      chartFocused && model && focusedKey
        ? model.items.get(focusedKey)
        : undefined,
      scroll,
    );
  }, [model, focusedKey, chartFocused, scrollRequest]);

  const trackFocus = {
    onFocus: () => setChartFocused(true),
    onBlur: (e: React.FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && !(e.currentTarget as Node).contains(next)) {
        setChartFocused(false);
      }
    },
  };

  return (
    <>
      <div aria-live="polite" className="a11y-visually-hidden">
        {navigator.announcement}
      </div>
      {a11yMode === 'html' && model ? (
        <div {...trackFocus}>
          <AccessibleTree navigator={navigator} />
        </div>
      ) : null}
      <div id="svgContainer">
        <Media greaterThanOrEqual="large" className="zoom">
          <button
            className="zoom-in"
            aria-label="Zoom in"
            onClick={() => chartWrapper.current.zoom(ZOOM_FACTOR)}
          >
            +
          </button>
          <button
            className="zoom-out"
            aria-label="Zoom out"
            onClick={() => chartWrapper.current.zoom(1 / ZOOM_FACTOR)}
          >
            −
          </button>
        </Media>
        <svg
          id="chartSvg"
          aria-hidden={a11yMode === 'html' && model ? true : undefined}
          {...(a11yMode === 'svg'
            ? {
                ...trackFocus,
                onKeyDown: navigator.onKeyDown,
                onFocusCapture: navigator.onFocusIn,
                onBlurCapture: navigator.onFocusOut,
              }
            : {})}
        >
          <g id="chart" data-testid="chart" />
        </svg>
      </div>
    </>
  );
}
