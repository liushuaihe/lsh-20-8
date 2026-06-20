import type {
  Station,
  MetroLine,
  Edge,
  RouteResult,
  RouteStrategy,
  TimePeriod,
  PathSegment,
  TransferInfo,
} from '@/types/metro';
import {
  stations as allStations,
  metroLines,
  getStationById,
  getLineById,
  getTransferChannel,
  fareConfig,
} from '@/data/metroNetwork';

interface GraphNode {
  stationId: string;
  lineId: string;
}

interface GraphEdge {
  from: GraphNode;
  to: GraphNode;
  weight: number;
  type: 'travel' | 'transfer';
  time: number;
  fare: number;
  stationCount?: number;
}

interface PathNode {
  node: GraphNode;
  prev: PathNode | null;
  edge: GraphEdge | null;
  cost: number;
  time: number;
  fare: number;
  transfers: number;
  stationCount: number;
  strategy?: RouteStrategy;
}

class PriorityQueue<T> {
  private heap: { item: T; priority: number }[] = [];

  enqueue(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp();
  }

  dequeue(): T | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0].item;
    const end = this.heap.pop();
    if (this.heap.length > 0 && end) {
      this.heap[0] = end;
      this.bubbleDown();
    }
    return top;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private bubbleUp(): void {
    let idx = this.heap.length - 1;
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (this.heap[idx].priority >= this.heap[parentIdx].priority) break;
      [this.heap[idx], this.heap[parentIdx]] = [this.heap[parentIdx], this.heap[idx]];
      idx = parentIdx;
    }
  }

  private bubbleDown(): void {
    let idx = 0;
    const length = this.heap.length;
    while (true) {
      const leftIdx = 2 * idx + 1;
      const rightIdx = 2 * idx + 2;
      let smallestIdx = idx;
      if (leftIdx < length && this.heap[leftIdx].priority < this.heap[smallestIdx].priority) {
        smallestIdx = leftIdx;
      }
      if (rightIdx < length && this.heap[rightIdx].priority < this.heap[smallestIdx].priority) {
        smallestIdx = rightIdx;
      }
      if (smallestIdx === idx) break;
      [this.heap[idx], this.heap[smallestIdx]] = [this.heap[smallestIdx], this.heap[idx]];
      idx = smallestIdx;
    }
  }
}

function nodeKey(node: GraphNode): string {
  return `${node.stationId}@${node.lineId}`;
}

function buildAdjacencyList(
  blockedStations: Set<string>,
  timePeriod: TimePeriod,
): Map<string, GraphEdge[]> {
  const adjacency = new Map<string, GraphEdge[]>();

  const peakMultiplier =
    timePeriod === 'morning-peak' || timePeriod === 'evening-peak'
      ? 1 + fareConfig.peakSurcharge
      : 1;

  for (const line of metroLines) {
    for (let i = 0; i < line.stations.length - 1; i++) {
      const fromStation = line.stations[i];
      const toStation = line.stations[i + 1];

      if (blockedStations.has(fromStation) || blockedStations.has(toStation)) continue;

      const baseTime = 3;
      const travelTime = timePeriod === 'morning-peak' || timePeriod === 'evening-peak'
        ? Math.ceil(baseTime * 1.3)
        : baseTime;

      const fare = line.baseFarePerStation * peakMultiplier;

      const forwardEdge: GraphEdge = {
        from: { stationId: fromStation, lineId: line.id },
        to: { stationId: toStation, lineId: line.id },
        weight: 0,
        type: 'travel',
        time: travelTime,
        fare,
        stationCount: 1,
      };

      const backwardEdge: GraphEdge = {
        from: { stationId: toStation, lineId: line.id },
        to: { stationId: fromStation, lineId: line.id },
        weight: 0,
        type: 'travel',
        time: travelTime,
        fare,
        stationCount: 1,
      };

      const fwdKey = nodeKey(forwardEdge.from);
      const bwdKey = nodeKey(backwardEdge.from);
      if (!adjacency.has(fwdKey)) adjacency.set(fwdKey, []);
      if (!adjacency.has(bwdKey)) adjacency.set(bwdKey, []);
      adjacency.get(fwdKey)!.push(forwardEdge);
      adjacency.get(bwdKey)!.push(backwardEdge);
    }
  }

  for (const station of allStations) {
    if (blockedStations.has(station.id)) continue;
    for (const fromLine of station.lines) {
      for (const toLine of station.lines) {
        if (fromLine === toLine) continue;
        const channel = getTransferChannel(station.id, fromLine, toLine);
        if (!channel) continue;

        let walkTime = channel.walkTime;
        if (timePeriod === 'morning-peak' || timePeriod === 'evening-peak') {
          walkTime = Math.ceil(walkTime * channel.crowdFactor);
        }

        const isHub = station.isHub;
        const transferPenalty = isHub ? fareConfig.hubTransferSurcharge : 0.5;

        const transferEdge: GraphEdge = {
          from: { stationId: station.id, lineId: fromLine },
          to: { stationId: station.id, lineId: toLine },
          weight: 0,
          type: 'transfer',
          time: walkTime,
          fare: transferPenalty * peakMultiplier,
        };

        const key = nodeKey(transferEdge.from);
        if (!adjacency.has(key)) adjacency.set(key, []);
        adjacency.get(key)!.push(transferEdge);
      }
    }
  }

  return adjacency;
}

