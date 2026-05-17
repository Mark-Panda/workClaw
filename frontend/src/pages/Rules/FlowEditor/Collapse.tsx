/**
 * Custom Collapse component that replaces the one from @flowgram.ai/fixed-semi-materials.
 *
 * The library's Collapse uses styled-components and passes `hoverActivated`, `isVertical`,
 * and `isCollapse` as props to a styled div. In newer React, these non-DOM props trigger
 * console warnings ("React does not recognize the `hoverActivated` prop on a DOM element").
 *
 * This version uses inline styles instead, eliminating the prop-forwarding issue.
 */
import type { FlowNodeEntity, FlowNodeTransformData } from '@flowgram.ai/fixed-layout-editor';
import {
  FlowNodeRenderData,
  FlowNodeTransformData as FlowNodeTransformDataToken,
  usePlayground,
} from '@flowgram.ai/fixed-layout-editor';

interface CollapseProps {
  collapseNode: FlowNodeEntity;
  activateNode?: FlowNodeEntity;
  hoverActivated: boolean;
  style?: React.CSSProperties;
}

/** A small arrow icon used inside the collapse circle. */
function Arrow({ color, circleColor }: { color: string; circleColor: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="5" r="5" fill={circleColor} />
      <path d="M3 3L6 5L3 7" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export default function Collapse(props: CollapseProps) {
  const { collapseNode, activateNode, hoverActivated, style } = props;
  const playground = usePlayground();
  const activateData = activateNode?.getData(FlowNodeRenderData);
  const transform: FlowNodeTransformData | undefined =
    collapseNode.getData(FlowNodeTransformDataToken);

  if (!transform) return null;

  const scrollToActivateNode = () => {
    setTimeout(() => {
      playground.config.scrollToView({
        position: activateNode?.getData(FlowNodeTransformDataToken)?.outputPoint,
        scrollToCenter: true,
      });
    }, 100);
  };

  const collapseBlock = () => {
    transform.collapsed = true;
    activateData?.toggleMouseLeave();
    scrollToActivateNode();
  };

  const openBlock = () => {
    transform.collapsed = false;
    scrollToActivateNode();
  };

  const isVertical = activateNode?.isVertical;
  const isCollapseValue = true;
  const bgColor = hoverActivated ? '#82A7FC' : '#BBBFC4';
  const rotate = !isVertical && isCollapseValue ? 'rotate(-90deg)' : '';

  const containerStyle: React.CSSProperties = {
    width: 16,
    height: 16,
    fontSize: 10,
    borderRadius: 9,
    display: 'flex',
    color: '#fff',
    cursor: 'pointer',
    justifyContent: 'center',
    alignItems: 'center',
    background: bgColor,
    transform: rotate,
    ...style,
  };

  if (transform.collapsed) {
    const childCount = collapseNode.allCollapsedChildren.filter(
      (child: FlowNodeEntity) => !child.hidden && child !== activateNode,
    ).length;

    return (
      <div onClick={openBlock} style={containerStyle} aria-hidden="true">
        {childCount}
      </div>
    );
  }

  const circleColor = 'var(--semi-color-white)';
  const arrowColor = hoverActivated ? '#82A7FC' : '#BBBFC4';

  return (
    <div onClick={collapseBlock} style={containerStyle} aria-hidden="true">
      <Arrow color={arrowColor} circleColor={circleColor} />
    </div>
  );
}
