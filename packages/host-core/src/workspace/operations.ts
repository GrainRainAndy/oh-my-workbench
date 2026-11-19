import { validateLayout, type LayoutNode } from '../../../contracts/src/layout.ts';

type Leaf = Extract<LayoutNode, { type: 'leaf' }>;
type Command =
  | { kind: 'split'; axis: 'horizontal' | 'vertical'; leaf: Leaf }
  | { kind: 'resize'; ratio: number }
  | { kind: 'close' }
  | { kind: 'swap'; other: string };

export function edit(snapshot: LayoutNode, paneId: string, command: Command): LayoutNode {
  const { paneIds } = validateLayout(snapshot);
  if (!paneIds.has(paneId)) throw new Error('Unknown pane');
  if (command.kind === 'swap' && !paneIds.has(command.other)) throw new Error('Unknown swap target');
  const leaves = new Map<string, Leaf>();

  function collect(node: LayoutNode): void {
    if (node.type === 'leaf') leaves.set(node.paneId, node);
    else {
      collect(node.first);
      collect(node.second);
    }
  }
  if (command.kind === 'swap') collect(snapshot);

  function visit(node: LayoutNode): LayoutNode | null {
    if (node.type === 'leaf') {
      if (command.kind === 'swap' && node.paneId === command.other) return leaves.get(paneId)!;
      if (node.paneId !== paneId) return node;
      switch (command.kind) {
        case 'swap': return leaves.get(command.other)!;
        case 'close': return null;
        case 'split': return {type:'split', axis:command.axis, ratio:0.5, first:node, second:command.leaf};
        case 'resize': throw new Error('Pane has no parent split');
      }
    }
    if (command.kind === 'resize' && [node.first,node.second].some(child => child.type === 'leaf' && child.paneId === paneId))
      return {...node, ratio:command.ratio};
    const first = visit(node.first);
    const second = visit(node.second);
    if (!first || !second) return first ?? second;
    return first === node.first && second === node.second ? node : {...node, first, second};
  }

  const result = visit(snapshot) ?? {type:'leaf' as const, paneId};
  validateLayout(result);
  return result;
}
