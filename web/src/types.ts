export type ConstellationKey = 'starlink' | 'oneweb' | 'kuiper';

export interface TLERecord {
  name: string;
  noradId: string;
  line1: string;
  line2: string;
}

export interface TLEData {
  starlink: TLERecord[];
  oneweb: TLERecord[];
  kuiper: TLERecord[];
}

export interface Station {
  lat: number;
  lon: number;
  alt: number; // meters above sea level
}

export interface PassSample {
  t: number;           // Unix timestamp ms
  az: number;          // degrees, 0=N clockwise
  el: number;          // degrees above horizon
  rangeKm: number;
  delayMs: number;     // one-way propagation delay
  rangeRateKms: number; // km/s, negative = approaching
  dopplerKhz: number;  // kHz, positive = blue-shifted (approaching)
  satLat: number;      // satellite sub-point latitude
  satLon: number;      // satellite sub-point longitude
}

export interface Pass {
  id: string;
  sat: { name: string; noradId: string };
  constellation: ConstellationKey;
  aos: number;      // Unix ms — Acquisition of Signal
  los: number;      // Unix ms — Loss of Signal
  tca: number;      // Unix ms — Time of Closest Approach (max elevation)
  maxEl: number;    // degrees
  aosAz: number;    // degrees
  losAz: number;    // degrees
  samples: PassSample[];
}

export interface PassSettings {
  windowMin: number;
  minElDeg: number;
  activeConstellations: ConstellationKey[];
  freqGHz: Record<ConstellationKey, number>;
}

export type WorkerInMessage =
  | { type: 'FIND_PASSES'; tles: TLEData; station: Station; settings: PassSettings; startTime: number };

export type WorkerOutMessage =
  | { type: 'PASSES_RESULT'; passes: Pass[] }
  | { type: 'PROGRESS'; constellation: ConstellationKey; found: number };