function computeEdgeWeight(edge: GraphEdge, strategy: RouteStrategy): number {
  switch (strategy) {
    case 'shortest-time':
      return edge.type === 'transfer' ? edge.time * 1.5 : edge.time;
    case 'min-transfers':
      return edge.type === 'transfer' ? 100 : edge.stationCount ?? 1;
    case 'lowest-fare':
      return edge.fare * 10 + (edge.type === 'transfer' ? 5 : 0);
    default:
      return edge.time;
  }
}

export function findRoute(
  startStationId: string,
  endStationId: string,
  strategy: RouteStrategy,
  blockedStations: string[] = [],
  timePeriod: TimePeriod = 'off-peak',
): RouteResult | null {
  if (startStationId === endStationId) return null;

  const blocked = new Set(blockedStations);
  if (blocked.has(startStationId) || blocked.has(endStationId)) return null;

  const startStation = getStationById(startStationId);
  const endStation = getStationById(endStationId);
  if (!startStation || !endStation) return null;

  const adjacency = buildAdjacencyList(blocked, timePeriod);

  const dist = new Map<string, number>();
  const bestPath = new Map<string, PathNode>();
  const pq = new PriorityQueue<PathNode>();

  for (const lineId of startStation.lines) {
    const startNode: GraphNode = { stationId: startStationId, lineId };
    const key = nodeKey(startNode);
    const initial: PathNode = {
      node: startNode,
      prev: null,
      edge: null,
      cost: 0,
      time: 0,
      fare: fareConfig.baseFare,
      transfers: 0,
      stationCount: 0,
    };
    dist.set(key, 0);
    bestPath.set(key, initial);
    pq.enqueue(initial, 0);
  }

  let foundPath: PathNode | null = null;
  let bestCost = Infinity;

  while (!pq.isEmpty()) {
    const current = pq.dequeue();
    if (!current) break;

    const curKey = nodeKey(current.node);
    if (current.cost > (dist.get(curKey) ?? Infinity)) continue;

    if (current.node.stationId === endStationId) {
      if (current.cost < bestCost) {
        bestCost = current.cost;
        foundPath = current;
      }
      continue;
    }

    const edges = adjacency.get(curKey) ?? [];
    for (const edge of edges) {
      const toKey = nodeKey(edge.to);
      const weight = computeEdgeWeight(edge, strategy);
      const newCost = current.cost + weight;

      if (newCost < (dist.get(toKey) ?? Infinity)) {
        dist.set(toKey, newCost);
        const newNode: PathNode = {
          node: edge.to,
          prev: current,
          edge,
          cost: newCost,
          time: current.time + edge.time,
          fare: current.fare + edge.fare,
          transfers: current.transfers + (edge.type === 'transfer' ? 1 : 0),
          stationCount: current.stationCount + (edge.stationCount ?? 0),
        };
        bestPath.set(toKey, newNode);
        pq.enqueue(newNode, newCost);
      }
    }
  }

  if (!foundPath) return null;
  return buildRouteResult(foundPath, timePeriod);
}

function buildRouteResult(pathNode: PathNode, timePeriod: TimePeriod): RouteResult {
  const segments: PathSegment[] = [];
  const transfers: TransferInfo[] = [];

  const edges: GraphEdge[] = [];
  let cur: PathNode | null = pathNode;
  while (cur && cur.edge) {
    edges.unshift(cur.edge);
    cur = cur.prev;
  }

  let currentSegment: PathSegment | null = null;

  for (const edge of edges) {
    if (edge.type === 'travel') {
      if (!currentSegment || currentSegment.line !== edge.from.lineId) {
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = {
          fromStation: edge.from.stationId,
          toStation: edge.to.stationId,
          line: edge.from.lineId,
          stationCount: edge.stationCount ?? 1,
          travelTime: edge.time,
          fare: edge.fare,
        };
      } else {
        currentSegment.toStation = edge.to.stationId;
        currentSegment.stationCount += edge.stationCount ?? 1;
        currentSegment.travelTime += edge.time;
        currentSegment.fare += edge.fare;
      }
    } else if (edge.type === 'transfer') {
      if (currentSegment) {
        segments.push(currentSegment);
        currentSegment = null;
      }
      const station = getStationById(edge.from.stationId);
      const channel = getTransferChannel(edge.from.stationId, edge.from.lineId, edge.to.lineId);
      transfers.push({
        station: edge.from.stationId,
        fromLine: edge.from.lineId,
        toLine: edge.to.lineId,
        walkTime: edge.time,
        penalty: station?.isHub ? fareConfig.hubTransferSurcharge : 0.5,
      });
      void channel;
    }
  }

  if (currentSegment) {
    segments.push(currentSegment);
  }

  let totalFare = Math.min(
    Math.max(pathNode.fare, fareConfig.minFare),
    fareConfig.maxFare,
  );
  totalFare = Math.round(totalFare * 100) / 100;

  void timePeriod;

  return {
    segments,
    transfers,
    totalTime: pathNode.time,
    totalFare,
    transferCount: pathNode.transfers,
    stationCount: pathNode.stationCount,
    strategy: pathNode.strategy ?? 'shortest-time',
  };
}

export function findAllRoutes(
  startStationId: string,
  endStationId: string,
  blockedStations: string[] = [],
  timePeriod: TimePeriod = 'off-peak',
): Map<RouteStrategy, RouteResult | null> {
  const strategies: RouteStrategy[] = ['shortest-time', 'min-transfers', 'lowest-fare'];
  const results = new Map<RouteStrategy, RouteResult | null>();

  for (const strategy of strategies) {
    const result = findRoute(startStationId, endStationId, strategy, blockedStations, timePeriod);
    if (result) {
      result.strategy = strategy;
    }
    results.set(strategy, result);
  }

  return results;
}

export { type GraphNode, type GraphEdge };
