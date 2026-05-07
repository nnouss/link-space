import ForceGraph3D from 'react-force-graph-3d';
import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
  TorusGeometry
} from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import type { NavigationEdge, PageNode, SearchSession } from '../shared/types';

interface GraphViewProps {
  session: SearchSession | null;
  nodes: Record<string, PageNode>;
  edges: Record<string, NavigationEdge>;
  selectedNodeId?: string | null;
  onSelectNode: (node: PageNode) => void;
}

export interface GraphNode {
  id: string;
  page: PageNode;
  title: string;
  label: string;
  color: string;
  value: number;
  isRoot: boolean;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
}

const NODE_COLORS = [
  '#54c7a1',
  '#6fb8da',
  '#9da9e8',
  '#d7bf72',
  '#dc8f82'
];
const BACKGROUND_COLOR = 'rgb(17, 24, 32)';
const ROOT_COLOR = '#7de6bd';
const ROOT_RING_COLOR = '#a4f4d2';

export function GraphView({ session, nodes, edges, selectedNodeId, onSelectNode }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const size = useElementSize(containerRef);
  const graphData = useMemo(() => toGraphData(session, nodes, edges), [edges, nodes, session]);

  return (
    <div ref={containerRef} style={graphContainerStyle}>
      {!session ? (
        <div style={emptyStateStyle}>
          <p style={{ margin: 0 }}>Select a session to inspect its graph.</p>
        </div>
      ) : (
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
          nodeThreeObject={(node) => createNodeObject(node, node.id === selectedNodeId)}
          linkColor={() => '#8190a3'}
          linkWidth={0.4}
          linkOpacity={0.46}
          showNavInfo={false}
          enableNodeDrag={false}
          onNodeClick={(node) => onSelectNode(node.page)}
        />
      )}
    </div>
  );
}

export function toGraphData(
  session: SearchSession | null,
  nodes: Record<string, PageNode>,
  edges: Record<string, NavigationEdge>
): { nodes: GraphNode[]; links: GraphLink[] } {
  if (!session) {
    return { nodes: [], links: [] };
  }

  const graphNodes = session.nodeIds
    .map((nodeId) => nodes[nodeId])
    .filter((node): node is PageNode => Boolean(node))
    .map((node) => ({
      id: node.id,
      page: node,
      title: node.title,
      label: node.id === session.rootNodeId ? rootNodeLabel(node) : compactNodeLabel(node),
      color: node.id === session.rootNodeId ? ROOT_COLOR : NODE_COLORS[node.depth % NODE_COLORS.length],
      value: nodeValue(node, node.id === session.rootNodeId),
      isRoot: node.id === session.rootNodeId
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
}

function nodeValue(node: PageNode, isRoot: boolean): number {
  const visitScore = Math.min(node.visitCount, 8);

  return (isRoot ? 3.5 : 1.4) + visitScore * 0.7;
}

function createNodeObject(node: GraphNode, isSelected: boolean) {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: new Color(node.color),
    transparent: true,
    opacity: node.isRoot ? 0.96 : 0.86
  });
  const mesh = node.isRoot
    ? new Mesh(new OctahedronGeometry(2.85, 0), material)
    : new Mesh(new SphereGeometry(Math.max(1.85, node.value * 0.48), 24, 16), material);

  group.add(mesh);

  if (node.isRoot) {
    const ring = new Mesh(
      new TorusGeometry(3.82, 0.045, 8, 48),
      new MeshBasicMaterial({
        color: new Color(ROOT_RING_COLOR),
        transparent: true,
        opacity: 0.56
      })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  if (node.isRoot || isSelected) {
    const label = createTextSprite(node.label, node.isRoot);
    label.position.set(0, node.isRoot ? 4.45 : 3.35, 0);
    group.add(label);
  }

  return group;
}

function createTextSprite(text: string, isRoot: boolean) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const fontSize = isRoot ? 34 : 30;
  const paddingX = 22;
  const paddingY = 12;
  if (context) {
    context.font = `600 ${fontSize}px Pretendard, Segoe UI, sans-serif`;
  }
  const measuredWidth = context ? context.measureText(text).width : text.length * fontSize * 0.55;

  canvas.width = Math.ceil(measuredWidth + paddingX * 2);
  canvas.height = fontSize + paddingY * 2;

  const drawContext = canvas.getContext('2d');
  if (drawContext) {
    drawContext.font = `600 ${fontSize}px Pretendard, Segoe UI, sans-serif`;
    drawContext.fillStyle = isRoot ? 'rgba(17, 28, 26, 0.86)' : 'rgba(17, 24, 32, 0.78)';
    roundRect(drawContext, 0, 0, canvas.width, canvas.height, 12);
    drawContext.fill();
    drawContext.fillStyle = isRoot ? '#c9f8df' : '#d8e5ee';
    drawContext.textBaseline = 'middle';
    drawContext.fillText(text, paddingX, canvas.height / 2);
  }

  const texture = new Texture(canvas);
  texture.needsUpdate = true;
  const sprite = new Sprite(
    new SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    })
  );
  sprite.scale.set(canvas.width / 18, canvas.height / 18, 1);

  return sprite;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function rootNodeLabel(node: PageNode): string {
  return `${node.domain} / ${truncateText(node.title, 28)}`;
}

function compactNodeLabel(node: PageNode): string {
  try {
    return truncateText(`${node.domain}${new URL(node.url).pathname}`, 38);
  } catch {
    return truncateText(`${node.domain} / ${node.title}`, 38);
  }
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function useElementSize(ref: RefObject<HTMLElement | null>) {
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
} satisfies CSSProperties;

const emptyStateStyle = {
  alignItems: 'center',
  background: BACKGROUND_COLOR,
  color: 'oklch(82% 0.018 225)',
  display: 'flex',
  fontFamily:
    'Pretendard, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: 16,
  height: '100%',
  justifyContent: 'center',
  width: '100%'
} satisfies CSSProperties;
