import { ReactNode, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { buildTree, TreeItem, TreeNode } from '../lib/tree';

export function TreeView<T extends TreeItem>({
  items,
  selected,
  onSelect,
  renderMeta,
  renderIcon,
  filter,
  defaultDepth = 1,
}: {
  items: T[];
  selected?: string | null;
  onSelect: (item: T) => void;
  renderMeta?: (item: T) => ReactNode;
  renderIcon?: (item: T) => ReactNode;
  filter?: string;
  defaultDepth?: number;
}) {
  const roots = useMemo(() => buildTree(items), [items]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const matches = useMemo(() => {
    if (!filter) return null;
    const s = filter.toLowerCase();
    const keep = new Set<string>();
    const byId = new Map(items.map((i) => [i._id, i]));
    for (const i of items) {
      if (i.name.toLowerCase().includes(s) || String(i.code || '').toLowerCase().includes(s)) {
        let cur: T | undefined = i;
        while (cur) {
          keep.add(cur._id);
          cur = cur.parent ? byId.get(String(cur.parent)) : undefined;
        }
      }
    }
    return keep;
  }, [filter, items]);

  const render = (nodes: TreeNode<T>[]): ReactNode =>
    nodes
      .filter((n) => !matches || matches.has(n.item._id))
      .map((n) => {
        const isOpen = matches ? true : open[n.item._id] ?? n.depth < defaultDepth;
        return (
          <div key={n.item._id}>
            <div className={`tree-node ${selected === n.item._id ? 'selected' : ''}`} onClick={() => onSelect(n.item)}>
              <span
                className="caret"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((o) => ({ ...o, [n.item._id]: !isOpen }));
                }}
                style={{ visibility: n.children.length ? 'visible' : 'hidden' }}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              {renderIcon?.(n.item)}
              <span className="name ellipsis">{n.item.name}</span>
              {renderMeta?.(n.item)}
            </div>
            {isOpen && n.children.length > 0 && <div className="tree-children">{render(n.children)}</div>}
          </div>
        );
      });

  return <div className="tree">{render(roots)}</div>;
}
