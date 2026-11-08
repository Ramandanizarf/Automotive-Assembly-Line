// Pembungkus REST API. Semua fungsi mengembalikan field "data" dari respons backend.
const BASE = (globalThis.MES_API_BASE ?? "") + "/api";

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const err = new Error(json?.error?.message || `HTTP ${res.status}`);
    err.details = json?.error?.details;
    throw err;
  }
  return json.data;
}

export const api = {
  createWorkOrder: (body) => request("POST", "/work-orders", body),
  finishUnit: (body) => request("POST", "/units/finish", body),
  downtimeStart: (workOrderId, station = "assembly") => request("POST", "/downtime/start", { work_order_id: workOrderId, station }),
  downtimeEnd: (workOrderId) => request("POST", "/downtime/end", { work_order_id: workOrderId }),
  dashboard: (workOrderId) => request("GET", "/dashboard" + (workOrderId ? `?work_order_id=${workOrderId}` : "")),
  events: (workOrderId, limit = 15) => request("GET", `/events?work_order_id=${workOrderId}&limit=${limit}`),
  reset: (workOrderId) => request("POST", "/reset", { work_order_id: workOrderId }),
};
