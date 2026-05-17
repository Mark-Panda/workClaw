import { createContext } from 'react';

/** Info about the currently selected node in the canvas. */
export interface SelectedNodeInfo {
  id: string;
  ruleNodeType: string;
  title: string;
}

export interface NodeSelectionContextType {
  selectedNode: SelectedNodeInfo | null;
  setSelectedNode: (node: SelectedNodeInfo | null | ((prev: SelectedNodeInfo | null) => SelectedNodeInfo | null)) => void;
}

export const NodeSelectionContext = createContext<NodeSelectionContextType>({
  selectedNode: null,
  setSelectedNode: () => {},
});
