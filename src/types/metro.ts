export type RouteStrategy = 'shortest-time' | 'min-transfers' | 'lowest-fare';

export type TimePeriod = 'morning-peak' | 'evening-peak' | 'off-peak';

export interface Station {
  id: string;
  name: string;
  x: number;
  y: number;
  lines: string[];
  isHub: boolean;
}

export interface MetroLine {
  id: string;
  name: string;
  color: string;
  stations: string[];
  baseFarePerStation: number;
}

export interface TransferChannel {
  fromStation: string;
  toStation: string;
  fromLine: string;
  toLine: string;
  walkTime: number;
  crowdFactor: number;
}

export interface Edge {
  from: string;
  to: string;
  line: string;
  baseTime: number;
}

export interface PathSegment {
  fromStation: string;
  toStation: string;
  line: string;
  stationCount: number;
  travelTime: number;
  fare: number;
}

export interface TransferInfo {
  station: string;
  fromLine: string;
  toLine: string;
  walkTime: number;
  penalty: number;
}

export interface RouteResult {
  segments: PathSegment[];
  transfers: TransferInfo[];
  totalTime: number;
  totalFare: number;
  transferCount: number;
  stationCount: number;
  strategy: RouteStrategy;
}

export interface FareConfig {
  baseFare: number;
  perStationRate: number;
  peakSurcharge: number;
  hubTransferSurcharge: number;
  maxFare: number;
  minFare: number;
}

export type PassengerType = 'adult' | 'student' | 'elderly' | 'child';

export interface PassengerFareRule {
  type: PassengerType;
  label: string;
  icon: string;
  discount: number;
  maxFare: number;
  minFare: number;
  description: string;
}

export interface PassengerCount {
  adult: number;
  student: number;
  elderly: number;
  child: number;
}

export interface FareCalculationResult {
  baseFarePerPerson: number;
  passengers: {
    type: PassengerType;
    count: number;
    unitPrice: number;
    subtotal: number;
  }[];
  totalPassengers: number;
  totalFare: number;
  totalDiscount: number;
}
