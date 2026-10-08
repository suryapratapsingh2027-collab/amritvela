'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import {
  LayoutDashboard,
  Package,
  HeartHandshake,
  Users,
  MessageCircle,
  BookOpen,
  LogOut,
  Truck,
  Plus,
  Save,
} from 'lucide-react';

type NavItem = [
  string,
  string,
  React.ComponentType<{ size?: number }>
];

const nav: NavItem[] = [
  ['overview', 'Overview', LayoutDashboard],
  ['products', 'Products', Package],
  ['orders', 'Orders', Truck],
  ['donations', 'Donations', HeartHandshake],
  ['customers', 'Customers', Users],
  ['conversations', 'Support', MessageCircle],
  ['knowledge', 'AI Knowledge', BookOpen],
];

export default function Admin() {
  const router = useRouter();

  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [donations, setDonations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [convos, setConvos] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [
        s,
        p,
        o,
        d,
        c,
        cv,
        k,
      ] = await Promise.all([
        api<any>('/api/admin/stats'),
        api<any[]>('/api/admin/products'),
        api<any[]>('/api/admin/orders'),
        api<any[]>('/api/admin/donations'),
        api<any[]>('/api/admin/customers'),
        api<any[]>('/api/admin/conversations'),
        api<any[]>('/api/admin/knowledge'),
      ]);

      setStats(s ?? null);
      setProducts(p ?? []);
      setOrders(o ?? []);
      setDonations(d ?? []);
      setCustomers(c ?? []);
      setConvos(cv ?? []);
      setKnowledge(k ?? []);
    } catch (error) {
      console.error('Admin data load failed:', error);
      localStorage.removeItem('trust_token');
      router.replace('/login');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem('trust_token')) {
      router.replace('/login');
    } else {
      load();
    }
  }, [router]);

  async function saveProduct(p: any) {
    const {
      id,
      createdAt,
      updatedAt,
      ...data
    } = p;

    await api(`/api/admin/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });

    await load();
  }

  async function addProduct() {
    const p = await api<any>('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New Product',
        slug: `product-${Date.now()}`,
        description: 'Add product description',
        price: 0,
        stock: 0,
        category: 'General',
        active: true,
      }),
    });

    if (p) {
      setProducts((current) => [p, ...current]);
    }
  }

  async function ship(id: string) {
    try {
      await api(`/api/admin/orders/${id}/ship`, {
        method: 'POST',
      });

      await load();
    } catch (error: any) {
      alert(error.message);
    }
  }

  async function mode(id: string, modeValue: string) {
    await api(`/api/admin/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        mode: modeValue,
      }),
    });

    await load();
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center">
        Loading admin…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f2]">
      <aside className="fixed hidden h-screen w-64 border-r bg-white p-5 lg:block">
        <div className="px-3 py-4 font-extrabold">
          TRUST
          <span className="text-neutral-400">
            CONNECT
          </span>
        </div>

        <div className="mt-7 space-y-1">
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${
                tab === key
                  ? 'bg-black text-white'
                  : 'hover:bg-neutral-100'
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            localStorage.removeItem('trust_token');
            router.push('/login');
          }}
          className="absolute bottom-5 left-5 flex items-center gap-3 px-3 text-sm text-neutral-500"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </aside>

      <section className="lg:ml-64">
        <header className="sticky top-0 z-10 border-b bg-[#f5f5f2]/90 px-5 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                Admin Console
              </div>

              <h1 className="mt-1 text-2xl font-extrabold">
                {nav.find((item) => item[0] === tab)?.[1]}
              </h1>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-bold text-white">
              {stats?.pendingPayments ?? 0} pending payments
            </span>
          </div>
        </header>

        <div className="p-5 md:p-8">
          {/* OVERVIEW */}
          {tab === 'overview' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ['Orders', stats?.orders ?? 0],
                  ['Donations', stats?.donations ?? 0],
                  ['Customers', stats?.customers ?? 0],
                  ['Revenue', `₹${stats?.revenue ?? 0}`],
                  ['Donated', `₹${stats?.donationTotal ?? 0}`],
                ].map(([title, value]) => (
                  <div
                    key={String(title)}
                    className="rounded-3xl border bg-white p-6"
                  >
                    <div className="mt-3 text-3xl font-extrabold">
                      {value}
                    </div>

                    <div className="mt-1 text-sm text-neutral-500">
                      {title}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border bg-white p-6">
                  <h2 className="font-bold">
                    Connected workflows
                  </h2>

                  <div className="mt-5 space-y-3">
                    {[
                      'WhatsApp Cloud API',
                      'AI assistant + knowledge base',
                      'Razorpay payments',
                      'Order + inventory management',
                      'Shiprocket shipment tracking',
                      'Human support handover',
                    ].map((item) => (
                      <div
                        className="rounded-xl bg-neutral-100 p-3 text-sm font-semibold"
                        key={item}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border bg-white p-6">
                  <h2 className="font-bold">
                    Production checklist
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-neutral-500">
                    Set real provider credentials, set
                    MOCK_PROVIDERS=false, deploy API and web,
                    run Prisma migrations and seed once, then
                    configure Meta/Razorpay/Shiprocket webhooks.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* PRODUCTS */}
          {tab === 'products' && (
            <div className="rounded-3xl border bg-white p-6">
              <div className="mb-5 flex justify-between">
                <h2 className="font-bold">
                  Product catalogue
                </h2>

                <button
                  type="button"
                  onClick={addProduct}
                  className="btn btn-dark"
                >
                  <Plus size={16} />
                  Add product
                </button>
              </div>

              <div className="space-y-3">
                {products.map((product) => (
                  <ProductRow
                    key={product.id}
                    p={product}
                    onSave={saveProduct}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ORDERS */}
          {tab === 'orders' && (
            <div className="space-y-3">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-3xl border bg-white p-5"
                >
                  <div className="flex flex-col justify-between gap-3 md:flex-row">
                    <div>
                      <b>{order.orderNumber}</b>

                      <div className="mt-1 text-sm text-neutral-500">
                        {order.user?.name ||
                          order.user?.phone}{' '}
                        · ₹{order.total}
                      </div>
                    </div>

                    <div className="flex gap-2 text-xs font-bold">
                      <span className="rounded-full bg-neutral-100 px-3 py-2">
                        {order.paymentStatus}
                      </span>

                      <span className="rounded-full bg-neutral-100 px-3 py-2">
                        {order.status}
                      </span>

                      {order.paymentStatus === 'PAID' &&
                        order.status !== 'SHIPPED' &&
                        order.status !== 'DELIVERED' && (
                          <button
                            type="button"
                            className="btn btn-dark py-2"
                            onClick={() =>
                              ship(order.id)
                            }
                          >
                            Create shipment
                          </button>
                        )}
                    </div>
                  </div>

                  <div className="mt-4 text-sm text-neutral-600">
                    {order.items?.map((item: any) => (
                      <div key={item.id}>
                        {item.product.name} ×{' '}
                        {item.quantity}
                      </div>
                    ))}
                  </div>

                  {order.awb && (
                    <div className="mt-3 text-sm">
                      AWB:{' '}
                      <b>{order.awb}</b> ·{' '}
                      {order.courier}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* DONATIONS */}
          {tab === 'donations' && (
            <div className="space-y-3">
              {donations.map((donation) => (
                <div
                  key={donation.id}
                  className="flex justify-between rounded-3xl border bg-white p-5"
                >
                  <div>
                    <b>{donation.reference}</b>

                    <div className="text-sm text-neutral-500">
                      {donation.user?.name ||
                        donation.user?.phone}
                    </div>
                  </div>

                  <div className="text-right">
                    <b>₹{donation.amount}</b>

                    <div className="text-xs">
                      {donation.paymentStatus}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CUSTOMERS */}
          {tab === 'customers' && (
            <div className="overflow-x-auto rounded-3xl border bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-neutral-50">
                  <tr>
                    <th className="p-4">
                      Customer
                    </th>
                    <th>Phone</th>
                    <th>Orders</th>
                    <th>Donations</th>
                    <th>Conversations</th>
                  </tr>
                </thead>

                <tbody>
                  {customers.map((customer) => (
                    <tr
                      className="border-b last:border-0"
                      key={customer.id}
                    >
                      <td className="p-4 font-semibold">
                        {customer.name || '—'}
                      </td>

                      <td>{customer.phone}</td>

                      <td>
                        {customer._count?.orders ?? 0}
                      </td>

                      <td>
                        {customer._count?.donations ?? 0}
                      </td>

                      <td>
                        {customer._count?.conversations ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CONVERSATIONS */}
          {tab === 'conversations' && (
            <div className="space-y-3">
              {convos.map((conversation) => (
                <div
                  key={conversation.id}
                  className="rounded-3xl border bg-white p-5"
                >
                  <div className="flex flex-col justify-between gap-3 md:flex-row">
                    <div>
                      <b>
                        {conversation.user?.name ||
                          conversation.user?.phone}
                      </b>

                      <div className="mt-1 text-xs text-neutral-400">
                        {conversation.messages?.length ??
                          0}{' '}
                        recent messages
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <span className="rounded-full bg-neutral-100 px-3 py-2 text-xs font-bold">
                        {conversation.mode}
                      </span>

                      {conversation.mode !== 'HUMAN' && (
                        <button
                          type="button"
                          onClick={() =>
                            mode(
                              conversation.id,
                              'HUMAN'
                            )
                          }
                          className="btn btn-dark py-2"
                        >
                          Take over
                        </button>
                      )}

                      {conversation.mode === 'HUMAN' && (
                        <button
                          type="button"
                          onClick={() =>
                            mode(
                              conversation.id,
                              'AI'
                            )
                          }
                          className="btn btn-light py-2"
                        >
                          Return to AI
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {conversation.messages
                      ?.slice(0, 6)
                      .reverse()
                      .map((message: any) => (
                        <div
                          key={message.id}
                          className="rounded-xl bg-neutral-100 p-3 text-sm"
                        >
                          <b>
                            {message.direction === 'IN'
                              ? 'Customer'
                              : 'Assistant'}
                            :
                          </b>{' '}
                          {message.text}
                        </div>
                      ))}

                    <ReplyBox
                      id={conversation.id}
                      reload={load}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* KNOWLEDGE */}
          {tab === 'knowledge' && (
            <Knowledge
              docs={knowledge}
              reload={load}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function ProductRow({
  p,
  onSave,
}: {
  p: any;
  onSave: (p: any) => void;
}) {
  const [x, setX] = useState(p);

  return (
    <div className="rounded-2xl border p-4">
      <div className="grid gap-3 md:grid-cols-6">
        <input
          className="input"
          value={x.name}
          onChange={(e) =>
            setX({
              ...x,
              name: e.target.value,
            })
          }
        />

        <input
          className="input"
          value={x.price}
          type="number"
          onChange={(e) =>
            setX({
              ...x,
              price: Number(e.target.value),
            })
          }
        />

        <input
          className="input"
          value={x.stock}
          type="number"
          onChange={(e) =>
            setX({
              ...x,
              stock: Number(e.target.value),
            })
          }
        />

        <input
          className="input"
          value={x.category || ''}
          onChange={(e) =>
            setX({
              ...x,
              category: e.target.value,
            })
          }
        />

        <input
          className="input"
          value={x.imageUrl || ''}
          onChange={(e) =>
            setX({
              ...x,
              imageUrl: e.target.value,
            })
          }
          placeholder="Image URL / /assets/..."
        />

        <button
          type="button"
          className="btn btn-dark"
          onClick={() => onSave(x)}
        >
          <Save size={15} />
          Save
        </button>
      </div>

      <textarea
        className="input mt-3"
        value={x.description}
        onChange={(e) =>
          setX({
            ...x,
            description: e.target.value,
          })
        }
      />

      {x.imageUrl && (
        <div className="mt-3 text-xs text-neutral-500">
          Image: {x.imageUrl}
        </div>
      )}
    </div>
  );
}

function ReplyBox({
  id,
  reload,
}: {
  id: string;
  reload: () => void;
}) {
  const [text, setText] = useState('');

  async function send() {
    if (!text.trim()) return;

    try {
      await api(
        `/api/admin/conversations/${id}/reply`,
        {
          method: 'POST',
          body: JSON.stringify({ text }),
        }
      );

      setText('');
      reload();
    } catch (error: any) {
      alert(error.message);
    }
  }

  return (
    <div className="mt-4 flex gap-2">
      <input
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Reply to customer on WhatsApp…"
      />

      <button
        type="button"
        className="btn btn-dark"
        onClick={send}
      >
        Send
      </button>
    </div>
  );
}

function Knowledge({
  docs,
  reload,
}: {
  docs: any[];
  reload: () => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  async function add() {
    if (!title || !content) return;

    await api('/api/admin/knowledge', {
      method: 'POST',
      body: JSON.stringify({
        title,
        content,
      }),
    });

    setTitle('');
    setContent('');
    reload();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border bg-white p-6">
        <h2 className="font-bold">
          Add Trust knowledge
        </h2>

        <input
          className="input mt-4"
          placeholder="Document title"
          value={title}
          onChange={(e) =>
            setTitle(e.target.value)
          }
        />

        <textarea
          className="input mt-3 min-h-48"
          placeholder="Official Trust information, FAQs, policies, product/shipping details…"
          value={content}
          onChange={(e) =>
            setContent(e.target.value)
          }
        />

        <button
          type="button"
          className="btn btn-dark mt-3"
          onClick={add}
        >
          Save knowledge
        </button>
      </div>

      <div className="space-y-3">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="rounded-3xl border bg-white p-5"
          >
            <b>{doc.title}</b>

            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600">
              {doc.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}