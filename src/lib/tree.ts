export interface TreeItem {
  _id: string;
  name: string;
  parent?: string | null;
  [key: string]: any;
}

export interface TreeNode<T extends TreeItem = TreeItem> {
  item: T;
  children: TreeNode<T>[];
  depth: number;
}

export function buildTree<T extends TreeItem>(items: T[]): TreeNode<T>[] {
  const map = new Map<string, TreeNode<T>>();
  items.forEach((item) => map.set(item._id, { item, children: [], depth: 0 }));
  const roots: TreeNode<T>[] = [];
  map.forEach((node) => {
    const p = node.item.parent ? map.get(String(node.item.parent)) : undefined;
    if (p) p.children.push(node);
    else roots.push(node);
  });
  const setDepth = (nodes: TreeNode<T>[], d: number) =>
    nodes.forEach((n) => {
      n.depth = d;
      n.children.sort((a, b) => a.item.name.localeCompare(b.item.name));
      setDepth(n.children, d + 1);
    });
  roots.sort((a, b) => a.item.name.localeCompare(b.item.name));
  setDepth(roots, 0);
  return roots;
}

export function flatten<T extends TreeItem>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  const out: TreeNode<T>[] = [];
  const walk = (ns: TreeNode<T>[]) =>
    ns.forEach((n) => {
      out.push(n);
      walk(n.children);
    });
  walk(nodes);
  return out;
}

export function pathOf<T extends TreeItem>(id: string | undefined | null, items: T[], sep = ' › '): string {
  if (!id) return '';
  const map = new Map(items.map((i) => [i._id, i]));
  const parts: string[] = [];
  let cur = map.get(String(id));
  let guard = 0;
  while (cur && guard < 20) {
    parts.unshift(cur.name);
    cur = cur.parent ? map.get(String(cur.parent)) : undefined;
    guard += 1;
  }
  return parts.join(sep);
}

export function descendantIds<T extends TreeItem>(id: string, items: T[]): string[] {
  const out = [id];
  const walk = (pid: string) =>
    items.filter((i) => String(i.parent) === pid).forEach((c) => {
      out.push(c._id);
      walk(c._id);
    });
  walk(id);
  return out;
}
