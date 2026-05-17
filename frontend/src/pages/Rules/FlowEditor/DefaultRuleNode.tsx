import { useState, useContext, useEffect } from 'react';
import { useNodeRender } from '@flowgram.ai/fixed-layout-editor';
import type { RuleNodeType } from './nodes';
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

  // Compute stable values so they can be used in callbacks without re-renders
  const myNodeType = (data?.ruleNodeType as string) ?? toRuleNodeType(data?.type as string) ?? '';
  const myTitle = (data?.title as string) ?? NODE_LABELS[myNodeType as RuleNodeType] ?? myNodeType;
  const nodeId = id as string;

  // Select node on click (not hover). Stop propagation so background clicks
  // on the canvas container won't also fire.
  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedNode({ id: nodeId, ruleNodeType: myNodeType, title: myTitle });
  };

  // Deselect when this node loses activation (another node selected or background clicked)
  useEffect(() => {
    if (!activated) {
      setSelectedNode((prev) => (prev?.id === nodeId ? null : prev));
    }
  }, [activated, nodeId, setSelectedNode]);

  const ruleNodeType = (data?.ruleNodeType as RuleNodeType) ?? toRuleNodeType(data?.type as string) ?? 'start' as RuleNodeType;
  const title = (data?.title as string) ?? NODE_LABELS[ruleNodeType as RuleNodeType] ?? ruleNodeType;
  const color = NODE_COLORS[ruleNodeType as RuleNodeType] ?? '#8c8c8c';
  const icon = nodeIcon(ruleNodeType as RuleNodeType);

  const isActive = activated || hovered;

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
        border: `1px solid ${isActive ? color : '#d9d9d9'}`,
        borderRadius: 8,
        boxShadow: isActive
          ? `0 0 0 2px ${color}22, 0 2px 8px rgba(0,0,0,0.08)`
          : '0 1px 2px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        boxSizing: 'border-box',
        minWidth: 140,
        height: 40,
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

      {/* Title */}
      <div
        style={{
          flex: 1,
          padding: '0 10px',
          fontSize: 12,
          fontWeight: 500,
          color: '#1f2937',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: '40px',
        }}
      >
        {title}
      </div>

      {/* Type badge */}
      <div style={{ paddingRight: 10, flexShrink: 0 }}>
        <span
          style={{
            fontSize: 10,
            color,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
            opacity: 0.7,
          }}
        >
          {ruleNodeType}
        </span>
      </div>

      {/* Delete button — visible on hover, hidden for start node */}
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
