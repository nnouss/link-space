import ForceGraph3D from 'react-force-graph-3d';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NavigationEdge, PageNode, SearchSession } from '../shared/types';

interface GraphViewProps {
  session: SearchSession | null;
  nodes: Record<string, PageNode>;
  edges: Record<string, NavigationEdge>;
  onSelectNode: (node: PageNode) => void;
}

interface GraphNode {
  id: string;
  page: PageNode;
  title: string;
  color: string;
  value: number;
}

interface GraphLink {
  id: string;
  source: string;
  target: string;
}

const NODE_COLORS = ['#6ee7b7', '#60a5fa', '#c084fc', '#fbbf24', '#fb7185'];
const BACKGROUND_COLOR = '#111315';

export function GraphView({ session, nodes, edges, onSelectNode }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const size = useElementSize(containerRef);

  const graphData = useMemo(() => {
    if (!session) {
      return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    }

    const graphNodes = session.nodeIds
      .map((nodeId) => nodes[nodeId])
      .filter((node): node is PageNode => Boolean(node))
      .map((node) => ({
        id: node.id,
        page: node,
        title: node.title,
        color: NODE_COLORS[node.depth % NODE_COLORS.length],
        value: nodeValue(node)
      }));

    const nodeIds = new Set(graphNodes.map((node) => node.id));
    const graphLinks = session.edgeIds
      .map((edgeId) => edges[edgeId])
      .filter((edge): edge is NavigationEdge => {
        return Boolean(edge && nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId));
      })
      .map((edge) => ({
        id: edge.id,
        source: edge.fromNodeId,
        target: edge.toNodeId
      }));

    return { nodes: graphNodes, links: graphLinks };
  }, [edges, nodes, session]);

  if (!session) {
    return (
      <div ref={containerRef} style={emptyStateStyle}>
        <p style={{ margin: 0 }}>세션을 선택하세요.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={graphContainerStyle}>
      <ForceGraph3D
        graphData={graphData}
        width={size.width}
        height={size.height}
        backgroundColor={BACKGROUND_COLOR}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeLabel="title"
        nodeVal="value"
        nodeColor="color"
        nodeRelSize={5}
        nodeResolution={24}
        linkColor={() => '#4b5563'}
        linkWidth={0.35}
        linkOpacity={0.42}
        showNavInfo={false}
        enableNodeDrag={false}
        onNodeClick={(node) => onSelectNode(node.page)}
      />
    </div>
  );
}

function nodeValue(node: PageNode): number {
  const dwellScore = Math.min(node.dwellTime / 30_000, 8);
  const visitScore = Math.min(node.visitCount, 8);

  return 1.4 + dwellScore + visitScore * 0.8;
}

function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState(() => ({
    width: 1,
    height: 1
  }));

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const observedElement = element;

    function updateSize() {
      const rect = observedElement.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height))
      });
    }

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(observedElement);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}

const graphContainerStyle = {
  background: BACKGROUND_COLOR,
  height: '100%',
  width: '100%'
} satisfies React.CSSProperties;

const emptyStateStyle = {
  alignItems: 'center',
  background: BACKGROUND_COLOR,
  color: '#d1d5db',
  display: 'flex',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 16,
  height: '100%',
  justifyContent: 'center',
  width: '100%'
} satisfies React.CSSProperties;
