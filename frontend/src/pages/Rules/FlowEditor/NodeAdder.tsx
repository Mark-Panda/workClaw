import { useState, useContext } from 'react';
import { useClientContext } from '@flowgram.ai/fixed-layout-editor';
import type { FlowNodeEntity, FixedLayoutPluginContext } from '@flowgram.ai/fixed-layout-editor';
import type { RuleNodeType } from './nodes';
import { NODE_LABELS, NODE_COLORS, NODE_CATEGORIES, getNodeFlowType } from './nodes';
import { RegistriesContext } from './context';

/**
 * The "+" button rendered between nodes. On click, shows a popover listing
 * all available rule node types. Selecting one inserts it via the document API.
 */
export default function NodeAdder(props: {
  from: FlowNodeEntity;
  to?: FlowNodeEntity;
  hoverActivated: boolean;
}) {
  const { from } = props;
  const [visible, setVisible] = useState(false);
  const ctx = useClientContext();
  const registries = useContext(RegistriesContext);

  const add = (type: RuleNodeType) => {
    const registry = registries.find((r) => r.type === getNodeFlowType(type));
    if (!registry) return;
    const json = registry.onAdd(ctx as unknown as FixedLayoutPluginContext, from);
    const block = ctx.operation.addFromNode(from, { ...json });
    setTimeout(() => {
      if (block) {
        ctx.playground.scrollToView({
          bounds: block.bounds,
          scrollToCenter: true,
        });
      }
    }, 50);
    setVisible(false);
  };

  if (ctx.playground.config.readonly) return null;

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {props.hoverActivated ? (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setVisible(!visible)}
            style={{
              width: 16,
              height: 16,
              borderRadius: 16,
              border: 'none',
              background: '#3370ff',
              color: '#fff',
              fontSize: 12,
              fontWeight: 'bold',
              lineHeight: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: '0 0 0 2px #fff',
            }}
          >
            +
          </button>

          {visible && (
            <>
              <div
                onClick={() => setVisible(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 99 }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 24,
                  top: -8,
                  zIndex: 100,
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  padding: 8,
                  minWidth: 180,
                  maxHeight: 320,
                  overflow: 'auto',
                }}
              >
                {NODE_CATEGORIES.map((cat) => (
                  <div key={cat.label}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                        letterSpacing: '.5px',
                        padding: '4px 8px 2px',
                      }}
                    >
                      {cat.label}
                    </div>
                    {cat.types.map((type) => (
                      <div
                        key={type}
                        onClick={() => add(type as RuleNodeType)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '5px 8px',
                          borderRadius: 5,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = '#f3f4f6';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = '';
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            background: NODE_COLORS[type] ?? '#8c8c8c',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ color: '#374151' }}>{NODE_LABELS[type]}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
