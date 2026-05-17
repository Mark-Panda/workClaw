import {
  usePlayground,
  useClientContext,
  FlowNodeRenderData,
  FlowNodeTransformData as FlowNodeTransformDataToken,
} from '@flowgram.ai/fixed-layout-editor';
import type { FlowNodeEntity, FlowNodeTransformData } from '@flowgram.ai/fixed-layout-editor';
import { IconPlus } from '@douyinfe/semi-icons';
import { nanoid } from 'nanoid';

/**
 * Custom BranchAdder that replaces the default from @flowgram.ai/fixed-semi-materials.
 * The default implementation leaks `isVertical` and `activated` props to the DOM,
 * causing React warnings. This version uses inline styles to avoid that.
 */
export default function BranchAdder(props: { activated: boolean; node: FlowNodeEntity }) {
  const { activated, node } = props;
  const nodeData = node.firstChild?.getData(FlowNodeRenderData);
  const playground = usePlayground();
  const ctx = useClientContext();
  const isVertical = node.isVertical;

  function addBranch() {
    // Determine the parent's rule node type to set appropriate branch data
    const parentData = node.getData(FlowNodeRenderData);
    const parentRuleType = (parentData as any)?.data?.ruleNodeType ?? '';
    const branchCount = node.blocks?.length ?? 0;
    const newIdx = branchCount;

    let ruleNodeType = '__branch__';
    let title = `Branch ${newIdx + 1}`;
    let config: Record<string, unknown> = {};

    if (parentRuleType === 'switch') {
      ruleNodeType = 'case';
      title = `Case ${newIdx + 1}`;
      config = { condition: '' };
    } else if (parentRuleType === 'if') {
      ruleNodeType = 'if_block';
      title = newIdx === 0 ? 'True' : 'False';
    } else if (parentRuleType === 'try_catch') {
      ruleNodeType = newIdx === 0 ? 'try_block' : 'catch_block';
      title = newIdx === 0 ? 'Try' : 'Catch';
      if (newIdx > 0) config = { error_type: '' };
    }

    const block = ctx.operation.addBlock(node, {
      id: nanoid(5),
      data: {
        ruleNodeType,
        title,
        config,
        __isBranch: true,
        branchIndex: newIdx,
      },
    });
    setTimeout(() => {
      playground.scrollToView({
        bounds: (block.getData(FlowNodeTransformDataToken) as FlowNodeTransformData).bounds,
        scrollToCenter: true,
      });
    }, 10);
  }

  if (playground.config.readonlyOrDisabled) return null;

  const isActive = activated || nodeData?.hovered;

  return (
    <div
      onMouseEnter={() => nodeData?.toggleMouseEnter()}
      onMouseLeave={() => nodeData?.toggleMouseLeave()}
      style={{
        width: 28,
        height: 18,
        background: isActive ? '#82A7FC' : 'rgb(187, 191, 196)',
        display: 'flex',
        borderRadius: 9,
        justifyContent: 'space-evenly',
        alignItems: 'center',
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
        transform: isVertical ? '' : 'rotate(90deg)',
      }}
    >
      <div
        onClick={() => addBranch()}
        aria-hidden="true"
        style={{ flexGrow: 1, textAlign: 'center', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
      >
        <IconPlus style={{ width: 12, height: 12 }} />
      </div>
    </div>
  );
}
