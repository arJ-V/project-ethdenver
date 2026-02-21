export interface RwaAsset {
  id: string;
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  telemetrySiteId: number;
}

export const rwaAssets: RwaAsset[] = [
  { id: "ctx", symbol: "CTX", name: "Conduit Index", price: 2450.21, changePct: 2.4, telemetrySiteId: 1 },
  { id: "sola", symbol: "SOLA", name: "Solaris Yield", price: 84.5, changePct: -1.2, telemetrySiteId: 1 },
  { id: "reit", symbol: "REIT", name: "Urban Prime", price: 1120, changePct: 0.5, telemetrySiteId: 2 },
  { id: "neo", symbol: "NEO", name: "Neo Genesis", price: 45.12, changePct: 1.8, telemetrySiteId: 2 },
  { id: "lqd", symbol: "LQD", name: "Liquid Flow", price: 12.05, changePct: -0.8, telemetrySiteId: 3 },
  { id: "wnd", symbol: "WND", name: "Wind Harvest", price: 67.9, changePct: 1.1, telemetrySiteId: 4 },
  { id: "meta", symbol: "META", name: "Meta Grid", price: 234.55, changePct: 3.2, telemetrySiteId: 4 },
];
