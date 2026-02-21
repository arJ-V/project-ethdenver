import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const DEFAULT_STATE = {
  cursors: {
    adiBlock: 0,
    hederaBlock: 0,
    hederaMirrorTs: null,
  },
  processedKeys: [],
  orders: {},
  events: [],
  meta: {
    lastPollAt: null,
    lastPollError: null,
  },
};

export function createReadModelStore(filePath) {
  const resolved = path.resolve(filePath);
  const dir = path.dirname(resolved);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let state = loadState(resolved);

  function persist() {
    writeFileSync(resolved, JSON.stringify(state, null, 2));
  }

  return {
    getState() {
      return state;
    },
    setPollMeta(meta) {
      state.meta = { ...state.meta, ...meta };
      persist();
    },
    getCursor(name) {
      return state.cursors[name] ?? 0;
    },
    setCursor(name, value) {
      state.cursors[name] = value;
      persist();
    },
    hasProcessed(key) {
      return state.processedKeys.includes(key);
    },
    markProcessed(key) {
      if (!state.processedKeys.includes(key)) {
        state.processedKeys.push(key);
        // Keep bounded history to avoid unbounded growth.
        if (state.processedKeys.length > 50_000) {
          state.processedKeys = state.processedKeys.slice(-40_000);
        }
        persist();
      }
    },
    addEvent(event) {
      state.events.push(event);
      if (state.events.length > 20_000) {
        state.events = state.events.slice(-15_000);
      }
      persist();
    },
    upsertOrder(optionId, patch) {
      const id = String(optionId);
      state.orders[id] = {
        optionId: id,
        ...state.orders[id],
        ...patch,
      };
      persist();
    },
    getOrder(optionId) {
      return state.orders[String(optionId)] || null;
    },
    listOrders({ writer, buyer, status } = {}) {
      return Object.values(state.orders)
        .filter((o) => (writer ? eqAddr(o.writer, writer) : true))
        .filter((o) => (buyer ? eqAddr(o.buyer, buyer) : true))
        .filter((o) => (status ? String(o.statusLabel || "").toLowerCase() === String(status).toLowerCase() : true))
        .sort((a, b) => Number(b.optionId) - Number(a.optionId));
    },
    getTimeline(optionId, linkedAddresses = []) {
      const id = String(optionId);
      const addrSet = new Set(linkedAddresses.map((a) => String(a || "").toLowerCase()).filter(Boolean));
      return state.events
        .filter((e) => {
          if (e.optionId && String(e.optionId) === id) return true;
          if (e.source !== "adi") return false;
          const owner = String(e.owner || "").toLowerCase();
          const beneficiary = String(e.beneficiary || "").toLowerCase();
          return addrSet.has(owner) || addrSet.has(beneficiary);
        })
        .sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
    },
  };
}

function loadState(filePath) {
  if (!existsSync(filePath)) return structuredClone(DEFAULT_STATE);
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      cursors: { ...DEFAULT_STATE.cursors, ...(parsed.cursors || {}) },
      meta: { ...DEFAULT_STATE.meta, ...(parsed.meta || {}) },
      processedKeys: Array.isArray(parsed.processedKeys) ? parsed.processedKeys : [],
      orders: parsed.orders || {},
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function eqAddr(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
