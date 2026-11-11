import { useCallback, useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const money = cents => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(cents / 100);

export default function App() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const [p, o] = await Promise.all([fetch(`${API}/api/v1/products`), fetch(`${API}/api/v1/orders`)]);
    if (!p.ok || !o.ok) throw new Error('Could not load the seller desk. Is the API running?');
    setProducts(await p.json()); setOrders(await o.json());
  }, []);

  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);

  async function act(url, options) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API}${url}`, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Request failed.');
      await refresh();
      return body;
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function createOrder() {
    if (!products.length) return;
    const key = crypto.randomUUID();
    await act('/api/v1/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ productId: products[0].id, quantity: Number(quantity) }) });
  }

  const paid = orders.filter(o => o.status === 'PAID').length;
  const total = orders.reduce((sum, o) => sum + (o.status === 'PAID' ? o.amountCents : 0), 0);

  return <main className="shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">M</span> merchantflow</a><span className="env"><i /> Local simulation</span></header>
    <section className="intro" id="top"><div><p className="eyebrow">SELLER OPERATIONS</p><h1>Order desk</h1><p className="lede">A clear view of orders, payment events, and the ledger behind each sale.</p></div><div className="intro-note"><span className="pulse" /> Sandbox mode <small>No real payments are processed</small></div></section>
    {error && <div className="alert" role="alert">{error}</div>}
    <section className="metrics" aria-label="Store summary"><article className="metric"><span>Orders</span><strong>{orders.length}</strong><small>All order states</small></article><article className="metric"><span>Paid orders</span><strong>{paid}</strong><small>Successful simulations</small></article><article className="metric"><span>Captured volume</span><strong>{money(total)}</strong><small>Paid orders only</small></article></section>
    <section className="workspace">
      <div className="panel order-panel"><div className="panel-head"><div><p className="eyebrow">CHECKOUT SIMULATOR</p><h2>Create an order</h2></div><span className="step">01</span></div>
        {products[0] ? <div className="product-card"><div className="product-icon">▧</div><div className="product-info"><strong>{products[0].name}</strong><span>{money(products[0].priceCents)} · {products[0].stock} in stock</span></div></div> : <p>No products yet.</p>}
        <label className="field">Quantity<input type="number" min="1" max="100" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <button className="primary" disabled={busy || !products.length || Number(quantity) < 1} onClick={createOrder}>{busy ? 'Working…' : 'Create pending order'} <span>→</span></button>
        <p className="hint">Every order request gets its own idempotency key. Try replaying one through the API.</p>
      </div>
      <div className="panel flow-panel"><div className="panel-head"><div><p className="eyebrow">HOW IT WORKS</p><h2>One flow, three records</h2></div><span className="step">02</span></div><div className="flow"><div className="flow-item"><b className="flow-dot violet">1</b><div><strong>Order</strong><span>Inventory is reserved in a database transaction.</span></div></div><div className="flow-line" /><div className="flow-item"><b className="flow-dot blue">2</b><div><strong>Payment event</strong><span>The local gateway simulator captures or refunds.</span></div></div><div className="flow-line" /><div className="flow-item"><b className="flow-dot green">3</b><div><strong>Ledger</strong><span>Balanced entries record the movement.</span></div></div></div></div>
    </section>
    <section className="panel table-panel"><div className="panel-head table-title"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Orders</h2></div><button className="refresh" onClick={() => refresh().catch(e => setError(e.message))}>Refresh ↻</button></div>
      {orders.length === 0 ? <div className="empty"><div className="empty-icon">⌁</div><strong>No orders yet</strong><span>Create a pending order to start the demo.</span></div> : <div className="table-wrap"><table><thead><tr><th>ORDER</th><th>ITEM</th><th>AMOUNT</th><th>STATUS</th><th>LEDGER</th><th>ACTION</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td><code>{order.id.slice(0, 8)}</code></td><td>{order.productName} × {order.quantity}</td><td>{money(order.amountCents)}</td><td><span className={`badge ${order.status.toLowerCase()}`}>{order.status}</span></td><td>{order.ledgerEntries === 0 ? '—' : order.ledgerBalanced ? 'Balanced' : 'Check'}</td><td>{order.status === 'PENDING' ? <><button className="action" disabled={busy} onClick={() => act(`/api/v1/orders/${order.id}/capture`, { method: 'POST' })}>Simulate capture</button> <button className="action" disabled={busy} onClick={() => act(`/api/v1/orders/${order.id}/cancel`, { method: 'POST' })}>Cancel</button></> : order.status === 'PAID' ? <button className="action" disabled={busy} onClick={() => act(`/api/v1/orders/${order.id}/refund`, { method: 'POST' })}>Simulate refund</button> : <span className="muted">Complete</span>}</td></tr>)}</tbody></table></div>}
    </section>
    <footer><span>MerchantFlow · learning project</span><span>Local simulator · no real money</span></footer>
  </main>;
}
