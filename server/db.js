const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'cafeteria.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const SEED_PRODUCTS = [
  { id: 1, name: 'Café Americano', priceCents: 3500, stock: 20 },
  { id: 2, name: 'Cappuccino', priceCents: 4500, stock: 15 },
  { id: 3, name: 'Latte', priceCents: 4800, stock: 10 },
  { id: 4, name: 'Pastel de chocolate', priceCents: 5500, stock: 2 },
];

const SEED_USERS = [
  { id: 1, name: 'Ana', email: 'ana@cafeteria.test', password: 'demo-ana', token: 'demo-token-ana', role: 'customer' },
  { id: 2, name: 'Luis', email: 'luis@cafeteria.test', password: 'demo-luis', token: 'demo-token-luis', role: 'customer' },
];

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      stock INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders (id)
    );
  `);
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    stock: row.stock,
  };
}

function mapOrder(order, items) {
  return {
    id: order.id,
    userId: order.user_id,
    code: `ORD-${order.id}`,
    totalCents: order.total_cents,
    status: order.status,
    createdAt: order.created_at,
    items: items.map((item) => ({
      productId: item.product_id,
      name: item.product_name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.unit_price_cents * item.quantity,
    })),
  };
}

function seed() {
  const insertUser = db.prepare(
    'INSERT INTO users (id, name, email, password, token, role) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const user of SEED_USERS) {
    insertUser.run(user.id, user.name, user.email, user.password, user.token, user.role);
  }

  const insertProduct = db.prepare(
    'INSERT INTO products (id, name, price_cents, stock) VALUES (?, ?, ?, ?)',
  );
  for (const product of SEED_PRODUCTS) {
    insertProduct.run(product.id, product.name, product.priceCents, product.stock);
  }
}

function resetAutoincrement() {
  const sequence = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    .get();
  if (!sequence) return;
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('orders', 'order_items')").run();
}

function initDatabase() {
  createSchema();
  const count = db.prepare('SELECT COUNT(*) AS total FROM products').get().total;
  if (count === 0) seed();
}

function resetDatabase() {
  db.exec('DELETE FROM order_items');
  db.exec('DELETE FROM orders');
  db.exec('DELETE FROM products');
  db.exec('DELETE FROM users');
  resetAutoincrement();
  seed();
  return { ok: true, orders: 0, users: SEED_USERS.length, products: listProducts().items.length };
}

function findUserByEmail(email) {
  return db.prepare('SELECT id, name, email, password, token, role FROM users WHERE email = ?').get(email);
}

function findUserByToken(token) {
  if (!token) return null;
  return db.prepare('SELECT id, name, email, role FROM users WHERE token = ?').get(token);
}

function login(email, password) {
  const user = findUserByEmail(email);
  if (!user || user.password !== password) {
    throw new HttpError(401, 'Credenciales inválidas.', 'INVALID_CREDENTIALS');
  }
  return {
    token: user.token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

function listProducts(page = 1, pageSize = 10) {
  const totalRow = db.prepare('SELECT COUNT(*) AS total FROM products').get();
  const total = Number(totalRow.total);
  const offset = (page - 1) * pageSize;
  const items = db
    .prepare('SELECT id, name, price_cents, stock FROM products ORDER BY id LIMIT ? OFFSET ?')
    .all(pageSize, offset)
    .map(mapProduct);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function getProductById(id) {
  const row = db.prepare('SELECT id, name, price_cents, stock FROM products WHERE id = ?').get(id);
  return row ? mapProduct(row) : null;
}

function getOrderRow(id) {
  return db.prepare('SELECT id, user_id, total_cents, status, created_at FROM orders WHERE id = ?').get(id);
}

function getOrderById(id) {
  const order = getOrderRow(id);
  if (!order) return null;
  const items = db
    .prepare(
      `SELECT product_id, product_name, quantity, unit_price_cents
       FROM order_items WHERE order_id = ? ORDER BY id`,
    )
    .all(id);
  return mapOrder(order, items);
}

function listOrders(userId, page = 1, pageSize = 10) {
  const total = Number(
    db.prepare('SELECT COUNT(*) AS total FROM orders WHERE user_id = ?').get(userId).total,
  );
  const offset = (page - 1) * pageSize;
  const ids = db
    .prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY id LIMIT ? OFFSET ?')
    .all(userId, pageSize, offset)
    .map((row) => getOrderById(row.id));

  return {
    items: ids,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
  };
}

function normalizeItems(payload) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, 'El pedido no puede estar vacío.', 'EMPTY_ORDER');
  }

  const merged = new Map();
  for (const item of payload.items) {
    const productId = Number(item && item.productId);
    const quantity = Number(item && item.quantity);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new HttpError(400, 'El producto del pedido no es válido.', 'INVALID_PRODUCT');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new HttpError(400, 'La cantidad debe ser un entero mayor que cero.', 'INVALID_QUANTITY');
    }
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  return Array.from(merged, ([productId, quantity]) => ({ productId, quantity }));
}

function createOrder(userId, payload) {
  const items = normalizeItems(payload);
  const resolved = [];
  let totalCents = 0;

  for (const line of items) {
    const product = db
      .prepare('SELECT id, name, price_cents, stock FROM products WHERE id = ?')
      .get(line.productId);
    if (!product) {
      throw new HttpError(400, 'Uno de los productos no existe.', 'PRODUCT_NOT_FOUND');
    }
    if (line.quantity > product.stock) {
      throw new HttpError(
        409,
        `No hay suficientes existencias de ${product.name}. Disponibles: ${product.stock}.`,
        'OUT_OF_STOCK',
      );
    }
    totalCents += product.price_cents * line.quantity;
    resolved.push({ product, quantity: line.quantity });
  }

  const info = db
    .prepare('INSERT INTO orders (user_id, total_cents, status, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, totalCents, 'confirmed', new Date().toISOString());
  const orderId = Number(info.lastInsertRowid);

  const insertItem = db.prepare(
    `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price_cents)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');

  for (const line of resolved) {
    const updated = updateStock.run(line.quantity, line.product.id, line.quantity);
    if (updated.changes !== 1) {
      throw new HttpError(409, `No hay suficientes existencias de ${line.product.name}.`, 'OUT_OF_STOCK');
    }
    insertItem.run(orderId, line.product.id, line.product.name, line.quantity, line.product.price_cents);
  }

  return getOrderById(orderId);
}

function cancelOrder(userId, orderId) {
  const order = getOrderById(orderId);
  if (!order) {
    throw new HttpError(404, 'No se encontró la orden.', 'ORDER_NOT_FOUND');
  }
  if (order.userId !== userId) {
    throw new HttpError(403, 'No puedes cancelar un pedido ajeno.', 'FORBIDDEN');
  }

  if (order.status === 'cancelled') {
    return { order: getOrderById(orderId), repeated: true };
  }

  const restore = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
  for (const item of order.items) {
    restore.run(item.quantity, item.productId);
  }
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(orderId);
  return { order: getOrderById(orderId), repeated: false };
}

module.exports = {
  HttpError,
  initDatabase,
  resetDatabase,
  login,
  findUserByToken,
  listProducts,
  getProductById,
  listOrders,
  getOrderById,
  createOrder,
  cancelOrder,
};
