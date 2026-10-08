'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus, ShoppingBag, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import PublicShell from '../../components/PublicShell';

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category?: string;
  imageUrl?: string | null;
};

type CartItem = {
  product: Product;
  quantity: number;
};

function getFallbackImage(product: Product) {
  const text = `${product.name} ${product.category || ''}`.toLowerCase();

  if (
    text.includes('shirt') ||
    text.includes('apparel') ||
    text.includes('t-shirt')
  ) {
    return '/assets/product-tshirt.png';
  }

  if (text.includes('kada') || text.includes('bangle')) {
    return '/assets/product-kada.png';
  }

  return null;
}

export default function Shop() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    api<Product[]>('/api/products')
      .then((data) => setProducts(data ?? []))
      .catch((error) => {
        console.error('Product load failed:', error);
        setProducts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  function addToCart(product: Product) {
    if (!product.stock) return;

    setAddingId(product.id);

    try {
      const saved = localStorage.getItem('amritvela_cart');

      let cart: CartItem[] = [];

      try {
        cart = saved ? JSON.parse(saved) : [];
      } catch {
        cart = [];
      }

      const existing = cart.find(
        (item) => item.product.id === product.id
      );

      const nextCart = existing
        ? cart.map((item) =>
            item.product.id === product.id
              ? {
                  ...item,
                  quantity: Math.min(
                    product.stock,
                    item.quantity + 1
                  ),
                }
              : item
          )
        : [...cart, { product, quantity: 1 }];

      localStorage.setItem(
        'amritvela_cart',
        JSON.stringify(nextCart)
      );

      window.dispatchEvent(new Event('cart-updated'));

      router.push('/cart');
    } catch (error) {
      console.error('Unable to add product to cart:', error);
      setAddingId(null);
      alert('Unable to add this resource to your cart.');
    }
  }

  return (
    <PublicShell>
      <main>
        {/* HERO */}
        <section className="shop-hero">
          <div className="container shop-hero-inner">
            <div>
              <span className="section-kicker light">
                <span>01</span> Seva resources
              </span>

              <h1>
                Resources with <em>a purpose.</em>
              </h1>

              <p>
                Explore Trust resources and support the Trust&apos;s
                ongoing seva journey. Product availability and pricing
                are managed through the Trust catalogue.
              </p>
            </div>

            <div className="shop-hero-badge">
              <Sparkles size={20} />

              <div>
                Every purchase supports the{' '}
                <strong>Trust ecosystem</strong>
              </div>
            </div>
          </div>
        </section>

        {/* PRODUCT COLLECTION */}
        <section className="section">
          <div className="container">
            <div className="shop-toolbar">
              <div>
                <span className="section-kicker">
                  <span>02</span> Trust collection
                </span>

                <h2>Available resources</h2>
              </div>

              <Link
                href="/cart"
                className="btn btn-primary"
              >
                <ShoppingBag size={17} />
                View cart
                <ArrowRight size={15} />
              </Link>
            </div>

            {loading ? (
              <div className="shop-loading">
                Loading Trust resources…
              </div>
            ) : products.length === 0 ? (
              <div className="empty-products">
                <ShoppingBag size={42} />

                <h3>
                  Resources are being prepared.
                </h3>

                <p>
                  The Trust&apos;s resources will appear here once
                  products are added by the admin catalogue.
                </p>

                <Link
                  href="/contact"
                  className="text-link"
                >
                  Contact the Trust
                  <ArrowRight size={15} />
                </Link>
              </div>
            ) : (
              <div className="product-grid">
                {products.map((product) => {
                  const image =
                    product.imageUrl ||
                    getFallbackImage(product);

                  return (
                    <div
                      key={product.id}
                      className="premium-product-card"
                    >
                      {/* PRODUCT IMAGE */}
                      <div className="product-image">
                        {image ? (
                          <img
                            src={image}
                            alt={product.name}
                          />
                        ) : (
                          <div className="product-image-placeholder">
                            <ShoppingBag size={44} />
                          </div>
                        )}

                        <span className="product-category">
                          {product.category ||
                            'Trust Resource'}
                        </span>
                      </div>

                      {/* PRODUCT CONTENT */}
                      <div className="product-content">
                        <h3>{product.name}</h3>

                        <p>{product.description}</p>

                        <div className="product-bottom">
                          <div>
                            <span className="product-price">
                              ₹{product.price}
                            </span>

                            <small>
                              {product.stock > 0
                                ? `${product.stock} available`
                                : 'Out of stock'}
                            </small>
                          </div>

                          <button
                            type="button"
                            className="product-add-btn"
                            disabled={
                              !product.stock ||
                              addingId === product.id
                            }
                            onClick={() =>
                              addToCart(product)
                            }
                          >
                            <Plus size={16} />

                            {addingId === product.id
                              ? 'Adding…'
                              : product.stock
                                ? 'Add to cart'
                                : 'Out of stock'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* SUPPLIED PRODUCT IMAGERY */}
        <section className="section section-soft">
          <div className="container">
            <div className="inner-section-head">
              <span className="section-kicker">
                <span>03</span> Supplied product imagery
              </span>

              <h2>
                Trust resources, presented{' '}
                <em>properly.</em>
              </h2>

              <p>
                The supplied product visuals are included in the
                website asset library and automatically used for
                matching apparel or kada/bangle catalogue entries
                when no admin image is provided.
              </p>
            </div>

            <div className="editorial-grid">
              {/* T-SHIRT */}
              <div className="editorial-card">
                <img
                  src="/assets/product-tshirt.png"
                  alt="Amritvela Trust T-Shirt"
                />

                <div>
                  <span>Trust apparel</span>

                  <strong>
                    Amritvela T-Shirt
                  </strong>
                </div>
              </div>

              {/* KADA / BANGLE */}
              <div className="editorial-card">
                <img
                  src="/assets/product-kada.png"
                  alt="Amritvela kada / bangle product"
                />

                <div>
                  <span>Trust resource</span>

                  <strong>
                    Kada / bangle imagery supplied by the Trust
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}