import type { TlvNode } from '@/core/types';
import { Badge } from '@/components/ui/Badge';

function Row({ node, depth }: { node: TlvNode; depth: number }) {
  return (
    <>
      <tr className={node.known ? '' : 'bg-amber-50/60'}>
        <td className="mono whitespace-nowrap" style={{ paddingLeft: 12 + depth * 18 }}>
          {depth > 0 && <span className="mr-1 text-slate-300">└</span>}
          <span className="font-semibold text-blue-700">{node.tag}</span>
        </td>
        <td className="text-xs">
          {node.name} {!node.known && <Badge tone="amber">UNKNOWN</Badge>} {node.constructed && <Badge tone="blue">TEMPLATE</Badge>}
        </td>
        <td className="mono text-right">{node.length}</td>
        <td className="mono break-all text-xs text-slate-700">{node.constructed ? <span className="text-slate-400">{node.children?.length ?? 0} data object(s)</span> : node.display ?? node.valueHex}</td>
      </tr>
      {node.children?.map((c) => <Row key={`${c.path}-${c.offset}`} node={c} depth={depth + 1} />)}
    </>
  );
}

export function TlvTree({ nodes }: { nodes: TlvNode[] }) {
  if (!nodes.length) return <p className="text-sm text-slate-400">No data objects decoded.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="table-base">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Name</th>
            <th className="text-right">Len</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>{nodes.map((n) => <Row key={`${n.path}-${n.offset}`} node={n} depth={0} />)}</tbody>
      </table>
    </div>
  );
}
