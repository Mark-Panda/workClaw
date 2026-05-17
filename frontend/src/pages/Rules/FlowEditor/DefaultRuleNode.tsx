import { useState, useContext, useEffect } from 'react';
import { useNodeRender } from '@flowgram.ai/fixed-layout-editor';
import { NODE_LABELS, NODE_COLORS, nodeIcon, toRuleNodeType } from './nodes';
import { NotifyContext } from './context';
import { NodeSelectionContext } from './nodeSelection';

/** Port dot — the input/output connection circle on node edges. */
function PortDot({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      style={{
        position: 'absolute',
        [side]: -5,
        top: '50%',
        marginTop: -4,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#fff',
        border: '2px solid #c0c4cc',
        boxSizing: 'border-box',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
}

export default function DefaultRuleNode() {
  const { id, data, activated, onMouseEnter, onMouseLeave, form, deleteNode } = useNodeRender();
  const [hovered, setHovered] = useState(false);
  const notifyChange = useContext(NotifyContext);
  const { setSelectedNode } = useContext(NodeSelectionContext);

  // Propagate form value changes up to the DSL
  useEffect(() => {
    if (!form) return;
    const disposable = form.onFormValuesChange(() => {
      notifyChange();
    });
    return () => disposable.dispose();
  }, [form, notifyChange]);

  // Node type and metadata
  // FlowGram internal structural nodes (blockIcon, inlineBlocks, etc.) may not have
  // our ruleNodeType or a type field at all — guard against undefined.
  const myNodeType = (data?.ruleNodeType as string) ?? (typeof data?.type === 'string' ? toRuleNodeType(data?.type as string) : '');
  const myTitle = (data?.title as string) ?? NODE_LABELS[myNodeType] ?? myNodeType;
  const nodeId = id as string;

  // If this is not a recognized rule node (e.g. FlowGram internal node), render nothing
  if (!myNodeType) return null;

  // Select node on click
  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNode({ id: nodeId, ruleNodeType: myNodeType, title: myTitle });
  };

  // Deselect when this node loses activation
  useEffect(() => {
    if (!activated) {
      setSelectedNode((prev) => (prev?.id === nodeId ? null : prev));
    }
  }, [activated, nodeId, setSelectedNode]);

  const ruleNodeType = myNodeType;
  const title = (data?.title as string) ?? NODE_LABELS[ruleNodeType] ?? ruleNodeType;
  const color = NODE_COLORS[ruleNodeType] ?? '#8c8c8c';
  const icon = nodeIcon(ruleNodeType);

  const isActive = activated || hovered;
  const hasFormErrors = form?.state.invalid;

  // Determine if this is a branch/block node (smaller, minimal)
  const isBlock = ['if_block', 'case', 'case_default', 'try_block', 'catch_block', '__branch__'].includes(ruleNodeType);

  if (isBlock) {
    return (
      <div
        onClick={handleNodeClick}
        onMouseEnter={(e) => { setHovered(true); onMouseEnter?.(e); }}
        onMouseLeave={(e) => { setHovered(false); onMouseLeave?.(e); }}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: ruleNodeType === 'if_block'
            ? (title === 'True' || title === 'true' ? '#e6f7e6' : '#fff1f0')
            : '#fff',
          border: `1px solid ${isActive ? color : '#d9d9d9'}`,
          borderRadius: 4,
          cursor: 'pointer',
          boxSizing: 'border-box',
          minWidth: 60,
          height: 20,
          padding: '0 8px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: 10,
          fontWeight: 600,
          color: ruleNodeType === 'if_block'
            ? (title === 'True' || title === 'true' ? '#389e0d' : '#cf1322')
            : '#595959',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {title}
      </div>
    );
  }

  return (
    <div
      onClick={handleNodeClick}
      onMouseEnter={(e) => { setHovered(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHovered(false); onMouseLeave?.(e); }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        background: '#fff',
        border: `1px solid ${isActive ? '#82a7fc' : 'rgba(6,7,9,0.15)'}`,
        borderRadius: 8,
        boxShadow: isActive
          ? '0 2px 6px 0 rgba(0,0,0,0.04), 0 4px 12px 0 rgba(0,0,0,0.02)'
          : '0 1px 2px rgba(0,0,0,0.04)',
        outline: hasFormErrors ? '1px solid red' : 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        minWidth: 140,
        minHeight: 44,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        overflow: 'visible',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Input port */}
      <PortDot side="left" />

      {/* Left color strip */}
      <div
        style={{
          width: 4,
          height: '100%',
          background: color,
          borderRadius: '7px 0 0 7px',
          flexShrink: 0,
          minHeight: 44,
        }}
      />

      {/* Icon */}
      <div
        style={{
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 8,
          flexShrink: 0,
          borderRadius: 6,
          background: `${color}14`,
        }}
      >
        <img src={icon} alt="" width={16} height={16} style={{ display: 'block' }} />
      </div>

      {/* Title + type */}
      <div style={{ flex: 1, padding: '4px 10px', minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#1f2937',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: '18px',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 10,
            color: '#8c8c8c',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: '14px',
          }}
        >
          {ruleNodeType}
        </div>
      </div>

      {/* Delete button */}
      {hovered && ruleNodeType !== 'start' && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`确认删除节点「${title}」？`)) {
              deleteNode();
            }
          }}
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#9ca3af',
            fontSize: 14,
            fontWeight: 600,
            flexShrink: 0,
            marginRight: 4,
          }}
          title="删除节点"
        >
          ×
        </div>
      )}

      {/* Output port */}
      <PortDot side="right" />
    </div>
  );
}
