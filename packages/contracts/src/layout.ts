export type LayoutNode =
  | { type: 'leaf'; paneId: string; viewInstanceId?: string }
  | { type: 'split'; axis: 'horizontal' | 'vertical'; ratio: number; first: LayoutNode; second: LayoutNode };

export function validateLayout(root: unknown) {
  const paneIds = new Set<string>();
  const viewIds = new Set<string>();
  let count = 0;

  function register(id: unknown, ids: Set<string>) {
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) throw new Error('Invalid or duplicate layout ID');
    ids.add(id);
  }

  function visit(value: unknown, depth: number) {
    if (++count > 255 || depth > 32) throw new Error('Layout exceeds supported size');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected layout node');
    const node = value as Record<string, unknown>;
    if (node.type === 'leaf') {
      register(node.paneId, paneIds);
      if ('viewInstanceId' in node) register(node.viewInstanceId, viewIds);
      return;
    }
    if (node.type !== 'split' || !['vertical','horizontal'].includes(String(node.axis)) ||
        typeof node.axis !== 'string' || typeof node.ratio !== 'number' || !(node.ratio > 0 && node.ratio < 1))
      throw new Error('Invalid split');
    visit(node.first, depth + 1);
    visit(node.second, depth + 1);
  }

  visit(root, 1);
  return { paneIds, viewIds };
}
