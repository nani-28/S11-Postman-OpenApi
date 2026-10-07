const express = require('express');
const db = require('./db');

const app = express();
const port = Number(process.env.PORT) || 3000;
const breakTotalCentsType = process.env.BREAK_TOTAL_CENTS === '1';

db.initDatabase();
app.use(express.json());

function sendError(res, error) {
  if (error && error.status) {
    res.status(error.status).json({ error: error.message, code: error.code || 'ERROR' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor.', code: 'INTERNAL' });
}

function parsePage(query) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    const error = new db.HttpError(400, 'Los parámetros de paginación no son válidos.', 'INVALID_PAGE');
    throw error;
  }
  return { page, pageSize };
}

function readToken(req) {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function requireUser(req, res, next) {
  const token = readToken(req);
  if (!token) {
    res.status(401).json({ error: 'Falta el token de autorización.', code: 'MISSING_TOKEN' });
    return;
  }
  const user = db.findUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'El token no es válido.', code: 'INVALID_TOKEN' });
    return;
  }
  req.user = user;
  next();
}

function shapeOrder(order) {
  if (!order) return order;
  if (!breakTotalCentsType) return order;
  return { ...order, totalCents: String(order.totalCents) };
}

app.post('/api/test/reset', (req, res) => {
  res.json(db.resetDatabase());
});

app.post('/api/auth/login', (req, res) => {
  try {
    const email = req.body && req.body.email;
    const password = req.body && req.body.password;
    if (!email || !password) {
      throw new db.HttpError(400, 'email y password son obligatorios.', 'MISSING_FIELDS');
    }
    res.json(db.login(email, password));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/products', (req, res) => {
  try {
    const { page, pageSize } = parsePage(req.query);
    res.json(db.listProducts(page, pageSize));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/products/:id', (req, res) => {
  const id = Number(req.params.id);
  const product = db.getProductById(id);
  if (!product) {
    res.status(404).json({ error: 'No se encontró el producto.', code: 'PRODUCT_NOT_FOUND' });
    return;
  }
  res.json(product);
});

app.get('/api/orders', requireUser, (req, res) => {
  try {
    const { page, pageSize } = parsePage(req.query);
    res.json(db.listOrders(req.user.id, page, pageSize));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/orders/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'El identificador de la orden no es válido.', code: 'INVALID_ID' });
    return;
  }

  const order = db.getOrderById(id);
  if (!order) {
    res.status(404).json({ error: 'No se encontró la orden.', code: 'ORDER_NOT_FOUND' });
    return;
  }
  if (order.userId !== req.user.id) {
    res.status(403).json({ error: 'No puedes ver un pedido ajeno.', code: 'FORBIDDEN' });
    return;
  }
  res.json(shapeOrder(order));
});

app.post('/api/orders', requireUser, (req, res) => {
  try {
    const order = db.createOrder(req.user.id, req.body);
    res.status(201).json(shapeOrder(order));
  } catch (error) {
    sendError(res, error);
  }
});

app.put('/api/orders/:id/cancel', requireUser, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new db.HttpError(400, 'El identificador de la orden no es válido.', 'INVALID_ID');
    }
    const result = db.cancelOrder(req.user.id, id);
    res.json({
      order: shapeOrder(result.order),
      repeated: result.repeated,
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.', code: 'NOT_FOUND' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Cafetería S11 escuchando en http://127.0.0.1:${port}`);
    if (breakTotalCentsType) {
      console.log('MODO INCOMPATIBLE: totalCents se serializa como string');
    }
  });
}

module.exports = app;
