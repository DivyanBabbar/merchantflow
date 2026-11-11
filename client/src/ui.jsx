import { useCallback, useEffect, useRef, useState } from 'react';
import { formatRupees, parseRupees } from './money.js';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export default function App() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productStock, setProductStock] = useState('10');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const orderKey = useRef(null);
  const refresh = useCallback(async () => {
    const [p, o] = await Promise.all([fetch(`${API}/api/v1/products`), fetch(`${API}/api/v1/orders`)]);
    if (!p.ok || !o.ok) throw new Error('Could not load the seller desk. Is the API running?');
    const nextProducts = await p.json();
    setProducts(nextProducts);
    setSelectedProductId(current => nextProducts.some(product => String(product.id) === current) ? current : String(nextProducts[0]?.id ?? ''));
    setOrders(await o.json());
  }, []);

  useEffect(() => {
    refresh().catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [refresh]);

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

  async function createProduct(event) {
    event.preventDefault();
    const priceCents = parseRupees(productPrice);
    const stock = Number(productStock);
    if (priceCents === null) { setError('Enter a price in rupees with up to two decimal places.'); return; }
    if (!Number.isSafeInteger(stock) || stock < 0) { setError('Stock must be a whole number of zero or more.'); return; }
    const product = await act('/api/v1/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: productName, priceCents, stock }) });
    if (product) { setProductName(''); setProductPrice(''); setProductStock('10'); setSelectedProductId(String(product.id)); }
  }

  async function createOrder(event) {
    event.preventDefault();
    if (!selectedProductId) return;
    const productId = Number(selectedProductId);
    const count = Number(quantity);
    const fingerprint = `${productId}:${count}`;
    if (!orderKey.current || orderKey.current.fingerprint !== fingerprint) {
      orderKey.current = { fingerprint, key: crypto.randomUUID() };
    }
    const result = await act('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': orderKey.current.key },
      body: JSON.stringify({ productId, quantity: count })
    });
    if (result) orderKey.current = null;
  }

  const paid = orders.filter(o => o.status === 'PAID').length;
  const total = orders.reduce((sum, o) => sum + (o.status === 'PAID' ? o.amountCents : 0), 0);

  return <main className="shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">M</span> merchantflow</a><span className="env"><i /> Local simulation</span></header>
    <section className="intro" id="top"><div><p className="eyebrow">SELLER OPERATIONS</p><h1>Order desk</h1><p className="lede">A clear view of orders, payment events, and the ledger behind each sale.</p></div><div className="intro-note"><span className="pulse" /> Sandbox mode <small>No real payments are processed</small></div></section>
    {error && <div className="alert" role="alert">{error}</div>}
    <section className="metrics" aria-label="Store summary"><article className="metric"><span>Orders</span><strong>{orders.length}</strong><small>All order states</small></article><article className="metric"><span>Paid orders</span><strong>{paid}</strong><small>Successful simulations</small></article><article className="metric"><span>Captured volume</span><strong>{formatRupees(total)}</strong><small>Paid orders only</small></article></section>
    <section className="workspace">
      <form className="panel product-panel" onSubmit={createProduct}>
        <div className="panel-head"><div><p className="eyebrow">CATALOG</p><h2>Add a product</h2></div><span className="step">01</span></div>
        <label className="stack-field">Product name<input required maxLength="120" value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Canvas tote" /></label>
        <div className="field-row"><label className="stack-field">Price (INR)<input required inputMode="decimal" value={productPrice} onChange={e => setProductPrice(e.target.value)} placeholder="499.00" /></label><label className="stack-field">Initial stock<input required type="number" min="0" step="1" value={productStock} onChange={e => setProductStock(e.target.value)} /></label></div>
        <button className="primary" disabled={busy}>{busy ? 'Working…' : 'Add to catalog'} <span>→</span></button>
        <p className="hint">Prices are converted to integer paise before they reach the API.</p>
      </form>
      <form className="panel order-panel" onSubmit={createOrder}><div className="panel-head"><div><p className="eyebrow">CHECKOUT SIMULATOR</p><h2>Create an order</h2></div><span className="step">02</span></div>
        {products.length ? <><label className="stack-field">Product<select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>{products.map(product => <option key={product.id} value={product.id}>{product.name} · {formatRupees(product.priceCents)} · {product.stock} available</option>)}</select></label>
          <label className="stack-field quantity-field">Quantity<input type="number" min="1" max="100" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
          <button className="primary" disabled={busy || Number(quantity) < 1 || Number(quantity) > 100}>{busy ? 'Working…' : 'Create pending order'} <span>→</span></button></> : <div className="empty compact"><strong>{loading ? 'Loading catalog…' : 'Add a product to begin'}</strong><span>New products appear here automatically.</span></div>}
        <p className="hint">If a request times out, retrying the same order reuses its idempotency key.</p>
      </form>
      <div className="panel flow-panel"><div className="panel-head"><div><p className="eyebrow">HOW IT WORKS</p><h2>One flow, three records</h2></div><span className="step">03</span></div><div className="flow"><div className="flow-item"><b className="flow-dot violet">1</b><div><strong>Order</strong><span>Inventory is reserved in a database transaction.</span></div></div><div className="flow-line" /><div className="flow-item"><b className="flow-dot blue">2</b><div><strong>Payment event</strong><span>The local gateway simulator captures or refunds.</span></div></div><div className="flow-line" /><div className="flow-item"><b className="flow-dot green">3</b><div><strong>Ledger</strong><span>Balanced entries record the movement.</span></div></div></div></div>
    </section>
    <section className="panel table-panel"><div className="panel-head table-title"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Orders</h2></div><button type="button" className="refresh" onClick={() => refresh().catch(e => setError(e.message))}>Refresh ↻</button></div>
      {orders.length === 0 ? <div className="empty"><div className="empty-icon">⌁</div><strong>{loading ? 'Loading orders…' : 'No orders yet'}</strong><span>Create a pending order to start the demo.</span></div> : <div className="table-wrap"><table><thead><tr><th>ORDER</th><th>ITEM</th><th>AMOUNT</th><th>STATUS</th><th>LEDGER</th><th>ACTION</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td><code>{order.id.slice(0, 8)}</code></td><td>{order.productName} × {order.quantity}</td><td>{formatRupees(order.amountCents)}</td><td><span className={`badge ${order.status.toLowerCase()}`}>{order.status}</span></td><td>{order.ledgerEntries === 0 ? '—' : order.ledgerBalanced ? 'Balanced' : 'Check'}</td><td>{order.status === 'PENDING' ? <><button type="button" className="action" disabled={busy} onClick={() => act(`/api/v1/orders/${order.id}/capture`, { method: 'POST' })}>Simulate capture</button> <button type="button" className="action" disabled={busy} onClick={() => act(`/api/v1/orders/${order.id}/cancel`, { method: 'POST' })}>Cancel</button></> : order.status === 'PAID' ? <button type="button" className="action" disabled={busy} onClick={() => act(`/api/v1/orders/${order.id}/refund`, { method: 'POST' })}>Simulate refund</button> : <span className="muted">Complete</span>}</td></tr>)}</tbody></table></div>}
    </section>
    <footer><span>MerchantFlow · learning project</span><span>Local simulator · no real money</span></footer>
  </main>;
}

